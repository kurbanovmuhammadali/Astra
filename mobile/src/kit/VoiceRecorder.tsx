import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Mic, Send, Square } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { Txt } from '@/kit/core';
import { Button, toast } from '@/kit/ui';
import { api } from '@/api';

const MAX = 60;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Records a short voice message (web: MediaRecorder, low bitrate so it is tiny) and sends it store-and-forward to the doctors
 * (astronaut) or to a named astronaut (doctor). Used when a live call is impossible because the signal needs minutes to arrive.
 */
export function VoiceRecorder({ to, onSent }: { to: 'doctors' | number; onSent?: () => void }) {
  const [state, setState] = useState<'idle' | 'rec' | 'ready' | 'sending'>('idle');
  const [secs, setSecs] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<any>(null), chunks = useRef<Blob[]>([]), stream = useRef<MediaStream | null>(null), timer = useRef<any>(null), blob = useRef<Blob | null>(null);
  useEffect(() => () => { clearInterval(timer.current); stream.current?.getTracks().forEach(t => t.stop()); if (url) URL.revokeObjectURL(url); }, []);
  if (Platform.OS !== 'web' || typeof MediaRecorder === 'undefined') return <Txt v="sub" color={K.ink2}>Voice messages are recorded in the web app (Safari or Chrome).</Txt>;

  const stop = () => { clearInterval(timer.current); try { rec.current?.stop(); } catch { /* already stopped */ } };
  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); stream.current = s;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 }); rec.current = r; chunks.current = [];
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { s.getTracks().forEach(t => t.stop()); blob.current = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }); setUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob.current!); }); setState('ready'); };
      r.start(); setSecs(0); setState('rec');
      const t0 = Date.now(); timer.current = setInterval(() => { const n = Math.round((Date.now() - t0) / 1000); setSecs(n); if (n >= MAX) stop(); }, 250);
    } catch { toast('Allow the microphone to record a message.'); }
  };
  const send = async () => {
    if (!blob.current) return;
    setState('sending');
    try {
      const data: string = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(new Error('read')); fr.readAsDataURL(blob.current!); });
      await api('/api/voicemail', { body: { to, audio: data, seconds: secs } });
      toast('Message sent. It is delivered when the other side is reachable.');
      setState('idle'); setUrl(null); onSent?.();
    } catch (e: any) { toast(e.message ?? 'Could not send'); setState('ready'); }
  };

  return (
    <View style={{ gap: 10 }}>
      {state === 'idle' ? <Button icon={Mic} title="Record a message" onPress={start} /> : null}
      {state === 'rec' ? <><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#D9583F' }} /><Txt v="subM">Recording {mmss(secs)} / {mmss(MAX)}</Txt></View><Button icon={Square} kind="secondary" title="Stop" onPress={stop} /></> : null}
      {state === 'ready' || state === 'sending' ? <>
        {url ? React.createElement('audio', { src: url, controls: true, style: { width: '100%' } }) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button icon={Send} title="Send" loading={state === 'sending'} onPress={send} /></View>
          <Button kind="secondary" title="Re-record" onPress={() => { setState('idle'); setUrl(null); }} />
        </View>
      </> : null}
    </View>
  );
}
