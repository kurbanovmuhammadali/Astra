import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Phone, Siren } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { Pressy, Txt } from '@/kit/core';
import { Button, toast } from '@/kit/ui';
import { useAuth } from '@/auth';
import { api } from '@/api';
import CallPanel from './CallPanel';
import { tone, unlockAudio, useCalls } from './calls';
import { useMission } from '@/data/mission';
import { MessageComposer } from '@/kit/MessageComposer';
import type { CallKind } from './calls';

export type Incident = { id: number; userId: number; name: string; kind: string; label: string; severity: string; confidence: number | null; evidence: string | null; status: string; escalated: boolean; at: string; responding?: string[] };
type LiveCtx = { connected: boolean; incidents: Incident[]; call: (to: string, kind: CallKind, name: string) => void; busy: boolean; unreadFamily: number };
const Ctx = createContext<LiveCtx>({ connected: false, incidents: [], call: () => {}, busy: false, unreadFamily: 0 });
export const useLive = () => useContext(Ctx);

/**
 * Live layer for signed-in users: emergency alerts (flight surgeons and crew mates hear about an incident within a second, with an
 * alarm that escalates if nobody takes it) and voice/video calls. Web only; the app also polls once on load.
 */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const web = Platform.OS === 'web';
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selfAlert, setSelfAlert] = useState<{ id: number; label: string } | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [unreadFamily, setUnread] = useState(0);
  const alarm = useRef<null | (() => void)>(null);
  const isAdmin = !!user?.admin || user?.role === 'surgeon';
  const mDelay = useMission().delay ?? 0;
  const delayMin = user?.linkDelayMin ?? mDelay; // one-way signal time to Earth, in minutes (the server knows the mission)
  const slow = !isAdmin && delayMin * 60 > 2; // far from Earth there are no live calls with Earth: messages and video instead
  const [msgTo, setMsgTo] = useState<null | { to: 'doctors' | number; name: string; reason: 'slow' | 'noanswer' }>(null);
  const lastTarget = useRef<null | { to: string; kind: CallKind; name: string }>(null);
  useEffect(() => { if (!web || !user) return; unlockAudio(); try { if ((window as any).Notification?.permission === 'default') (window as any).Notification.requestPermission(); } catch { /* optional */ } }, [user?.id]);

  const onEvent = useCallback((m: any) => {
    if (m.type === 'incident') setIncidents(a => [m.incident, ...a.filter(x => x.id !== m.incident.id)]);
    else if (m.type === 'incident-update') setIncidents(a => a.map(x => (x.id === m.id ? { ...x, responding: m.responding } : x)));
    else if (m.type === 'incident-closed') { setIncidents(a => a.filter(x => x.id !== m.id)); setSelfAlert(s => (s?.id === m.id ? null : s)); }
    else if (m.type === 'incident-self') setSelfAlert(m.incident);
    else if (m.type === 'family-message') setUnread(n => n + 1);
  }, []);
  const { call, local, remote, connected, startCall, accept, decline, hangup, mute, video } = useCalls(web && user ? 'role=inbox' : null, onEvent);

  useEffect(() => { if (web && user) api<{ incidents: Incident[] }>('/api/alerts').then(r => setIncidents(r.incidents)).catch(() => {}); }, [user?.id]);
  const open = incidents.filter(i => i.status === 'active' && i.userId !== user?.id && !dismissed.includes(i.id));
  useEffect(() => { // the alarm sounds while an unacknowledged incident is open
    if (open.length && !alarm.current) { alarm.current = tone('alarm'); try { navigator.vibrate?.([300, 150, 300]); } catch { /* ignore */ } }
    if (!open.length && alarm.current) { alarm.current(); alarm.current = null; }
  }, [open.length]);
  useEffect(() => () => { alarm.current?.(); }, []);

  const respond = (i: Incident, kind: 'seen' | 'responding') => api(`/api/alerts/${i.id}/ack`, { body: { kind } }).catch(() => {});
  const resolve = (i: Incident, status: 'resolved' | 'false_alarm') => api(`/api/admin/alerts/${i.id}/resolve`, { body: { status } }).catch(() => {});
  const top = open[0];
  const place = (to: string, kind: CallKind, name: string) => { lastTarget.current = { to, kind, name }; if (slow && kind !== 'crew') { if (kind === 'doctor') setMsgTo({ to: 'doctors', name, reason: 'slow' }); else toast('Live calls with Earth only work near Earth. Send a message instead.'); return; } startCall(to, kind, name); };
  const noAnswerTarget = () => { const t = lastTarget.current; if (!t || t.kind !== 'doctor') return undefined; const id = /^u:(\d+)$/.exec(t.to)?.[1]; return () => setMsgTo({ to: isAdmin && id ? Number(id) : 'doctors', name: t.name, reason: 'noanswer' }); };
  const fmtDelay = delayMin >= 1 ? `${Math.round(delayMin)} minutes` : `${Math.round(delayMin * 60)} seconds`;

  return (
    <Ctx.Provider value={{ connected, incidents, call: place, busy: call.phase !== 'idle', unreadFamily }}>
      {children}
      {web && user && top && call.phase === 'idle' ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 8000, backgroundColor: 'rgba(120,10,10,0.94)', alignItems: 'center', justifyContent: 'center', padding: 24 } as any}>
          <Siren size={54} color="#fff" />
          <Txt v="mono" color="#FFD2C8" upper style={{ marginTop: 14 }}>{top.escalated ? 'Nobody has responded yet · escalated' : 'Emergency alert'}{open.length > 1 ? ` · ${open.length} open` : ''}</Txt>
          <Txt v="hero" color="#fff" center style={{ marginTop: 8, fontSize: 36 }}>{top.name}</Txt>
          <Txt v="title" color="#fff" center style={{ marginTop: 6 }}>{top.label}</Txt>
          {top.evidence ? <Txt v="sub" color="#FFD2C8" center style={{ marginTop: 8, maxWidth: 420 }}>{top.evidence}{top.confidence != null ? ` · confidence ${Math.round(top.confidence * 100)}%` : ''}</Txt> : null}
          <Txt v="caption" color="#FFD2C8" center style={{ marginTop: 8, maxWidth: 420 }}>{top.kind === 'manual' ? 'They pressed SOS. Check on the person and use the call button.' : "Detected automatically by the camera's local SI. It can be wrong: check on the person and use the call button."}</Txt>
          {top.responding?.length ? <Txt v="subM" color="#fff" center style={{ marginTop: 10 }}>Responding: {top.responding.join(', ')}</Txt> : null}
          <View style={{ gap: 10, marginTop: 22, width: '100%', maxWidth: 360 }}>
            <Button title="I am responding" onPress={() => respond(top, 'responding')} />
            <Button kind="secondary" icon={Phone} title={`Call ${top.name.split(' ')[0]}`} onPress={() => startCall(`u:${top.userId}`, isAdmin ? 'doctor' : 'crew', top.name)} />
            {isAdmin ? <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button small kind="secondary" title="False alarm" onPress={() => resolve(top, 'false_alarm')} /></View>
              <View style={{ flex: 1 }}><Button small kind="secondary" title="Resolved" onPress={() => resolve(top, 'resolved')} /></View>
            </View> : null}
            <Button small kind="ghost" title="Hide for now" onPress={() => { respond(top, 'seen'); setDismissed(d => [...d, top.id]); }} />
          </View>
        </View>
      ) : null}
      {web && user && selfAlert ? (
        <Pressy label="Help has been alerted" onPress={() => setSelfAlert(null)}>
          <View style={{ position: 'absolute', left: 12, right: 12, top: 12, zIndex: 7000, backgroundColor: '#B3261E', borderRadius: 16, padding: 14 } as any}>
            <Txt v="subM" color="#fff">Help has been alerted: {selfAlert.label}</Txt>
            <Txt v="caption" color="#FFD2C8">Your flight surgeon and crew have been told. Stay where you are if you can. Tap to close.</Txt>
          </View>
        </Pressy>
      ) : null}
      <CallPanel call={call} local={local} remote={remote} accept={accept} decline={decline} hangup={hangup} mute={mute} video={video} onMessage={noAnswerTarget()} />
      {web && user && msgTo && call.phase === 'idle' ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 8500, backgroundColor: 'rgba(28,18,13,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20 } as any}>
          <View style={{ width: '100%', maxWidth: 440, backgroundColor: K.cardSolid, borderRadius: 22, padding: 20 }}>
            <Txt v="mono" color={K.copperInk} upper>{msgTo.reason === 'slow' ? 'Calls are for near Earth' : 'No answer'}</Txt>
            <Txt v="title" style={{ marginTop: 6 }}>Message to {msgTo.to === 'doctors' ? 'the flight surgeons' : msgTo.name}</Txt>
            <Txt v="sub" color={K.ink2} style={{ marginTop: 8, lineHeight: 21 }}>{msgTo.reason === 'slow' ? `The signal needs about ${fmtDelay} to cross to Earth, so a live call cannot work: every sentence would arrive minutes late. Send a text, a voice recording or a short video instead. It is stored, sent when the link is up and answered the same way (store and forward, like deep-space networks).` : 'Nobody picked up. Leave a message: it is held and delivered, and you get the answer as a message too.'}</Txt>
            <View style={{ marginTop: 16 }}><MessageComposer to={msgTo.to} delayMin={delayMin} onSent={() => setMsgTo(null)} /></View>
            <View style={{ marginTop: 10 }}><Button kind="ghost" title="Close" onPress={() => setMsgTo(null)} /></View>
          </View>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}
