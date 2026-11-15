/**
 * Face scan — enrols the crew member's face so camera tools (form check) can tell crewmates apart on a busy
 * spacecraft. Three guided poses (straight · slightly left · slightly right): an oval guide, a ring that fills
 * while you hold still, a pop when each pose is captured. Samples are small grey thumbnails kept only on this
 * device. Web uses the browser camera; the iPhone build needs expo-camera (not installed yet) → "do it later".
 * Matching runs on the device in the camera tools; nothing is uploaded.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { Check, ScanFace } from 'lucide-react-native';
import { A } from './theme';
import { T } from './ui';
import { native } from './motion';
import { setStore, useStore } from './data/store';

const POSES = ['Look straight at the camera', 'Turn your head slightly left', 'Turn your head slightly right'];
const web = Platform.OS === 'web';

export function useFaceEnrolled() { return useStore(s => !!s.face); }

export default function FaceScan({ onDone, dark }: { onDone: () => void; dark?: boolean }) {
  const enrolled = useStore(s => s.face);
  const [on, setOn] = useState(false);
  const [pose, setPose] = useState(0);
  const [hold, setHold] = useState(0); // 0..1 while holding still
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const video = useRef<any>(null);
  const samples = useRef<string[]>([]);
  const pop = useRef(new Animated.Value(1)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const ink = dark ? '#fff' : A.ink, ink2 = dark ? 'rgba(255,255,255,0.75)' : A.ink2;

  useEffect(() => { const l = Animated.loop(Animated.timing(scan, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native })); l.start(); return () => l.stop(); }, []);

  useEffect(() => {
    if (!on || !web) return;
    let stream: MediaStream | null = null, raf = 0, prev: Uint8ClampedArray | null = null, still = 0, p = 0;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 }, audio: false }).then(s => {
      stream = s; const v = video.current; if (!v) return; v.srcObject = s; v.play();
      const loop = () => {
        if (v.readyState >= 2) {
          const vw = v.videoWidth, vh = v.videoHeight, side = Math.min(vw, vh) * 0.62;
          ctx.drawImage(v, (vw - side) / 2, (vh - side) / 2 - side * 0.05, side, side, 0, 0, 64, 64); // centre crop = the oval
          const px = ctx.getImageData(0, 0, 64, 64).data;
          if (prev) {
            let diff = 0; for (let i = 0; i < px.length; i += 16) diff += Math.abs(px[i] - prev[i]);
            still = diff / (px.length / 16) < 6 ? Math.min(1, still + 0.035) : Math.max(0, still - 0.08);
            setHold(still);
            if (still >= 1) { // pose captured → grey thumbnail
              const g = document.createElement('canvas'); g.width = 48; g.height = 48;
              const gx = g.getContext('2d')!; gx.filter = 'grayscale(1)'; gx.drawImage(cv, 0, 0, 48, 48);
              samples.current.push(g.toDataURL('image/jpeg', 0.6));
              still = 0; p += 1; setPose(p);
              pop.setValue(1.25); Animated.spring(pop, { toValue: 1, useNativeDriver: native, speed: 16, bounciness: 14 }).start();
              if (p >= POSES.length) {
                setStore(st => ({ ...st, face: { enrolledAt: Date.now(), samples: samples.current } }));
                setDone(true); stream?.getTracks().forEach(t => t.stop()); return;
              }
            }
          }
          prev = px;
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    }).catch(() => setErr('Camera permission was not given. You can do this later in Profile.'));
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, [on]);

  const size = 230, r = size / 2 - 6, C = 2 * Math.PI * r;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
        <View style={{ position: 'absolute', width: size - 26, height: size - 26, borderRadius: size, overflow: 'hidden', backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#EFE2D9', alignItems: 'center', justifyContent: 'center' }}>
          {on && web && !done ? React.createElement('video', { ref: video, muted: true, playsInline: true, style: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' } } as any)
            : done || enrolled ? <Animated.View style={{ transform: [{ scale: pop }] }}><View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: A.copper, alignItems: 'center', justifyContent: 'center' }}><Check size={40} color="#fff" strokeWidth={3} /></View></Animated.View>
            : <ScanFace size={70} color={dark ? 'rgba(255,255,255,0.6)' : A.copperSoft} strokeWidth={1.2} />}
          {on && !done ? (
            <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(243,180,141,0.9)', transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [-(size - 26) / 2.4, (size - 26) / 2.4] }) }] }} />
          ) : null}
        </View>
        <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={dark ? 'rgba(255,255,255,0.15)' : A.sand2} strokeWidth={6} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={A.copper} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={`${C} ${C}`}
            strokeDashoffset={C * (1 - Math.min(1, (pose + (done ? 0 : hold)) / POSES.length))} />
        </Svg>
        {on && !done ? <Svg width={size} height={size} style={{ position: 'absolute' }} pointerEvents="none"><Ellipse cx={size / 2} cy={size / 2} rx={size * 0.27} ry={size * 0.35} stroke="rgba(255,255,255,0.85)" strokeWidth={2} strokeDasharray="6 6" fill="none" /></Svg> : null}
      </View>
      <T size={18} weight="sb" color={ink} center style={{ marginTop: 18 }}>
        {done ? 'Face saved' : enrolled && !on ? 'Face already enrolled' : on ? POSES[Math.min(pose, POSES.length - 1)] : 'Recognise you among the crew'}
      </T>
      <T size={13.5} color={ink2} center style={{ marginTop: 6, paddingHorizontal: 20, lineHeight: 19 }}>
        {done ? 'Camera tools will recognise you on this device.' : on ? `Hold still · pose ${Math.min(pose + 1, POSES.length)} of ${POSES.length}` : 'On a crowded spacecraft the camera form check needs to know whose reps it is counting. Three quick poses — stored only on this device.'}
      </T>
      {err ? <T size={13} color="#C0472F" center style={{ marginTop: 10 }}>{err}</T> : null}
      {!web && !done ? <T size={12.5} color={ink2} center style={{ marginTop: 10 }}>Face scan runs in the web demo for now — the iPhone build needs the camera module. You can do it later in Profile.</T> : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        {!done && web && !on ? <Btn title={enrolled ? 'Scan again' : 'Start face scan'} onPress={() => { samples.current = []; setPose(0); setErr(null); setOn(true); }} /> : null}
        {done ? <Btn title="Continue" onPress={onDone} /> : <Btn title={enrolled ? 'Done' : 'Do it later'} ghost onPress={onDone} />}
      </View>
    </View>
  );
}

function Btn({ title, onPress, ghost }: { title: string; onPress: () => void; ghost?: boolean }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale: s }] }}>
      <T onPress={onPress} onPressIn={() => Animated.spring(s, { toValue: 0.95, useNativeDriver: native, speed: 40, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(s, { toValue: 1, useNativeDriver: native, speed: 18, bounciness: 10 }).start()}
        size={15} weight="m" color={ghost ? A.copper : '#fff'} accessibilityRole="button"
        style={{ paddingHorizontal: 22, paddingVertical: 14, borderRadius: 26, overflow: 'hidden', backgroundColor: ghost ? 'transparent' : A.copper, borderWidth: ghost ? 1.2 : 0, borderColor: A.copperSoft }}>{title}</T>
    </Animated.View>
  );
}
