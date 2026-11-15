import { useEffect, useRef, useState } from 'react';
import { toast } from '@/kit/ui';

const MAX = 60;
const baseType = (t: string) => t.split(';')[0] || t;
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Photo from the device, shrunk to at most 1600 px and saved as JPEG (a normal photo is then 200 to 500 KB). */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise<Blob>((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('photo'))), 'image/jpeg', 0.85));
}

/** Records a voice message or a video (normal quality, 480p at 30 fps, compressed: it is not live so nothing needs to be squeezed). */
export function useCapture(kind: 'voice' | 'video') {
  const [state, setState] = useState<'idle' | 'rec' | 'ready'>('idle');
  const [secs, setSecs] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<any>(null), chunks = useRef<Blob[]>([]), stream = useRef<MediaStream | null>(null), timer = useRef<any>(null);
  const blob = useRef<Blob | null>(null), preview = useRef<any>(null);
  useEffect(() => () => { clearInterval(timer.current); stream.current?.getTracks().forEach(t => t.stop()); }, []);

  const stop = () => { clearInterval(timer.current); try { rec.current?.stop(); } catch { /* already stopped */ } };
  const reset = () => { stop(); setState('idle'); setUrl(u => { if (u) URL.revokeObjectURL(u); return null; }); blob.current = null; };
  const start = async () => {
    try {
      const video = kind === 'video';
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } : false });
      stream.current = s;
      if (video && preview.current) { preview.current.srcObject = s; preview.current.play?.().catch(() => {}); }
      const mimes = video ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
      const mime = mimes.find(m => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: video ? 64000 : 32000, ...(video ? { videoBitsPerSecond: 800000 } : {}) }); rec.current = r; chunks.current = [];
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { s.getTracks().forEach(t => t.stop()); if (preview.current) preview.current.srcObject = null; blob.current = new Blob(chunks.current, { type: baseType(r.mimeType || (video ? 'video/webm' : 'audio/webm')) }); setUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob.current!); }); setState('ready'); };
      r.start(1000); setSecs(0); setState('rec');
      const t0 = Date.now(); timer.current = setInterval(() => { const n = Math.round((Date.now() - t0) / 1000); setSecs(n); if (n >= MAX) stop(); }, 250);
    } catch { toast(kind === 'video' ? 'Allow the camera and microphone to record.' : 'Allow the microphone to record.'); }
  };
  return { state, secs, url, blob, preview, start, stop, reset, max: MAX };
}
