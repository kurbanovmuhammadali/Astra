import React, { useEffect, useRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { Mic, MessageSquare, Send, Square, Video as VideoIcon } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { F } from '@/theme';
import { Txt } from '@/kit/core';
import { Button, Chip, toast } from '@/kit/ui';
import { api } from '@/api';

type Kind = 'text' | 'voice' | 'video';
const MAX = 60;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const baseType = (t: string) => t.split(';')[0] || t;

/**
 * Store-and-forward message: text, a short voice recording or a short compressed video (about 200 kbit/s, so a minute is around 1.5 MB).
 * It is held and sent when the link is up and played when the other side likes. Web: MediaRecorder; elsewhere text only.
 */
export function MessageComposer({ to, onSent, delayMin = 0 }: { to: 'doctors' | number; onSent?: () => void; delayMin?: number }) {
  const canRecord = Platform.OS === 'web' && typeof MediaRecorder !== 'undefined';
  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [state, setState] = useState<'idle' | 'rec' | 'ready' | 'sending'>('idle');
  const [secs, setSecs] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<any>(null), chunks = useRef<Blob[]>([]), stream = useRef<MediaStream | null>(null), timer = useRef<any>(null), blob = useRef<Blob | null>(null), live = useRef<any>(null);
  useEffect(() => () => { clearInterval(timer.current); stream.current?.getTracks().forEach(t => t.stop()); }, []);
  useEffect(() => { setState('idle'); setUrl(null); blob.current = null; }, [kind]);

  const stop = () => { clearInterval(timer.current); try { rec.current?.stop(); } catch { /* already stopped */ } };
  const start = async () => {
    try {
      const video = kind === 'video';
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15 } } : false });
      stream.current = s;
      if (video && live.current) { live.current.srcObject = s; live.current.play?.().catch(() => {}); }
      const mimes = video ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
      const mime = mimes.find(m => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000, ...(video ? { videoBitsPerSecond: 180000 } : {}) }); rec.current = r; chunks.current = [];
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { s.getTracks().forEach(t => t.stop()); if (live.current) live.current.srcObject = null; blob.current = new Blob(chunks.current, { type: baseType(r.mimeType || (video ? 'video/webm' : 'audio/webm')) }); setUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob.current!); }); setState('ready'); };
      r.start(); setSecs(0); setState('rec');
      const t0 = Date.now(); timer.current = setInterval(() => { const n = Math.round((Date.now() - t0) / 1000); setSecs(n); if (n >= MAX) stop(); }, 250);
    } catch { toast(kind === 'video' ? 'Allow the camera and microphone to record.' : 'Allow the microphone to record.'); }
  };

  const send = async () => {
    setState('sending');
    try {
      let body: any = { to, kind, urgent };
      if (kind === 'text') body.text = text;
      else {
        if (!blob.current) throw new Error('Record something first.');
        body.media = await new Promise<string>((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(new Error('read')); fr.readAsDataURL(blob.current!); });
        body.seconds = secs;
      }
      const r = await api<{ inTransit: boolean }>('/api/voicemail', { body });
      toast(delayMin >= 1 ? `Sent. The signal needs about ${Math.round(delayMin)} min to cross.` : 'Sent.');
      setText(''); setState('idle'); setUrl(null); blob.current = null; onSent?.();
    } catch (e: any) { toast(e.message ?? 'Could not send'); setState(kind === 'text' ? 'idle' : 'ready'); }
  };

  const box = { borderRadius: 12, borderWidth: 1.2, borderColor: K.hair2, padding: 10, fontFamily: F.r, fontSize: 15, color: K.ink, minHeight: 92, textAlignVertical: 'top' as const };
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <Chip label="Text" on={kind === 'text'} onPress={() => setKind('text')} />
        {canRecord ? <Chip label="Voice" on={kind === 'voice'} onPress={() => setKind('voice')} /> : null}
        {canRecord ? <Chip label="Video" on={kind === 'video'} onPress={() => setKind('video')} /> : null}
        <Chip label={urgent ? 'Urgent ✓' : 'Urgent'} on={urgent} onPress={() => setUrgent(u => !u)} />
      </View>
      {kind === 'text' ? (
        <>
          <TextInput value={text} onChangeText={setText} multiline maxLength={2000} placeholder="Write the whole message: assume the reply comes much later. Say what you feel, what you did, what you need." placeholderTextColor={K.ink3} style={box} accessibilityLabel="Message" />
          <Button icon={Send} title="Send" disabled={text.trim().length < 2} loading={state === 'sending'} onPress={send} />
        </>
      ) : (
        <>
          {kind === 'video' ? React.createElement('video', { ref: live, muted: true, playsInline: true, style: { width: '100%', maxHeight: 240, borderRadius: 12, backgroundColor: '#1C120D', display: state === 'rec' ? 'block' : 'none' } }) : null}
          {state === 'idle' ? <Button icon={kind === 'video' ? VideoIcon : Mic} title={kind === 'video' ? 'Record a video' : 'Record a voice message'} onPress={start} /> : null}
          {state === 'rec' ? <><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#D9583F' }} /><Txt v="subM">Recording {mmss(secs)} / {mmss(MAX)}</Txt></View><Button icon={Square} kind="secondary" title="Stop" onPress={stop} /></> : null}
          {state === 'ready' || state === 'sending' ? <>
            {url ? React.createElement(kind === 'video' ? 'video' : 'audio', { src: url, controls: true, playsInline: true, style: { width: '100%', maxHeight: 240, borderRadius: 12 } }) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button icon={Send} title="Send" loading={state === 'sending'} onPress={send} /></View><Button kind="secondary" title="Re-record" onPress={() => { setState('idle'); setUrl(null); blob.current = null; }} /></View>
          </> : null}
        </>
      )}
      <Txt v="caption" color={K.ink3}>{delayMin >= 1 ? `Signal time to Earth: about ${Math.round(delayMin)} minutes one way. ` : ''}The message is stored, sent when the link is up and played when the other side is ready. Nothing needs to be live.</Txt>
    </View>
  );
}
