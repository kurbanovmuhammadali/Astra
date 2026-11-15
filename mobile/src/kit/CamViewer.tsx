import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { K } from '@/kit/tokens';
import { Kicker, Txt } from '@/kit/core';
import { Button, Card, Tag, toast } from '@/kit/ui';
import { api, API_URL, getToken } from '@/api';
import { rtcSupported, watch } from '@/data/rtcClient';
import { useApi } from '@/useApi';
import type { ViewStats } from '@/data/rtcClient';

type St = { live: boolean; viewing: boolean };
export const copyText = (t: string) => { try { (navigator as any).clipboard?.writeText(t); toast('Link copied'); } catch { toast(t); } };

/** Flight surgeon: live view of the astronaut, filmed by the camera station (a phone or laptop opened at /camera). */
export function CamViewer({ id, name }: { id: string | number; name: string }) {
  const [st, setSt] = useState<St | null>(null);
  const [tick, setTick] = useState(0);
  const [bearer, setBearer] = useState<string | null>(null);
  const load = useCallback(() => api<St>(`/api/admin/crew/${id}/cam`).then(setSt).catch(() => {}), [id]);
  useEffect(() => { load(); const t = setInterval(() => { load(); setTick(x => x + 1); }, 700); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (Platform.OS !== 'web') getToken().then(setBearer); }, []);
  const [rs, setRs] = useState<'connecting' | 'live' | 'waiting' | 'failed'>('connecting');
  const [stats, setStats] = useState<ViewStats | null>(null);
  const vid = useRef<any>(null);
  const web = Platform.OS === 'web' && rtcSupported();
  useEffect(() => {
    if (!web) return;
    return watch(id, s => { if (vid.current) vid.current.srcObject = s; if (!s) setStats(null); }, setRs, setStats);
  }, [id, web]);
  const rtcLive = web && rs === 'live';
  const first = name.split(' ')[0];
  // distance decides the kind of stream: live video near Earth, recorded clips far away; reports work in both
  const clipsQ = useApi<{ clips: { id: number; seconds: number; at: string }[]; mode: 'live' | 'clips'; delayMin: number }>(`/api/admin/crew/${id}/clips`);
  const repQ = useApi<{ reports: { id: number; summary: string; at: string }[] }>(`/api/admin/crew/${id}/activity`);
  useEffect(() => { const t = setInterval(() => { clipsQ.reload(); repQ.reload(); }, 15000); return () => clearInterval(t); }, []);
  const farAway = clipsQ.data?.mode === 'clips';
  const [clipSrc, setClipSrc] = useState<string | null>(null), [clipId, setClipId] = useState<number | null>(null);
  const playClip = async (cid: number) => {
    setClipId(cid); setClipSrc(null);
    try { const r = await fetch(`${API_URL}/api/admin/crew/${id}/clips/${cid}`, { credentials: 'include', headers: { 'X-Requested-With': 'perigee' } }); if (r.ok) setClipSrc(URL.createObjectURL(await r.blob())); } catch { /* offline */ }
  };
  const station = Platform.OS === 'web' && typeof location !== 'undefined' ? `${location.origin}/camera` : '/camera';

  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Kicker>{farAway ? 'Camera · long distance' : 'Live camera'}</Kicker>
        <Tag label={farAway ? `Clips · ${Math.round(clipsQ.data?.delayMin ?? 0)} min signal` : rtcLive ? 'Live · HD' : st?.live ? 'Live · backup' : 'Not filming'} tone={farAway ? 'watch' : rtcLive || st?.live ? 'ok' : 'none'} />
      </View>
      <View style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1C120D', marginTop: 10, alignItems: 'center', justifyContent: 'center' }}>
        {web ? React.createElement('video', { ref: vid, autoPlay: true, playsInline: true, muted: true, style: { width: '100%', height: '100%', objectFit: 'cover', display: rtcLive ? 'block' : 'none' } }) : null}
        {rtcLive ? null : st?.live
          ? <Image source={{ uri: `${API_URL}/api/admin/crew/${id}/cam/frame.jpg?t=${tick}`, headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={`Live camera of ${name}`} />
          : <Txt v="sub" color="#A8958B" center style={{ padding: 16 }}>Nobody is filming {first} right now.</Txt>}
      </View>
      {rtcLive ? <Txt v="mono" color={K.ink3} style={{ marginTop: 6 }}>{stats ? `${stats.width}×${stats.height} · ${stats.fps} fps · ${(stats.kbps / 1000).toFixed(1)} Mbps` : 'Connecting…'} · peer to peer</Txt> : st?.live ? <Txt v="caption" color={K.ink3} style={{ marginTop: 6 }}>{rs === 'failed' ? 'Live video could not connect; showing a still frame every second or two.' : 'Starting live video… showing stills meanwhile.'}</Txt> : null}
      {farAway ? (
        <View style={{ marginTop: 12 }}>
          <Kicker color={K.ink2}>Recorded clips (30 s each)</Kicker>
          <Txt v="caption" color={K.ink3} style={{ marginTop: 2 }}>{first} is too far away for live video. The camera records short low-bandwidth clips and sends them; they arrive when the link is up.</Txt>
          {clipSrc ? React.createElement('video', { src: clipSrc, controls: true, autoPlay: true, playsInline: true, style: { width: '100%', maxHeight: 260, borderRadius: 12, marginTop: 8, backgroundColor: '#000' } }) : clipId ? <Txt v="caption" color={K.ink3} style={{ marginTop: 8 }}>Loading…</Txt> : null}
          {(clipsQ.data?.clips ?? []).slice(0, 8).map(c => <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}><Txt v="caption" color={K.ink2} style={{ flex: 1 }}>{c.at} UTC · {c.seconds}s</Txt><Button small kind={clipId === c.id ? 'primary' : 'secondary'} title="Play" onPress={() => playClip(c.id)} /></View>)}
          {clipsQ.data && !clipsQ.data.clips.length ? <Txt v="sub" color={K.ink2} style={{ marginTop: 8 }}>No clips yet.</Txt> : null}
        </View>
      ) : null}
      <View style={{ marginTop: 14 }}>
        <Kicker color={K.ink2}>Camera reports (written on the camera, no video sent)</Kicker>
        {(repQ.data?.reports ?? []).slice(0, 3).map(r => <View key={r.id} style={{ marginTop: 8 }}><Txt v="caption" color={K.ink3}>{r.at} UTC</Txt><Txt v="sub">{r.summary}</Txt></View>)}
        {repQ.data && !repQ.data.reports.length ? <Txt v="sub" color={K.ink2} style={{ marginTop: 6 }}>No report yet. One is written about every five minutes while the camera is running, and when it stops.</Txt> : null}
      </View>
      <Kicker color={K.ink2} style={{ marginTop: 14 }}>How to film {first}</Kicker>
      <Txt v="caption" color={K.ink2} style={{ marginTop: 4 }}>Open the camera station on a phone or laptop, choose {first} from the list, and the camera starts. Nothing is recorded: the video streams directly to your browser.</Txt>
      <Txt v="mono" color={K.ink} selectable style={{ marginTop: 6 }}>{station}</Txt>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Button small kind="secondary" title="Copy station link" onPress={() => copyText(station)} /></View>
    </Card>
  );
}
