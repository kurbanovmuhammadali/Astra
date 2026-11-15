import React, { useEffect, useRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { Camera, Mic, Send, Square, Video as VideoIcon } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { F } from '@/theme';
import { Txt } from '@/kit/core';
import { Button, Chip, toast } from '@/kit/ui';
import { discard, enqueue, retryFailed, useOutbox } from '@/data/outbox';
import type { OutItem, Target } from '@/data/outbox';

type Kind = 'text' | 'voice' | 'video' | 'photo';
const MAX = 60;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const baseType = (t: string) => t.split(';')[0] || t;
const sameTarget = (a: Target, b: Target) => JSON.stringify(a) === JSON.stringify(b);

/** What is waiting to go out, and how far each piece got. Pieces resume after any break in the link. */
export function OutboxList({ target }: { target: Target }) {
  const items = useOutbox(t => sameTarget(t, target)).filter(i => i.state !== 'delivered' || Date.now() - i.createdAt < 60_000);
  if (!items.length) return null;
  const label = (i: OutItem) => (i.kind === 'text' ? (i.text ?? '').slice(0, 40) : i.kind === 'video' ? 'Video' : i.kind === 'photo' ? 'Photo' : 'Voice message');
  const pct = (i: OutItem) => (i.size ? Math.min(100, Math.round((i.sent / i.size) * 100)) : 0);
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      {items.map(i => (
        <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt v="caption" color={i.state === 'failed' ? K.flag : i.state === 'delivered' ? K.ok : K.ink2} style={{ flex: 1 }}>
            {label(i)} · {i.state === 'delivered' ? 'delivered' : i.state === 'failed' ? `not sent: ${i.error}` : i.size ? `${pct(i)}% sent${i.state === 'queued' ? ' · waiting for the link' : ''}` : i.state === 'queued' ? 'waiting for the link' : 'sending'}
          </Txt>
          {i.state === 'failed' ? <Button small kind="secondary" title="Retry" onPress={retryFailed} /> : null}
          {i.state !== 'delivered' ? <Button small kind="ghost" title="Cancel" onPress={() => discard(i.id)} /> : null}
        </View>
      ))}
    </View>
  );
}

/** Photo from the device, shrunk to at most 1600 px and saved as a JPEG (a normal photo is then 200 to 500 KB). */
async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise<Blob>((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('photo'))), 'image/jpeg', 0.85));
}

/**
 * Store-and-forward message: text, a voice recording, a video or a photo. Video is NORMAL quality (480p, 30 fps), only compressed:
 * it is not live, so nobody has to watch it stutter. The message is saved on the device, then sent in small pieces that resume after any break.
 */
export function MessageComposer({ target, to, onSent, delayMin = 0, kinds = ['text', 'voice', 'video', 'photo'] }: { target?: Target; to?: 'doctors' | number; onSent?: () => void; delayMin?: number; kinds?: Kind[] }) {
  const tgt: Target = target ?? { type: 'voicemail', to: to ?? 'doctors' };
  const canRecord = Platform.OS === 'web' && typeof MediaRecorder !== 'undefined';
  const canPhoto = Platform.OS === 'web' && typeof createImageBitmap !== 'undefined';
  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [state, setState] = useState<'idle' | 'rec' | 'ready'>('idle');
  const [secs, setSecs] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<any>(null), chunks = useRef<Blob[]>([]), stream = useRef<MediaStream | null>(null), timer = useRef<any>(null), blob = useRef<Blob | null>(null), live = useRef<any>(null), fileEl = useRef<any>(null);
  useEffect(() => () => { clearInterval(timer.current); stream.current?.getTracks().forEach(t => t.stop()); }, []);
  useEffect(() => { setState('idle'); setUrl(null); blob.current = null; }, [kind]);

  const stop = () => { clearInterval(timer.current); try { rec.current?.stop(); } catch { /* already stopped */ } };
  const start = async () => {
    try {
      const video = kind === 'video';
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } : false });
      stream.current = s;
      if (video && live.current) { live.current.srcObject = s; live.current.play?.().catch(() => {}); }
      const mimes = video ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
      const mime = mimes.find(m => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: video ? 64000 : 32000, ...(video ? { videoBitsPerSecond: 800000 } : {}) }); rec.current = r; chunks.current = [];
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { s.getTracks().forEach(t => t.stop()); if (live.current) live.current.srcObject = null; blob.current = new Blob(chunks.current, { type: baseType(r.mimeType || (video ? 'video/webm' : 'audio/webm')) }); setUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob.current!); }); setState('ready'); };
      r.start(1000); setSecs(0); setState('rec');
      const t0 = Date.now(); timer.current = setInterval(() => { const n = Math.round((Date.now() - t0) / 1000); setSecs(n); if (n >= MAX) stop(); }, 250);
    } catch { toast(kind === 'video' ? 'Allow the camera and microphone to record.' : 'Allow the microphone to record.'); }
  };
  const pickPhoto = async (e: any) => {
    const f: File | undefined = e?.target?.files?.[0]; if (!f) return;
    try { blob.current = await shrinkPhoto(f); setUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob.current!); }); setState('ready'); } catch { toast('Could not read that photo.'); }
    if (fileEl.current) fileEl.current.value = '';
  };

  const send = async () => {
    try {
      if (kind === 'text') await enqueue({ target: tgt, kind: 'text', text, urgent });
      else { if (!blob.current) throw new Error('Record something first.'); await enqueue({ target: tgt, kind, blob: blob.current, seconds: secs, urgent, text: kind === 'photo' ? text : undefined }); }
      toast(delayMin >= 1 ? `Saved. It travels in small pieces; the signal needs about ${Math.round(delayMin)} min.` : 'Saved. It is sent in small pieces and resumes after any break.');
      setText(''); setState('idle'); setUrl(null); blob.current = null; onSent?.();
    } catch (e: any) { toast(e.message ?? 'Could not save'); }
  };

  const box = { borderRadius: 12, borderWidth: 1.2, borderColor: K.hair2, padding: 10, fontFamily: F.r, fontSize: 15, color: K.ink, minHeight: 92, textAlignVertical: 'top' as const };
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {kinds.includes('text') ? <Chip label="Text" on={kind === 'text'} onPress={() => setKind('text')} /> : null}
        {canRecord && kinds.includes('voice') ? <Chip label="Voice" on={kind === 'voice'} onPress={() => setKind('voice')} /> : null}
        {canRecord && kinds.includes('video') ? <Chip label="Video" on={kind === 'video'} onPress={() => setKind('video')} /> : null}
        {canPhoto && kinds.includes('photo') ? <Chip label="Photo" on={kind === 'photo'} onPress={() => setKind('photo')} /> : null}
        {tgt.type === 'voicemail' ? <Chip label={urgent ? 'Urgent ✓' : 'Urgent'} on={urgent} onPress={() => setUrgent(u => !u)} /> : null}
      </View>
      {kind === 'text' ? (
        <>
          <TextInput value={text} onChangeText={setText} multiline maxLength={2000} placeholder="Write the whole message: the answer will come much later. Say what you feel, what you did, what you need." placeholderTextColor={K.ink3} style={box} accessibilityLabel="Message" />
          <Button icon={Send} title="Send" disabled={text.trim().length < 2} onPress={send} />
        </>
      ) : kind === 'photo' ? (
        <>
          {React.createElement('input', { ref: fileEl, type: 'file', accept: 'image/*', onChange: pickPhoto, style: { display: 'none' } })}
          {state === 'ready' && url ? React.createElement('img', { src: url, style: { width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 12, backgroundColor: '#000' } }) : null}
          {state === 'ready' ? <>
            <TextInput value={text} onChangeText={setText} maxLength={300} placeholder="Say what the picture shows (optional)" placeholderTextColor={K.ink3} style={{ ...box, minHeight: 44 }} accessibilityLabel="Caption" />
            <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button icon={Send} title="Send" onPress={send} /></View><Button kind="secondary" title="Other photo" onPress={() => fileEl.current?.click()} /></View>
          </> : <Button icon={Camera} title="Choose or take a photo" onPress={() => fileEl.current?.click()} />}
        </>
      ) : (
        <>
          {kind === 'video' ? React.createElement('video', { ref: live, muted: true, playsInline: true, style: { width: '100%', maxHeight: 260, borderRadius: 12, backgroundColor: '#1C120D', display: state === 'rec' ? 'block' : 'none' } }) : null}
          {state === 'idle' ? <Button icon={kind === 'video' ? VideoIcon : Mic} title={kind === 'video' ? 'Record a video' : 'Record a voice message'} onPress={start} /> : null}
          {state === 'rec' ? <><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#D9583F' }} /><Txt v="subM">Recording {mmss(secs)} / {mmss(MAX)}</Txt></View><Button icon={Square} kind="secondary" title="Stop" onPress={stop} /></> : null}
          {state === 'ready' ? <>
            {url ? React.createElement(kind === 'video' ? 'video' : 'audio', { src: url, controls: true, playsInline: true, style: { width: '100%', maxHeight: 260, borderRadius: 12 } }) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button icon={Send} title="Send" onPress={send} /></View><Button kind="secondary" title="Re-record" onPress={() => { setState('idle'); setUrl(null); blob.current = null; }} /></View>
          </> : null}
        </>
      )}
      <OutboxList target={tgt} />
      <Txt v="caption" color={K.ink3}>{delayMin >= 1 ? `Signal time to Earth: about ${Math.round(delayMin)} minutes one way. ` : ''}Normal quality, compressed. It is saved on this device and sent in small pieces; if the link drops it carries on where it stopped. Nothing needs to be live.</Txt>
    </View>
  );
}
