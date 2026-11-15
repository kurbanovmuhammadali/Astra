/**
 * Messenger for the long link, in the Celeste style: copper bubbles for you, white cards for them, photo thumbnails inside the bubble,
 * a play tile for videos, a waveform pill for voice, and your own unsent messages shown in the thread with their progress.
 * Nothing here is live: everything is saved, sent in small pieces and played when opened.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUp, Camera, ChevronLeft, Mic, Play, Video as VideoIcon, X } from 'lucide-react-native';
import { K, ELEV } from '@/kit/tokens';
import { F } from '@/theme';
import { Pressy, Txt } from '@/kit/core';
import { Button } from '@/kit/ui';
import { api, API_URL } from '@/api';
import { discard, enqueue, retryFailed, useOutbox } from '@/data/outbox';
import type { OutItem, Target } from '@/data/outbox';
import { mmss, shrinkPhoto, useCapture } from '@/kit/useCapture';

export type ChatMsg = { id: number; fromFamily: number; text: string; kind: 'text' | 'voice' | 'video' | 'photo'; seconds: number; hasMedia: number; at: string };
const native = Platform.OS !== 'web';
const same = (a: Target, b: Target) => JSON.stringify(a) === JSON.stringify(b);
const when = (at: string) => new Date(at.replace(' ', 'T') + 'Z');
const hhmm = (at: string) => when(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayLabel = (at: string) => { const d = when(at), t = new Date(); const k = (x: Date) => x.toISOString().slice(0, 10); if (k(d) === k(t)) return 'Today'; if (k(d) === k(new Date(t.getTime() - 864e5))) return 'Yesterday'; return d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };

/** Lazily fetched blob URL (cookie or token already in the path). */
function useBlob(path: string, auto: boolean) {
  const [src, setSrc] = useState<string | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState(false), ref = useRef<string | null>(null);
  const load = async () => {
    if (src || busy || Platform.OS !== 'web') return;
    setBusy(true); setErr(false);
    try { const r = await fetch(API_URL + path, { credentials: 'include', headers: { 'X-Requested-With': 'perigee' } }); if (!r.ok) throw new Error('x'); ref.current = URL.createObjectURL(await r.blob()); setSrc(ref.current); } catch { setErr(true); } finally { setBusy(false); }
  };
  useEffect(() => { if (auto) load(); return () => { if (ref.current) URL.revokeObjectURL(ref.current); }; }, [path]);
  return { src, busy, err, load };
}

const BARS = [8, 14, 10, 18, 12, 22, 9, 16, 20, 11, 15, 8, 19, 13, 10, 17, 9, 14];
function Media({ m, path, mine }: { m: ChatMsg; path: string; mine: boolean }) {
  const photo = useBlob(path, m.kind === 'photo'), clip = useBlob(path, false);
  const ink = mine ? '#fff' : K.ink, soft = mine ? 'rgba(255,255,255,0.78)' : K.ink2;
  if (!m.hasMedia) return <Txt v="caption" color={soft}>The recording was removed after 14 days.</Txt>;
  if (m.kind === 'photo') return (
    <View>
      {photo.src ? React.createElement('img', { src: photo.src, style: { width: '100%', maxWidth: 300, maxHeight: 300, borderRadius: 14, display: 'block', objectFit: 'cover', cursor: 'zoom-in' }, onClick: () => window.open(photo.src!, '_blank') })
        : <View style={{ width: 240, height: 150, borderRadius: 14, backgroundColor: mine ? 'rgba(255,255,255,0.18)' : K.cardSunk, alignItems: 'center', justifyContent: 'center' }}><Txt v="caption" color={soft}>{photo.err ? 'Could not load' : 'Loading photo…'}</Txt></View>}
      {m.text ? <Txt v="body" color={ink} style={{ marginTop: 6 }}>{m.text}</Txt> : null}
    </View>
  );
  if (m.kind === 'video') return (
    <View style={{ width: 260 }}>
      {clip.src ? React.createElement('video', { src: clip.src, controls: true, autoPlay: true, playsInline: true, style: { width: '100%', borderRadius: 14, backgroundColor: '#000', display: 'block' } }) : (
        <Pressy label="Play video" onPress={clip.load}>
          <View style={{ width: 260, height: 146, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <LinearGradient colors={['#2B1E18', '#6E3719', '#B8693F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}><Play size={22} color={K.copperInk} fill={K.copperInk} /></View>
            <Txt v="mono" color="rgba(255,255,255,0.9)" style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 10.5 }}>{clip.busy ? 'LOADING…' : `VIDEO · ${mmss(m.seconds)}`}</Txt>
          </View>
        </Pressy>
      )}
      {clip.err ? <Txt v="caption" color="#F2A08C" style={{ marginTop: 4 }}>Could not load. Try again.</Txt> : null}
      {m.text ? <Txt v="body" color={ink} style={{ marginTop: 6 }}>{m.text}</Txt> : null}
    </View>
  );
  return ( // voice
    <View style={{ minWidth: 210 }}>
      {clip.src ? React.createElement('audio', { src: clip.src, controls: true, autoPlay: true, style: { width: 230, height: 36 } }) : (
        <Pressy label="Play voice message" onPress={clip.load}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: mine ? 'rgba(255,255,255,0.22)' : K.copperTint, alignItems: 'center', justifyContent: 'center' }}><Play size={15} color={mine ? '#fff' : K.copperInk} fill={mine ? '#fff' : K.copperInk} /></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2.5, flex: 1 }}>{BARS.map((h, i) => <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: mine ? 'rgba(255,255,255,0.8)' : K.copper, opacity: 0.35 + (i % 4) * 0.2 }} />)}</View>
            <Txt v="mono" color={soft} style={{ fontSize: 10.5 }}>{clip.busy ? '…' : mmss(m.seconds)}</Txt>
          </View>
        </Pressy>
      )}
      {m.text ? <Txt v="body" color={ink} style={{ marginTop: 6 }}>{m.text}</Txt> : null}
    </View>
  );
}

function Bubble({ mine, children, time, last }: { mine: boolean; children: React.ReactNode; time?: string; last?: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(a, { toValue: 1, useNativeDriver: native, speed: 18, bounciness: 5 }).start(); }, []);
  return (
    <Animated.View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', marginTop: 6, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      <View style={[{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, borderBottomRightRadius: mine && last ? 6 : 20, borderBottomLeftRadius: !mine && last ? 6 : 20, backgroundColor: mine ? K.copper : K.cardSolid, borderWidth: mine ? 0 : 1, borderColor: K.hair }, mine ? null : ELEV.card]}>{children}</View>
      {time ? <Txt v="caption" color={K.ink3} style={{ marginTop: 3, alignSelf: mine ? 'flex-end' : 'flex-start', fontSize: 10.5 }}>{time}</Txt> : null}
    </Animated.View>
  );
}

/** Your own message that has not arrived yet, with how far it got. */
function Pending({ it }: { it: OutItem }) {
  const pct = it.size ? Math.min(100, Math.round((it.sent / it.size) * 100)) : 0;
  const label = it.kind === 'text' ? it.text : it.kind === 'video' ? 'Video' : it.kind === 'photo' ? 'Photo' : 'Voice message';
  return (
    <Bubble mine last>
      <Txt v="body" color="#fff" numberOfLines={3}>{label}</Txt>
      {it.kind !== 'text' ? <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', marginTop: 8, minWidth: 180, overflow: 'hidden' }}><View style={{ width: `${Math.max(4, pct)}%`, height: 4, backgroundColor: '#fff' }} /></View> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <Txt v="caption" color={it.state === 'failed' ? '#FFD2C8' : 'rgba(255,255,255,0.85)'} style={{ flex: 1, fontSize: 11 }}>{it.state === 'failed' ? `Not sent · ${it.error}` : it.state === 'delivered' ? 'Sent ✓' : it.state === 'queued' ? (it.kind === 'text' ? 'Waiting for the link' : `${pct}% · waiting for the link`) : it.kind === 'text' ? 'Sending…' : `Sending ${pct}%`}</Txt>
        {it.state === 'failed' ? <Pressy label="Retry" onPress={retryFailed}><Txt v="caption" color="#fff" style={{ textDecorationLine: 'underline' }}>Retry</Txt></Pressy> : null}
        {it.state !== 'delivered' ? <Pressy label="Cancel" onPress={() => discard(it.id)}><X size={13} color="rgba(255,255,255,0.85)" /></Pressy> : null}
      </View>
    </Bubble>
  );
}

export function ChatThread({ messages, mineIs, mediaPath, pending, empty }: { messages: ChatMsg[]; mineIs: 0 | 1; mediaPath: (m: ChatMsg) => string; pending: OutItem[]; empty?: string }) {
  const sv = useRef<ScrollView>(null);
  useEffect(() => { setTimeout(() => sv.current?.scrollToEnd({ animated: true }), 80); }, [messages.length, pending.length, pending.map(p => p.state).join()]);
  let lastDay = '';
  return (
    <ScrollView ref={sv} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {!messages.length && !pending.length ? <Txt v="sub" color={K.ink2} center style={{ marginTop: 30 }}>{empty ?? 'No messages yet.'}</Txt> : null}
      {messages.map((m, i) => {
        const mine = m.fromFamily === mineIs, d = dayLabel(m.at), head = d !== lastDay; lastDay = d;
        const next = messages[i + 1], last = !next || (next.fromFamily === mineIs) !== mine;
        return (
          <View key={m.id}>
            {head ? <Txt v="mono" color={K.ink3} center upper style={{ marginTop: 14, marginBottom: 4, fontSize: 10 }}>{d}</Txt> : null}
            <Bubble mine={mine} last={last} time={last ? hhmm(m.at) : undefined}>
              {m.kind === 'text' ? <Txt v="body" color={mine ? '#fff' : K.ink}>{m.text}</Txt> : <Media m={m} path={mediaPath(m)} mine={mine} />}
            </Bubble>
          </View>
        );
      })}
      {pending.map(p => <Pending key={p.id} it={p} />)}
    </ScrollView>
  );
}

/** The bar at the bottom: three round buttons (voice, video, photo), a pill for text, and a round send button. */
export function ChatComposer({ target, onSent }: { target: Target; onSent?: () => void }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<null | 'voice' | 'video' | 'photo'>(null);
  const [text, setText] = useState(''), [caption, setCaption] = useState('');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const voice = useCapture('voice'), video = useCapture('video');
  const cap = mode === 'voice' ? voice : mode === 'video' ? video : null;
  const fileEl = useRef<any>(null);
  const canRecord = Platform.OS === 'web' && typeof MediaRecorder !== 'undefined';
  const canPhoto = Platform.OS === 'web' && typeof createImageBitmap !== 'undefined';

  const close = () => { voice.reset(); video.reset(); if (photo) URL.revokeObjectURL(photo.url); setPhoto(null); setCaption(''); setMode(null); };
  const open = (m: 'voice' | 'video' | 'photo') => { if (mode === m) return close(); close(); setMode(m); if (m === 'photo') setTimeout(() => fileEl.current?.click(), 0); };
  const pickPhoto = async (e: any) => { const f: File | undefined = e?.target?.files?.[0]; if (!f) return; try { const b = await shrinkPhoto(f); setPhoto({ blob: b, url: URL.createObjectURL(b) }); } catch { /* unreadable */ } if (fileEl.current) fileEl.current.value = ''; };
  const done = () => { close(); onSent?.(); };
  const sendText = async () => { const t = text.trim(); if (t.length < 1) return; setText(''); await enqueue({ target, kind: 'text', text: t }); onSent?.(); };
  const sendMedia = async () => {
    if (mode === 'photo' && photo) await enqueue({ target, kind: 'photo', blob: photo.blob, text: caption });
    else if (cap?.blob.current) await enqueue({ target, kind: mode as 'voice' | 'video', blob: cap.blob.current, seconds: cap.secs });
    done();
  };
  const round = (children: React.ReactNode, on: boolean, label: string, onPress: () => void) => (
    <Pressy label={label} onPress={onPress} to={0.9}><View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? K.copper : K.copperTint }}>{children}</View></Pressy>
  );

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: 'rgba(255,250,246,0.94)', borderTopWidth: 1, borderTopColor: K.hair }}>
      {React.createElement('input', { ref: fileEl, type: 'file', accept: 'image/*', onChange: pickPhoto, style: { display: 'none' } })}
      {mode ? (
        <View style={{ marginBottom: 8, padding: 12, borderRadius: 18, backgroundColor: K.cardSolid, borderWidth: 1, borderColor: K.hair, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Txt v="subM" style={{ flex: 1 }}>{mode === 'voice' ? 'Voice message' : mode === 'video' ? 'Video message' : 'Photo'}</Txt><Pressy label="Close" onPress={close}><X size={18} color={K.ink3} /></Pressy></View>
          {mode === 'photo' ? (
            photo ? <>
              {React.createElement('img', { src: photo.url, style: { width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 12, backgroundColor: '#000' } })}
              <TextInput value={caption} onChangeText={setCaption} maxLength={300} placeholder="Add a few words (optional)" placeholderTextColor={K.ink3} style={{ height: 42, borderRadius: 12, borderWidth: 1.2, borderColor: K.hair2, paddingHorizontal: 12, fontFamily: F.r, fontSize: 15, color: K.ink }} />
              <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button title="Send photo" onPress={sendMedia} /></View><Button kind="secondary" title="Other" onPress={() => fileEl.current?.click()} /></View>
            </> : <Button title="Choose or take a photo" onPress={() => fileEl.current?.click()} />
          ) : cap ? (
            <>
              {mode === 'video' ? React.createElement('video', { ref: video.preview, muted: true, playsInline: true, style: { width: '100%', maxHeight: 240, borderRadius: 12, backgroundColor: '#1C120D', display: cap.state === 'rec' ? 'block' : 'none' } }) : null}
              {cap.state === 'idle' ? <Button icon={mode === 'video' ? VideoIcon : Mic} title={mode === 'video' ? 'Start recording' : 'Start recording'} onPress={cap.start} /> : null}
              {cap.state === 'rec' ? <><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#D9583F' }} /><Txt v="subM">Recording {mmss(cap.secs)} / {mmss(cap.max)}</Txt></View><Button kind="secondary" title="Stop" onPress={cap.stop} /></> : null}
              {cap.state === 'ready' ? <>
                {cap.url ? React.createElement(mode === 'video' ? 'video' : 'audio', { src: cap.url, controls: true, playsInline: true, style: { width: '100%', maxHeight: 240, borderRadius: 12 } }) : null}
                <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button title="Send" onPress={sendMedia} /></View><Button kind="secondary" title="Re-record" onPress={cap.reset} /></View>
              </> : null}
              <Txt v="caption" color={K.ink3}>Normal quality, compressed. Saved first, then sent in small pieces; it carries on after any break.</Txt>
            </>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {canRecord ? round(<Mic size={18} color={mode === 'voice' ? '#fff' : K.copperInk} />, mode === 'voice', 'Voice message', () => open('voice')) : null}
        {canRecord ? round(<VideoIcon size={18} color={mode === 'video' ? '#fff' : K.copperInk} />, mode === 'video', 'Video message', () => open('video')) : null}
        {canPhoto ? round(<Camera size={18} color={mode === 'photo' ? '#fff' : K.copperInk} />, mode === 'photo', 'Photo', () => open('photo')) : null}
        <TextInput value={text} onChangeText={setText} multiline placeholder="Write a message" placeholderTextColor={K.ink3} onFocus={() => mode && close()} maxLength={2000}
          style={{ flex: 1, minHeight: 40, maxHeight: 110, borderRadius: 20, backgroundColor: K.cardSolid, borderWidth: 1, borderColor: K.hair2, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontFamily: F.r, fontSize: 15, color: K.ink }} accessibilityLabel="Message" />
        <Pressy label="Send" onPress={sendText} to={0.9}><View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: text.trim() ? K.copper : K.copperTint, alignItems: 'center', justifyContent: 'center' }}><ArrowUp size={19} color={text.trim() ? '#fff' : K.copperInk} strokeWidth={2.4} /></View></Pressy>
      </View>
    </View>
  );
}

/** A full chat page: header, thread, composer. `mineIs` says which side of the table "you" are (0 = astronaut, 1 = family). */
export function ChatScreen({ title, sub, onBack, right, load, mineIs, mediaPath, target, emptyText }: {
  title: string; sub?: string; onBack?: () => void; right?: React.ReactNode; load: (after: number) => Promise<ChatMsg[]>; mineIs: 0 | 1; mediaPath: (m: ChatMsg) => string; target: Target; emptyText?: string;
}) {
  const insets = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const pending = useOutbox(t => same(t, target)).filter(i => i.state !== 'delivered' || Date.now() - i.createdAt < 4000);
  const lastId = useRef(0);
  const pull = async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden) return; // nobody is looking: save the link
    try { const r = await load(lastId.current); if (r.length) { lastId.current = Math.max(lastId.current, ...r.map(m => m.id)); setMsgs(cur => { const seen = new Set(cur.map(c => c.id)); return [...cur, ...r.filter(x => !seen.has(x.id))].sort((a, b) => a.id - b.id); }); } } catch { /* offline: try again later */ }
  };
  useEffect(() => { pull(); const t = setInterval(pull, 8000); return () => clearInterval(t); }, []);
  const delivered = pending.filter(p => p.state === 'delivered').length;
  useEffect(() => { if (delivered) setTimeout(pull, 700); }, [delivered]);
  return (
    <View style={{ flex: 1, backgroundColor: K.canvas }}>
      <LinearGradient colors={['#F1DCCF', K.canvas]} style={{ paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {onBack ? <Pressy label="Back" onPress={onBack}><ChevronLeft size={24} color={K.ink} /></Pressy> : null}
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: K.copper, alignItems: 'center', justifyContent: 'center' }}><Txt v="subM" color="#fff">{title.slice(0, 1).toUpperCase()}</Txt></View>
          <View style={{ flex: 1 }}><Txt v="headline" numberOfLines={1}>{title}</Txt>{sub ? <Txt v="caption" color={K.ink2} numberOfLines={2}>{sub}</Txt> : null}</View>
          {right}
        </View>
      </LinearGradient>
      <ChatThread messages={msgs} mineIs={mineIs} mediaPath={mediaPath} pending={pending} empty={emptyText} />
      <ChatComposer target={target} onSent={() => setTimeout(pull, 1500)} />
    </View>
  );
}
