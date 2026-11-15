import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { K } from '@/kit/tokens';
import { Txt } from '@/kit/core';
import { Button } from '@/kit/ui';
import { api } from '@/api';
import { loadPose } from '@/data/poseLoader';
import { cameraAvailable, cameraHelp } from '@/data/cameraSupport';
import { HD_VIDEO, publish, pubQuery, rtcSupported } from '@/data/rtcClient';
import type { Quality } from '@/data/rtcClient';
import { buildReport, classify, createTimeline, observe, segments } from '@/data/activity';
import type { Timeline } from '@/data/activity';

/**
 * Camera capture: opens the camera and sends a still frame about every second for the chosen astronaut, and reports when
 * an overall activity report is saved (pose detection runs in this browser; only the written report is sent). `base` is the API prefix:
 * `/api/cam/<token>` for a private link or `/api/station/<id>` for the camera station. Nothing is recorded on the server.
 */
export default function CaptureView({ base, autoStart, onExit }: { base: string; autoStart?: boolean; onExit?: () => void }) {
  const token = base; // API prefix used by every call below
  const [info, setInfo] = useState<{ name: string; viewing: boolean; mode?: 'live' | 'clips'; delayMin?: number } | 'bad' | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [clipsSent, setClipsSent] = useState(0);
  const [reports, setReports] = useState(0);
  const [live, setLive] = useState(false);
  const [sent, setSent] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [det, setDet] = useState<'off' | 'loading' | 'on' | 'error'>('off');
  const [peers, setPeers] = useState(0);
  const stopPub = useRef<null | (() => void)>(null);
  const detTimer = useRef<any>(null);
  const tl = useRef<Timeline>(createTimeline()), reportFrom = useRef(0), lastReport = useRef(0), prevHip = useRef<{ x: number; t: number } | null>(null);
  const nameRef = useRef('The crew member');
  const clipRec = useRef<any>(null), clipTimer = useRef<any>(null), pendingClips = useRef<{ media: string; seconds: number }[]>([]);
  const video = useRef<any>(null), canvas = useRef<any>(null), stream = useRef<any>(null), timer = useRef<any>(null), wake = useRef<any>(null), busy = useRef(false);

  const refresh = useCallback(() => api<{ name: string; viewing: boolean; mode?: 'live' | 'clips'; delayMin?: number }>(`${token}/info`).then(setInfo).catch(() => setInfo('bad')), [token]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (info && info !== 'bad') nameRef.current = info.name; }, [info]); // read through a ref so polling never recreates the stop handler
  useEffect(() => { if (!live) return; const t = setInterval(refresh, 3000); return () => clearInterval(t); }, [live, refresh]);

  /** A plain-language activity report for the doctor (posture and movement): made here from the pose model, no video leaves the phone. */
  const flushReport = useCallback((final: boolean) => {
    const now = Date.now(), segs = segments(tl.current, now);
    if (!segs.length || !reportFrom.current || now - reportFrom.current < (final ? 20_000 : 60_000)) return;
    const r = buildReport({ name: nameRef.current, from: reportFrom.current, to: now, segs, reps: {}, objects: {}, incidents: [] });
    api(`${token}/activity`, { body: { from: reportFrom.current, to: now, segments: r.segments.slice(-40), summary: r.summary } }).then(() => setReports(n => n + 1)).catch(() => {});
    reportFrom.current = now; tl.current = createTimeline(); lastReport.current = now;
  }, [token]);
  const halt = useCallback((tell: boolean) => {
    if (reportFrom.current) flushReport(true); reportFrom.current = 0;
    clearTimeout(clipTimer.current); const cr = clipRec.current; clipRec.current = null; try { cr?.stop(); } catch { /* not recording */ }
    clearInterval(timer.current); clearInterval(detTimer.current); stopPub.current?.(); stopPub.current = null; setPeers(0); setDet('off');
    stream.current?.getTracks?.().forEach((t: any) => t.stop()); stream.current = null;
    wake.current?.release?.().catch?.(() => {}); wake.current = null;
    if (video.current) video.current.srcObject = null;
    if (tell) api(`${token}/stop`, { body: {} }).catch(() => {});
    setLive(false); setQuality(null);
  }, [token, flushReport]);
  useEffect(() => () => halt(true), [halt]);

  /** Far from Earth: record 30-second clips at low bitrate and send each one (store and forward). A failed upload waits and is retried. */
  const recordClip = useCallback(() => {
    const s = stream.current; if (!s || typeof MediaRecorder === 'undefined') return;
    const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 180000 }); const parts: Blob[] = [], t0 = Date.now();
    r.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    r.onstop = async () => {
      const secs = Math.round((Date.now() - t0) / 1000);
      if (secs >= 3 && parts.length) {
        const blob = new Blob(parts, { type: (r.mimeType || 'video/webm').split(';')[0] });
        const media: string = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(blob); });
        pendingClips.current.push({ media, seconds: secs }); pendingClips.current = pendingClips.current.slice(-6);
        while (pendingClips.current.length) { const c = pendingClips.current[0]; try { await api(`${token}/clip`, { body: c }); pendingClips.current.shift(); setClipsSent(n => n + 1); } catch (e: any) { if (e?.status === 413 || e?.status === 400) pendingClips.current.shift(); else break; } }
      }
      if (stream.current && clipRec.current === r) recordClip();
    };
    clipRec.current = r; r.start(); clipTimer.current = setTimeout(() => { try { r.stop(); } catch { /* done */ } }, 30_000);
  }, [token]);

  const send = useCallback(async () => {
    const v = video.current, c = canvas.current;
    if (busy.current || !v || !c || !v.videoWidth) return;
    busy.current = true;
    try {
      const w = Math.min(480, v.videoWidth), h = Math.round((w * v.videoHeight) / v.videoWidth);
      c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h);
      await api(`${token}/frame`, { body: { image: c.toDataURL('image/jpeg', 0.6) } });
      setSent(n => n + 1);
    } catch (e: any) {
      if (e?.status === 404) { halt(false); setInfo('bad'); setErr('This camera link was replaced. Ask for the new one.'); }
    } finally { busy.current = false; }
  }, [token, halt]);

  const startDetect = useCallback(() => {
    reportFrom.current = Date.now(); lastReport.current = Date.now(); tl.current = createTimeline(); prevHip.current = null;
    setDet('loading');
    loadPose().then(lmk => {
      setDet('on');
      detTimer.current = setInterval(() => {
        const v = video.current;
        if (!v || v.readyState < 2) return;
        const lm = lmk.detectForVideo(v, performance.now()).landmarks?.[0] ?? null;
        const now = Date.now();
        let vx = 0; if (lm) { const hx = (lm[23].x + lm[24].x) / 2; if (prevHip.current) vx = (hx - prevHip.current.x) / Math.max(0.05, (now - prevHip.current.t) / 1000); prevHip.current = { x: hx, t: now }; } else prevHip.current = null;
        tl.current = observe(tl.current, classify(lm as any, { hipVx: vx }), now);
        if (now - lastReport.current >= 5 * 60_000) flushReport(false); // a report every five minutes while the camera runs
      }, 220);
    }).catch(() => setDet('error'));
  }, [flushReport]);

  const start = async (face = facing) => {
    setErr(null); halt(false);
    if (!cameraAvailable()) { setErr(cameraHelp()); return; }
    try {
      const clipMode = typeof info === 'object' && !!info && info.mode === 'clips';
      const s = await navigator.mediaDevices.getUserMedia({ video: clipMode ? { facingMode: { ideal: face }, width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 15 } } : HD_VIDEO(face), audio: false });
      stream.current = s; video.current.srcObject = s; await video.current.play();
      try { wake.current = await (navigator as any).wakeLock?.request('screen'); } catch { /* optional */ }
      setLive(true); setSent(0);
      timer.current = setInterval(send, clipMode ? 30_000 : 2500); // slow JPEG backup + heartbeat; live video goes over WebRTC, far away short clips are sent instead
      if (clipMode) { setClipsSent(0); recordClip(); }
      else if (rtcSupported()) stopPub.current = publish(pubQuery(token), () => stream.current, setPeers, setQuality);
      startDetect();
    } catch (e: any) {
      halt(false);
      setErr(e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow the camera for this page and try again.' : e?.name === 'NotFoundError' ? 'No camera found on this device.' : `Could not start the camera: ${e?.message ?? e}`);
    }
  };
  const flip = () => { const f = facing === 'environment' ? 'user' : 'environment'; setFacing(f); if (live) start(f); };

  const started = useRef(false);
  useEffect(() => { if (autoStart && info && info !== 'bad' && !started.current && cameraAvailable()) { started.current = true; start(); } }, [autoStart, info]);

  const secure = cameraAvailable();
  const viewing = info && info !== 'bad' && info.viewing;
  const box = { flex: 1, backgroundColor: '#1C120D', alignItems: 'center' as const, padding: 20, paddingTop: 36 };

  if (Platform.OS !== 'web') return <View style={box}><Txt v="headline" color="#fff" center>Open this link in a phone browser</Txt><Txt v="sub" color="#E3B79E" center style={{ marginTop: 8 }}>The camera page runs in Safari or Chrome.</Txt></View>;
  if (info === 'bad') return <View style={box}><Txt v="title" color="#fff" center>Camera not available</Txt><Txt v="sub" color="#E3B79E" center style={{ marginTop: 8 }}>{err ?? 'This camera link or station is not valid. Ask for the current link.'}</Txt></View>;

  return (
    <View style={box}>
      <Txt v="mono" color="#E3B79E" upper>✦ Celeste · remote camera</Txt>
      <Txt v="title" color="#fff" center style={{ marginTop: 8 }}>{info ? `Filming ${info.name}` : 'Checking the link…'}</Txt>
      <View style={{ width: '100%', maxWidth: 520, aspectRatio: 4 / 3, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000', marginTop: 16, alignItems: 'center', justifyContent: 'center' }}>
        {React.createElement('video', { ref: video, playsInline: true, muted: true, autoPlay: true, style: { width: '100%', height: '100%', objectFit: 'cover', display: live ? 'block' : 'none' } })}
        {!live ? <Txt v="sub" color="#A8958B" center style={{ padding: 16 }}>{secure ? 'Point the camera at the astronaut, then tap Start.' : cameraHelp()}</Txt> : null}
        {React.createElement('canvas', { ref: canvas, style: { display: 'none' } })}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, width: '100%', maxWidth: 520 }}>
        <View style={{ flex: 1 }}>{live ? <Button kind="secondary" title="Stop camera" onPress={() => halt(true)} /> : <Button title="Start camera" onPress={() => start()} disabled={!info || !secure} />}</View>
        <Button kind="secondary" title="Flip" onPress={flip} />
      </View>
      {onExit ? <View style={{ marginTop: 10, width: '100%', maxWidth: 520 }}><Button kind="light" title="← Choose another astronaut" onPress={() => { halt(true); onExit(); }} /></View> : null}
      {live && info && info.mode === 'clips' ? <Txt v="mono" color="#E3B79E" upper style={{ marginTop: 12 }}>Long distance · signal {Math.round(info.delayMin ?? 0)} min to Earth · recording 30 s clips for the doctor · {clipsSent} sent</Txt> : null}
      {live && quality ? <Txt v="mono" color={quality.label === 'excellent' ? '#9FD6A8' : quality.label === 'fair' ? '#E3B79E' : '#F2A08C'} upper style={{ marginTop: 6 }}>Connection {quality.label}{quality.rttMs != null ? ` · ${quality.rttMs} ms` : ''}{quality.lossPct ? ` · ${quality.lossPct}% lost` : ''}{quality.level ? ' · quality lowered to keep it smooth' : ''}</Txt> : null}
      {live ? <Txt v="mono" color={viewing ? '#9FD6A8' : '#E3B79E'} upper style={{ marginTop: 12 }}>{info && info.mode === 'clips' ? 'Clips are delivered when the link is up' : `${viewing || peers ? 'A flight surgeon is watching now' : 'Live · waiting for a viewer'} · live video${peers ? ` · ${peers} viewer${peers > 1 ? 's' : ''}` : ''}`}{reports ? ` · ${reports} report${reports > 1 ? 's' : ''} sent` : ''}</Txt> : null}
      {live ? <Txt v="mono" color="#E3B79E" upper style={{ marginTop: 6 }}>{det === 'on' ? 'Activity report on · saved, no video kept' : det === 'loading' ? 'Loading the activity model…' : det === 'error' ? 'Activity model unavailable (needs internet once)' : ''}</Txt> : null}
      {err ? <Txt v="sub" color="#F2A08C" center style={{ marginTop: 10 }}>{err}</Txt> : null}
      <Txt v="caption" color="#A8958B" center style={{ marginTop: 18, maxWidth: 420 }}>Nothing is recorded. The video goes straight to the signed-in flight surgeon's browser; the server never stores it. Stop the camera or close this page any time.</Txt>
    </View>
  );
}
