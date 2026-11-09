/**
 * Mission length. Entering from the age screen, the big drifting ship shrinks and slides onto its route.
 * Dragging the scale moves the ship along the route; crossing a threshold swaps the whole route:
 *   0.5–1 yr Earth orbit · 1.5–2 yr Moon figure-8 · 2.5–4 yr Mars round trip · 4.5–10 yr Jupiter via a Mars fly-by.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, View } from 'react-native';
import { Redirect } from 'expo-router';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop, Text as SvgText, ClipPath, Rect } from 'react-native-svg';
import { A, F } from '@/theme';
import { Floaty, IMG, RATIO } from '@/astra';
import { EASE_OUT, nav } from '@/motion';
import { DEST_LABEL, DEST_RANGE, destinationFor, useDraft, type Destination } from '@/onboarding';
import QuestionScreen, { useHero } from '@/QuestionScreen';

const native = Platform.OS !== 'web';
const lerpPt = (pts: Pt[], u: number): Pt => { const x = Math.max(0, Math.min(1, u)) * (pts.length - 1), i = Math.floor(x), t = x - i, a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
type Pt = [number, number];
type Body = { x: number; y: number; r: number; kind: 'earth' | 'moon' | 'jupiter' | 'site'; label: string };
type Route = { pts: Pt[]; back?: Pt[]; bodies: Body[]; ship: number };

const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 90): Pt[] => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
});

function routeFor(dest: Destination, W: number, h: number): Route {
  switch (dest) {
    case 'orbit': { // tilted ring around a big Earth
      const cx = W * 0.5, cy = h * 0.44, rx = W * 0.4, ry = h * 0.1, rot = -0.2;
      const pts: Pt[] = Array.from({ length: 121 }, (_, i) => {
        const a = Math.PI * 0.55 + (i / 120) * Math.PI * 2;
        const x = rx * Math.cos(a), y = ry * Math.sin(a);
        return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
      });
      return { pts, bodies: [{ x: cx, y: cy, r: Math.min(W, h) * 0.15, kind: 'earth', label: 'Earth' }], ship: 54 };
    }
    case 'moon': { // figure-8 free-return between Earth and Moon
      const E: Pt = [W * 0.2, h * 0.5], M: Pt = [W * 0.8, h * 0.26];
      const cx = (E[0] + M[0]) / 2, cy = (E[1] + M[1]) / 2, ang = Math.atan2(M[1] - E[1], M[0] - E[0]);
      const a = Math.hypot(M[0] - E[0], M[1] - E[1]) / 2 + 24, b = h * 0.2;
      const pts: Pt[] = Array.from({ length: 161 }, (_, i) => {
        const t = -Math.PI / 2 + (i / 160) * Math.PI * 2;
        const x = a * Math.cos(t), y = b * Math.sin(t) * Math.cos(t);
        return [cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)];
      });
      return { pts, bodies: [{ x: E[0], y: E[1], r: 26, kind: 'earth', label: 'Earth' }, { x: M[0], y: M[1], r: 13, kind: 'moon', label: 'Moon' }], ship: 50 };
    }
    case 'mars': { // out to the Martian surface and back (dotted)
      const E: Pt = [W * 0.15, h * 0.22], S: Pt = [W * 0.72, h * 0.7];
      return {
        pts: bez(E, [W * 0.55, h * 0.02], [W * 0.92, h * 0.3], S),
        back: bez(S, [W * 0.5, h * 0.62], [W * 0.2, h * 0.5], E),
        bodies: [{ x: E[0], y: E[1], r: 15, kind: 'earth', label: 'Earth' }, { x: S[0], y: S[1], r: 6, kind: 'site', label: 'Mars' }], ship: 46,
      };
    }
    case 'jupiter': { // long haul with a Mars fly-by
      const E: Pt = [W * 0.12, h * 0.3], J: Pt = [W * 0.76, h * 0.34];
      return {
        pts: bez(E, [W * 0.3, h * 0.95], [W * 0.62, h * 0.85], J),
        bodies: [{ x: E[0], y: E[1], r: 11, kind: 'earth', label: 'Earth' }, { x: J[0], y: J[1], r: 30, kind: 'jupiter', label: 'Jupiter' }], ship: 42,
      };
    }
  }
}

const toD = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

function BodyMark({ b }: { b: Body }) {
  const lbl = <SvgText x={b.x} y={b.y - b.r - 9} fill="#fff" fontSize={11.5} fontFamily={F.m} textAnchor="middle" opacity={0.9}>{b.label}</SvgText>;
  if (b.kind === 'site') return <G><Circle cx={b.x} cy={b.y} r={b.r + 7} fill="#FFD9C2" opacity={0.25} /><Circle cx={b.x} cy={b.y} r={b.r} fill="#fff" stroke={A.copper} strokeWidth={2} />{lbl}</G>;
  const fill = b.kind === 'earth' ? 'url(#earth)' : b.kind === 'moon' ? 'url(#moon)' : 'url(#jup)';
  const glow = b.kind === 'earth' ? '#7FB2FF' : b.kind === 'moon' ? '#fff' : '#F2C9A0';
  return (
    <G>
      <Circle cx={b.x} cy={b.y} r={b.r * 1.45} fill={glow} opacity={0.14} />
      <Circle cx={b.x} cy={b.y} r={b.r} fill={fill} />
      {b.kind === 'jupiter' ? (
        <G clipPath="url(#jclip)">
          {[-0.5, -0.2, 0.15, 0.45].map((k, i) => <Rect key={i} x={b.x - b.r} y={b.y + k * b.r} width={b.r * 2} height={b.r * 0.14} fill="#A8693F" opacity={0.45} />)}
        </G>
      ) : null}
      {b.kind === 'earth' ? <>
        <Ellipse cx={b.x - b.r * 0.32} cy={b.y - b.r * 0.18} rx={b.r * 0.22} ry={b.r * 0.12} fill="#FFFFFF" opacity={0.28} />
        <Ellipse cx={b.x + b.r * 0.1} cy={b.y + b.r * 0.25} rx={b.r * 0.3} ry={b.r * 0.08} fill="#FFFFFF" opacity={0.18} />
        <Circle cx={b.x} cy={b.y} r={b.r} fill="url(#night)" />
        <Circle cx={b.x} cy={b.y} r={b.r} fill="none" stroke="#A9CEFF" strokeOpacity={0.55} strokeWidth={1.2} />
      </> : null}
      {lbl}
    </G>
  );
}


function RouteArt({ route, W, h, u }: { route: Route; W: number; h: number; u: number }) {
  const at = lerpPt(route.pts, u);
  const cut = Math.max(1, Math.round(u * (route.pts.length - 1)));
  const flown = [...route.pts.slice(0, cut), at], ahead = [at, ...route.pts.slice(cut)];
  return (
    <Svg width={W} height={h}>
      <Defs>
        <RadialGradient id="earth" cx="32%" cy="30%" r="78%"><Stop offset="0" stopColor="#CFE4FF" /><Stop offset="0.35" stopColor="#5C93D6" /><Stop offset="0.7" stopColor="#1F4F8E" /><Stop offset="1" stopColor="#081B36" /></RadialGradient>
        <RadialGradient id="night" cx="85%" cy="85%" r="75%"><Stop offset="0" stopColor="#05070C" stopOpacity="0.85" /><Stop offset="0.6" stopColor="#05070C" stopOpacity="0.25" /><Stop offset="1" stopColor="#05070C" stopOpacity="0" /></RadialGradient>
        <RadialGradient id="moon" cx="35%" cy="35%" r="70%"><Stop offset="0" stopColor="#FFFFFF" /><Stop offset="1" stopColor="#9C948D" /></RadialGradient>
        <RadialGradient id="jup" cx="35%" cy="35%" r="70%"><Stop offset="0" stopColor="#FBE8D2" /><Stop offset="0.6" stopColor="#D9A57A" /><Stop offset="1" stopColor="#8A5534" /></RadialGradient>
        {route.bodies.filter(b => b.kind === 'jupiter').map(b => <ClipPath key="j" id="jclip"><Circle cx={b.x} cy={b.y} r={b.r} /></ClipPath>)}
      </Defs>
      {route.bodies.filter(b => b.kind === 'earth' && b.r > 30).map((b, i) => <BodyMark key={`bk${i}`} b={b} />)}
      {route.back ? <Path d={toD(route.back)} stroke="#F6D2BC" strokeWidth={1.6} strokeDasharray="2 7" strokeLinecap="round" fill="none" opacity={0.7} /> : null}
      <Path d={toD(ahead)} stroke="#F6D2BC" strokeWidth={1.8} strokeDasharray="5 7" strokeLinecap="round" fill="none" opacity={0.65} />
      <Path d={toD(flown)} stroke="#F3B48D" strokeWidth={2.6} strokeLinecap="round" fill="none" />
      {route.bodies.filter(b => !(b.kind === 'earth' && b.r > 30)).map((b, i) => <BodyMark key={i} b={b} />)}
      <Circle cx={at[0]} cy={at[1]} r={route.ship * 0.6} fill="#FFE2CF" opacity={0.16} />
    </Svg>
  );
}

const uFor = (dest: Destination, live: number) => {
  const [lo, hi] = DEST_RANGE[dest];
  const f = hi > lo ? (Math.min(Math.max(live, lo), hi) - lo) / (hi - lo) : 0.5;
  return 0.2 + 0.6 * f;
};

export default function Mission() {
  const [d, set] = useDraft();
  const { W, heroH: h } = useHero();
  const [live, setLive] = useState(d.missionYears);           // continuous ruler position
  const dest = destinationFor(d.missionYears);                 // snapped value decides the route
  const route = useMemo(() => routeFor(dest, W, h), [dest, W, h]);
  const u = uFor(dest, live);
  const at = lerpPt(route.pts, u);
  const shipH = route.ship / RATIO.ship;
  const target = { x: at[0] - route.ship / 2, y: at[1] - shipH / 2 };
  const busy = useRef(true);
  const targetRef = useRef(target); targetRef.current = target;
  const catchUp = () => { busy.current = false; Animated.timing(pos, { toValue: targetRef.current, duration: 180, easing: EASE_OUT, useNativeDriver: native }).start(); };

  // entry: the big ship from the age screen shrinks and glides onto its route
  const bigScale = Math.min(W * 0.86, 460) / route.ship;
  const pos = useRef(new Animated.ValueXY({ x: W / 2 - route.ship / 2, y: h * 0.36 - shipH / 2 })).current;
  const scale = useRef(new Animated.Value(bigScale)).current;
  const routeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(pos, { toValue: target, duration: 1400, delay: 250, easing: EASE_OUT, useNativeDriver: native }),
      Animated.timing(scale, { toValue: 1, duration: 1400, delay: 250, easing: EASE_OUT, useNativeDriver: native }),
      Animated.timing(routeIn, { toValue: 1, duration: 900, delay: 900, easing: EASE_OUT, useNativeDriver: native }),
    ]).start(catchUp);
  }, []);

  // within a route the ship follows the finger 1:1; crossing into a new route it glides over
  const prevDest = useRef(dest);
  const [prevRoute, setPrevRoute] = useState<Route | null>(null);
  const swap = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (prevDest.current !== dest) {
      const old = routeFor(prevDest.current, W, h);
      prevDest.current = dest;
      setPrevRoute(old);
      swap.setValue(0);
      busy.current = true;
      Animated.parallel([
        Animated.timing(swap, { toValue: 1, duration: 620, easing: EASE_OUT, useNativeDriver: native }),
        Animated.timing(pos, { toValue: target, duration: 620, easing: EASE_OUT, useNativeDriver: native }),
      ]).start(() => { catchUp(); setPrevRoute(null); });
      return;
    }
    if (!busy.current) pos.setValue(target);
  }, [dest, target.x, target.y]);

  if (!d.firstName) return <Redirect href="/name" />;

  const hero = (
    <>
      {prevRoute ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity: swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: swap.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] } as any}>
          <RouteArt route={prevRoute} W={W} h={h} u={0.5} />
        </Animated.View>
      ) : null}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity: Animated.multiply(routeIn, swap), transform: [{ scale: swap.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] } as any}>
        <RouteArt route={route} W={W} h={h} u={u} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale }] }}>
        <Floaty amp={2.5} dur={1800} rotate={3}>
          <Image source={IMG.ship} style={{ width: route.ship, height: shipH }} resizeMode="contain" />
        </Floaty>
      </Animated.View>
    </>
  );

  return (
    <QuestionScreen
      step={3}
      question="How long is your mission?"
      badge={DEST_LABEL[dest]}
      hero={hero}
      ruler={{ min: 0.5, max: 10, step: 0.5, majorEvery: 1, value: d.missionYears, onChange: v => set({ missionYears: v }), onLive: setLive, format: v => `${v} yr` }}
      value={String(d.missionYears)}
      unit={`${d.missionYears === 1 ? 'year' : 'years'} · ${DEST_LABEL[dest]}`}
      onBack={() => nav.back('/age')}
      onNext={() => nav.push('/email')}
    />
  );
}
