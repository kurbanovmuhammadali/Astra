import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Camera, Check, Square } from 'lucide-react-native';
import { api } from '@/api';
import { A } from '@/theme';
import { T } from '@/ui';
import { shadowSoft } from '@/astra';
import { BONES, CONFIG, kcalFor, newState, step, summarize, type Exercise, type State, type Summary } from '@/pose/reps';

/**
 * Camera workout: the browser runs Google's MediaPipe Pose Landmarker (33 body points) on the live video; Astra counts reps from joint
 * angles and checks form. The video never leaves this device — only the result (reps, form score, time) is saved if you press Save.
 */
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const dynamicImport: (u: string) => Promise<any> = new Function('u', 'return import(u)') as any;   // keeps the bundler out of the CDN import

type Workout = { id: number; day: string; exercise: string; reps: number; valid_reps: number; seconds: number; form_score: number; kcal: number };
const EX: { key: Exercise; icon: string }[] = [{ key: 'squat', icon: '🏋️' }, { key: 'pushup', icon: '💪' }, { key: 'pullup', icon: '🧗' }];

export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const [ex, setEx] = useState<Exercise>('squat');
  const [mode, setMode] = useState<'idle' | 'loading' | 'countdown' | 'live' | 'done'>('idle');
  const [msg, setMsg] = useState('');
  const [count, setCount] = useState(0);
  const [valid, setValid] = useState(0);
  const [hint, setHint] = useState('');
  const [sum, setSum] = useState<(Summary & { seconds: number; kcal: number }) | null>(null);
  const [hist, setHist] = useState<Workout[]>([]);
  const [saved, setSaved] = useState(false);
  const [weight, setWeight] = useState(70);
  const video = useRef<any>(null);
  const canvas = useRef<any>(null);
  const run = useRef({ on: false, raf: 0, stream: null as MediaStream | null, lm: null as any, st: null as State | null, t0: 0 });

  const loadHist = useCallback(() => api<{ workouts: Workout[] }>('/api/workouts').then(r => setHist(r.workouts)).catch(() => {}), []);
  useEffect(() => { loadHist(); api<{ profile: { weight_kg: number } | null }>('/api/profile/body').then(r => r.profile && setWeight(r.profile.weight_kg)).catch(() => {}); }, [loadHist]);

  const stopAll = useCallback(() => {
    const r = run.current; r.on = false; cancelAnimationFrame(r.raf);
    r.stream?.getTracks().forEach(t => t.stop()); r.stream = null;
    try { r.lm?.close(); } catch { /* ignore */ } r.lm = null;
  }, []);
  useEffect(() => stopAll, [stopAll]);

  const draw = (lm: any[] | null) => {
    const c = canvas.current, v = video.current; if (!c || !v) return;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    if (!lm) return;
    g.lineWidth = 4; g.strokeStyle = 'rgba(217,120,70,0.95)'; g.fillStyle = '#fff';
    for (const [a, b] of BONES) { const p = lm[a], q = lm[b]; if ((p.visibility ?? 1) < 0.5 || (q.visibility ?? 1) < 0.5) continue; g.beginPath(); g.moveTo(p.x * c.width, p.y * c.height); g.lineTo(q.x * c.width, q.y * c.height); g.stroke(); }
    for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) { const p = lm[i]; if ((p.visibility ?? 1) < 0.5) continue; g.beginPath(); g.arc(p.x * c.width, p.y * c.height, 6, 0, 7); g.fill(); }
  };

  const start = async () => {
    setSum(null); setSaved(false); setCount(0); setValid(0); setHint(''); setMode('loading'); setMsg('Opening the camera…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
      run.current.stream = stream;
      const v = video.current; v.srcObject = stream; v.muted = true; v.playsInline = true; await v.play();
      setMsg('Loading the pose model (first time ≈ 6 MB)…');
      const mod = await dynamicImport(`${WASM}/vision_bundle.mjs`);
      const files = await mod.FilesetResolver.forVisionTasks(`${WASM}/wasm`);
      const make = (delegate: string) => mod.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1 });
      run.current.lm = await make('GPU').catch(() => make('CPU'));
    } catch (e: any) {
      stopAll(); setMode('idle');
      setMsg(e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow the camera for this site and try again.' : `Could not start: ${e?.message ?? e}`);
      return;
    }
    setMode('countdown');
    for (let n = 3; n > 0; n--) { setMsg(`Get into position… ${n}`); await new Promise(r => setTimeout(r, 1000)); if (!run.current.stream) return; }
    setMsg(''); setMode('live');
    const r = run.current; r.on = true; r.st = newState(); r.t0 = performance.now() / 1000;
    let last = -1;
    const loop = () => {
      if (!r.on) return;
      const v = video.current;
      if (v && v.readyState >= 2 && v.currentTime !== last) {
        last = v.currentTime;
        const now = performance.now();
        const res = r.lm.detectForVideo(v, now);
        const lm = res?.landmarks?.[0] ?? null;
        draw(lm);
        const st = step(ex, r.st!, lm, now / 1000);
        setCount(st.reps.length); setValid(st.reps.filter(x => x.valid).length); setHint(st.tracking ? '' : st.hint);
      }
      r.raf = requestAnimationFrame(loop);
    };
    loop();
  };

  const finish = () => {
    const r = run.current; const st = r.st; const seconds = Math.max(1, Math.round(performance.now() / 1000 - r.t0));
    stopAll(); draw(null);
    if (!st) { setMode('idle'); return; }
    const s = summarize(st);
    setSum({ ...s, seconds, kcal: kcalFor(ex, weight, seconds) }); setMode('done');
  };
  const save = async () => {
    if (!sum || !sum.reps) return;
    try { const r = await api<{ workouts: Workout[] }>('/api/workouts', { body: { exercise: ex, reps: sum.reps, valid: sum.valid, seconds: sum.seconds, avgDepth: sum.avgExtreme, issues: sum.issues } }); setHist(r.workouts); setSaved(true); }
    catch (e: any) { setMsg(e.message); }
  };

  const cfg = CONFIG[ex];
  const card = [{ backgroundColor: '#fff', borderRadius: 22, padding: 16, marginTop: 12 }, shadowSoft] as any;
  const live = mode === 'live' || mode === 'countdown' || mode === 'loading';
  const V: any = 'video', C: any = 'canvas', D: any = 'div';

  return (
    <ScrollView style={{ backgroundColor: A.sand }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 60, paddingHorizontal: 20, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { stopAll(); router.back(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <ChevronLeft size={20} color={A.ink} /><T size={14} color={A.ink2}>Back</T>
      </Pressable>
      <T size={28} weight="sb" color={A.ink} style={{ marginTop: 14, letterSpacing: -0.7 }}>Training check</T>
      <T size={14} color={A.ink2} style={{ marginTop: 4, lineHeight: 20 }}>Counts reps and checks form. Video stays on this device.</T>

      {Platform.OS !== 'web' ? (
        <View style={card}><T size={13} color={A.ink2} style={{ lineHeight: 19 }}>Open Astra in your phone's browser to use the camera. The in-app camera needs the native build.</T></View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {EX.map(e => (
              <Pressable key={e.key} accessibilityRole="button" disabled={live} onPress={() => setEx(e.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 18, backgroundColor: ex === e.key ? A.copper : '#fff', opacity: live && ex !== e.key ? 0.5 : 1 }}>
                <T size={20}>{e.icon}</T><T size={13} weight="m" color={ex === e.key ? '#fff' : A.ink}>{CONFIG[e.key].label}</T>
              </Pressable>
            ))}
          </View>
          <T size={12} color={A.ink3} style={{ marginTop: 8, lineHeight: 17 }}>{cfg.tip}</T>

          {/* camera */}
          <D style={{ position: 'relative', marginTop: 12, borderRadius: 22, overflow: 'hidden', background: '#1c1815', aspectRatio: '4 / 3', display: live || mode === 'done' ? 'block' : 'none' }}>
            <V ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            <C ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            {mode === 'live' ? (
              <D style={{ position: 'absolute', left: 12, top: 10, color: '#fff', fontFamily: 'sans-serif', fontSize: 56, fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,.5)' }}>{count}</D>
            ) : null}
            {mode === 'live' ? <D style={{ position: 'absolute', right: 12, top: 14, color: '#fff', fontSize: 13, background: 'rgba(0,0,0,.45)', padding: '4px 10px', borderRadius: 999 }}>{valid} good form</D> : null}
            {hint ? <D style={{ position: 'absolute', left: 10, right: 10, bottom: 10, color: '#fff', fontSize: 13, background: 'rgba(0,0,0,.55)', padding: '8px 12px', borderRadius: 12 }}>{hint}</D> : null}
            {msg && live ? <D style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, textAlign: 'center', padding: 20, background: 'rgba(0,0,0,.35)' }}>{msg}</D> : null}
          </D>

          {mode === 'idle' || mode === 'done' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Start camera" onPress={start} style={{ marginTop: 14, height: 50, borderRadius: 999, backgroundColor: A.copper, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={18} color="#fff" /><T size={15} weight="m" color="#fff">{mode === 'done' ? 'Go again' : 'Start with camera'}</T>
            </Pressable>
          ) : mode === 'live' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Finish" onPress={finish} style={{ marginTop: 14, height: 50, borderRadius: 999, backgroundColor: A.ink, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Square size={16} color="#fff" /><T size={15} weight="m" color="#fff">Finish set</T>
            </Pressable>
          ) : null}
          {msg && !live ? <T size={12.5} color="#D9583F" style={{ marginTop: 10, lineHeight: 18 }}>{msg}</T> : null}

          {sum ? (
            <View style={card}>
              <T size={15} weight="sb" color={A.ink}>Result · {cfg.label}</T>
              {sum.reps === 0 ? (
                <T size={13} color={A.ink2} style={{ marginTop: 8, lineHeight: 19 }}>No full reps were detected. Check that your whole body is in view, then try again.</T>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
                    <View style={{ flex: 1 }}><T size={11.5} color={A.ink3}>Reps</T><T size={26} weight="sb" color={A.ink}>{sum.reps}</T></View>
                    <View style={{ flex: 1 }}><T size={11.5} color={A.ink3}>Good form</T><T size={26} weight="sb" color={A.ink}>{sum.valid}</T></View>
                    <View style={{ flex: 1 }}><T size={11.5} color={A.ink3}>Form score</T><T size={26} weight="sb" color={sum.formScore >= 80 ? '#4FAE72' : A.copperDeep}>{sum.formScore}%</T></View>
                  </View>
                  <T size={12.5} color={A.ink2} style={{ marginTop: 8, lineHeight: 18 }}>{sum.seconds} s · average {cfg.label === 'Pull-ups' ? 'elbow' : cfg.label === 'Push-ups' ? 'elbow' : 'knee'} angle at the bottom {sum.avgExtreme}° (target ≤ {cfg.down}°) · ≈ {sum.kcal} kcal at {weight} kg.</T>
                  {sum.issues.length ? sum.issues.map(i => <T key={i} size={12.5} color="#B5532E" style={{ marginTop: 4 }}>• {i}</T>) : <T size={12.5} color="#3C8D5A" style={{ marginTop: 6 }}>Clean form on every rep.</T>}
                  <Pressable accessibilityRole="button" disabled={saved} onPress={save} style={{ marginTop: 12, height: 44, borderRadius: 999, backgroundColor: saved ? A.line : A.copper, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                    {saved ? <Check size={16} color={A.ink} /> : null}<T size={14} weight="m" color={saved ? A.ink : '#fff'}>{saved ? 'Saved' : 'Save this session'}</T>
                  </Pressable>
                </>
              )}
              <T size={11.5} color={A.ink3} style={{ marginTop: 10, lineHeight: 15 }}>Estimates only.</T>
            </View>
          ) : null}

          {hist.length ? (
            <>
              <T size={18} weight="sb" color={A.ink} style={{ marginTop: 26 }}>Recent sessions</T>
              <View style={card}>
                {hist.slice(0, 8).map(w => (
                  <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                    <View style={{ flex: 1 }}><T size={14} color={A.ink}>{CONFIG[w.exercise as Exercise]?.label ?? w.exercise}</T><T size={11.5} color={A.ink3}>{w.day} · {w.seconds} s · ≈{w.kcal} kcal</T></View>
                    <T size={14} weight="m" color={A.ink}>{w.valid_reps}/{w.reps}</T>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
