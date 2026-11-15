/** Shared validation for store-and-forward messages: text, voice, video or a photo. Video is normal quality, only compressed (not live, so no need to lower the frame rate). */
export const MAX_B64 = 12_500_000;
export const MAX_BYTES = 9_400_000; // about 9 MB: a minute of 480p video at normal frame rate, compressed
const AUDIO = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;.*)?$/i, VIDEO = /^video\/(webm|mp4)(;.*)?$/i, IMAGE = /^image\/(jpeg|png|webp)$/i;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

export const validateMime = (kind, mime) => !!({ voice: AUDIO, video: VIDEO, photo: IMAGE }[kind])?.test(String(mime));
/** The same message, but the file arrived through the resumable upload ({ mime, data } from takeUpload). */
export function parseUploaded(body, up) {
  const kind = ['voice', 'video', 'photo'].includes(body?.kind) ? body.kind : null;
  if (!kind || !up || !validateMime(kind, up.mime)) return { error: 'That upload is not complete or not allowed.' };
  return { kind, text: clean(body?.text, 300), mime: up.mime, data: up.data, seconds: kind === 'photo' ? 0 : Math.max(1, Math.min(180, Math.round(Number(body?.seconds) || 1))) };
}

/** Returns { kind, text, mime, data, seconds } or { error, status }. */
export function parseMedia(body) {
  const kind = ['text', 'voice', 'video', 'photo'].includes(body?.kind) ? body.kind : (body?.media || body?.audio ? 'voice' : 'text');
  if (kind === 'text') {
    const text = clean(body?.text, 2000);
    return text ? { kind, text, mime: 'text/plain', data: Buffer.alloc(0), seconds: 0 } : { error: 'Write a message.' };
  }
  const m = /^data:([^;]+(?:;[^;]*?)*?);base64,([A-Za-z0-9+/=]+)$/.exec(String(body?.media ?? body?.audio ?? ''));
  const ok = m && ({ voice: AUDIO, video: VIDEO, photo: IMAGE }[kind]).test(m[1]);
  if (!ok) return { error: kind === 'video' ? 'Send a video recording.' : kind === 'photo' ? 'Send a photo (JPEG, PNG or WebP).' : 'Send an audio recording.' };
  if (m[2].length > MAX_B64) return { error: 'That message is too large (about 9 MB: a minute of video).', status: 413 };
  return { kind, text: clean(body?.text, 300), mime: m[1], data: Buffer.from(m[2], 'base64'), seconds: kind === 'photo' ? 0 : Math.max(1, Math.min(180, Math.round(Number(body?.seconds) || 1))) };
}
