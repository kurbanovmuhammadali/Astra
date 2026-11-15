/**
 * Camera form check (optional countermeasure tool). Counts squats, push-ups or pull-ups on the device:
 * each video frame is compared with the previous one, the vertical centre of the moving pixels is tracked,
 * and one down-and-up swing past a threshold counts as a rep. No frame ever leaves the device.
 * Web demo uses the browser camera; the native build needs expo-camera (not installed yet).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, View } from 'react-native';
import { Camera, CameraOff, RotateCcw, ScanFace } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth';
import { useStore } from '@/data/store';
import { K, native } from '@/kit/tokens';
import { Kicker, Txt, haptic } from '@/kit/core';
import { Button, Card, Chip, Notice, PageHead, TopBar } from '@/kit/ui';
import { Page } from '@/kit/page';

const KINDS = [['squat', 'Squats'], ['pushup', 'Push-ups'], ['pullup', 'Pull-ups']] as const;

/** Decode stored grey thumbnails into 48×48 luminance arrays (for a simple on-device face match). */
function loadSamples(urls: string[]): Promise<Float32Array[]> {
  return Promise.all(urls.map(u => new Promise<Float32Array>(res => {
    const img = new (window as any).Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = 48; c.height = 48; const x = c.getContext('2d')!; x.drawImage(img, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data, out = new Float32Array(48 * 48); for (let i = 0; i < out.length; i++) out[i] = d[i * 4]; res(out); }; img.src = u; })));
}
const ncc = (a: Float32Array, b: Float32Array) => { let ma = 0, mb = 0; for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; } ma /= a.length; mb /= b.length;
  let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; n += x * y; da += x * x; db += y * y; } return n / Math.sqrt(da * db + 1e-6); };

function useRepCounter(on: boolean, samples: string[] | null) {
  const video = useRef<any>(null);
  const [match, setMatch] = useState<number | null>(null);
  const [reps, setReps] = useState(0);
  const [level, setLevel] = useState(0.5); // 0 top … 1 bottom, for the live gauge
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!on || Platform.OS !== 'web') return;
    let stream: MediaStream | null = null, raf = 0, prev: Uint8ClampedArray | null = null;
    let smooth = 0.5, lo = 1, hi = 0, phase: 'up' | 'down' = 'up';
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48;
    const fc = document.createElement('canvas'); fc.width = 48; fc.height = 48; const fx = fc.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;
    let refs: Float32Array[] = []; let frame = 0;
    if (samples?.length) loadSamples(samples).then(r => { refs = r; });
    const ctx = cv.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 }, audio: false }).then(s => {
      stream = s; const v = video.current; if (!v) return; v.srcObject = s; v.play();
      const loop = () => {
        if (v.readyState >= 2) {
          ctx.drawImage(v, 0, 0, 64, 48);
          const px = ctx.getImageData(0, 0, 64, 48).data;
          if (prev) {
            let sy = 0, c = 0;
            for (let i = 0; i < px.length; i += 4) { const d = Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2]); if (d > 60) { sy += Math.floor(i / 4 / 64); c++; } }
            if (c > 40) {
              smooth = smooth * 0.8 + (sy / c / 48) * 0.2;
              lo = Math.min(lo * 0.995 + smooth * 0.005, smooth); hi = Math.max(hi * 0.995 + smooth * 0.005, smooth);
              const span = hi - lo, t = span > 0.08 ? (smooth - lo) / span : 0.5;
              setLevel(t);
              if (phase === 'up' && t > 0.75) phase = 'down';
              else if (phase === 'down' && t < 0.25) { phase = 'up'; setReps(r => r + 1); haptic.tap(); }
            }
          }
          prev = px;
          if (refs.length && ++frame % 45 === 0) { // every ~0.75 s: compare the centre of the frame with the saved face
            const vw = v.videoWidth, vh = v.videoHeight, side = Math.min(vw, vh) * 0.62;
            fx.filter = 'grayscale(1)'; fx.drawImage(v, (vw - side) / 2, (vh - side) / 2 - side * 0.05, side, side, 0, 0, 48, 48);
            const d = fx.getImageData(0, 0, 48, 48).data, cur = new Float32Array(48 * 48); for (let i = 0; i < cur.length; i++) cur[i] = d[i * 4];
            setMatch(Math.max(...refs.map(r => ncc(cur, r))));
          }
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    }).catch(() => setErr('Camera permission was not given.'));
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, [on]);
  return { video, reps, setReps, level, err, match };
}

export default function FormCheck() {
  const [kind, setKind] = useState<string>('squat');
  const [on, setOn] = useState(false);
  const face = useStore(s => s.face);
  const { user } = useAuth();
  const { video, reps, setReps, level, err, match } = useRepCounter(on, face?.samples ?? null);
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => { if (!reps) return; pop.setValue(1.25); Animated.spring(pop, { toValue: 1, useNativeDriver: native, speed: 18, bounciness: 14 }).start(); }, [reps]);
  const web = Platform.OS === 'web';
  return (
    <Page title="Form check" maxWidth={640} header={<TopBar title="Form check" />}>
      <PageHead kicker="Optional countermeasure tool" title="Camera form check" sub="Counts reps on this device. Nothing is recorded or uploaded." style={{ marginTop: 6 }} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>{KINDS.map(([k, l]) => <Chip key={k} label={l} on={kind === k} onPress={() => { setKind(k); setReps(0); }} />)}</View>
      {!web ? <View style={{ marginTop: 14 }}><Notice tone="watch" title="Available in the web demo" body="The iPhone build needs the camera module (expo-camera). Use the web version to try it." /></View> : (
        <Card style={{ marginTop: 14, padding: 0, overflow: 'hidden' }}>
          <View style={{ height: 300, backgroundColor: '#1C120D', alignItems: 'center', justifyContent: 'center' }}>
            {on ? React.createElement('video', { ref: video, muted: true, playsInline: true, style: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' } } as any) : (
              <View style={{ alignItems: 'center', gap: 8 }}><CameraOff size={28} color="rgba(255,255,255,0.5)" /><Txt v="caption" color="rgba(255,255,255,0.6)">Camera off</Txt></View>
            )}
            {on ? (
              <View pointerEvents="none" style={{ position: 'absolute', right: 14, top: 14, bottom: 14, width: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <View style={{ position: 'absolute', left: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#F3B48D', top: `${Math.round(level * 92)}%` }} />
              </View>
            ) : null}
            <View pointerEvents="none" style={{ position: 'absolute', left: 16, bottom: 14 }}>
              <Kicker color="#F3D9C6">{KINDS.find(k => k[0] === kind)![1]}</Kicker>
              <Animated.Text style={{ fontFamily: 'Geist_600SemiBold', fontSize: 64, color: '#fff', transform: [{ scale: pop }] }}>{reps}</Animated.Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
            <Button title={on ? 'Stop camera' : 'Start camera'} icon={on ? CameraOff : Camera} onPress={() => setOn(o => !o)} style={{ flex: 1 }} />
            <Button title="Reset" kind="secondary" icon={RotateCcw} onPress={() => setReps(0)} />
          </View>
        </Card>
      )}
      {err ? <View style={{ marginTop: 10 }}><Notice tone="flag" title={err} /></View> : null}
      <Card style={{ marginTop: 10 }} onPress={face ? undefined : () => router.push('/profile/face')} label="Crew recognition">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ScanFace size={20} color={K.copper} />
          <View style={{ flex: 1 }}>
            <Txt v="subM">{!face ? 'Set up face scan' : !on ? 'Face saved · recognition ready' : match == null ? 'Looking for your face…' : match > 0.55 ? `Recognised: ${user?.name.split(' ')[0] ?? 'you'}` : 'Someone else in frame?'}</Txt>
            <Txt v="caption" color={K.ink2}>{face ? 'Simple on-device match with your saved scan (demo). Nothing leaves the device.' : 'So the counter knows whose reps these are on a crowded spacecraft.'}</Txt>
          </View>
        </View>
      </Card>
      <Txt v="caption" color={K.ink3} style={{ marginTop: 12 }}>Stand side-on, whole body in frame, good light. The rep counter follows your up-and-down movement; it does not judge technique.</Txt>
    </Page>
  );
}
