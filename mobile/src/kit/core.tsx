/**
 * Core primitives: text, motion (focus-replayed staggered entrances, press springs, value tweens) and layout breakpoints.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleProp, Text, TextProps, TextStyle, useWindowDimensions, ViewStyle, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { K, MOTION, TYPE, TypeKey, native, web } from './tokens';

// ----------------------------------------------------------------------------- haptics
export const haptic = {
  tap: () => { if (native) Haptics.selectionAsync().catch(() => {}); },
  soft: () => { if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {}); },
  firm: () => { if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); },
  success: () => { if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
};

// ----------------------------------------------------------------------------- text
type TxtProps = TextProps & { v?: TypeKey; color?: string; center?: boolean; tabular?: boolean; upper?: boolean; style?: StyleProp<TextStyle> };
export function Txt({ v = 'body', color = K.ink, center, tabular, upper, style, ...p }: TxtProps) {
  return (
    <Text {...p} allowFontScaling={p.allowFontScaling ?? true} maxFontSizeMultiplier={1.4}
      style={[TYPE[v], { color }, center && { textAlign: 'center' }, tabular && { fontVariant: ['tabular-nums'] }, upper && { textTransform: 'uppercase' }, style]} />
  );
}
export function Kicker({ children, color = K.copperInk, style }: { children: React.ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Txt v="kicker" color={color} upper style={style}>{children}</Txt>;
}

// ----------------------------------------------------------------------------- layout
export function useLayout() {
  const { width: w, height: h } = useWindowDimensions();
  const sidebar = web && w >= 1024;
  return { w, h, wide: w >= 1024, tablet: w >= 700, sidebar, gutter: w >= 1024 ? 36 : w >= 700 ? 28 : 20 };
}

// ----------------------------------------------------------------------------- focus-replayed entrances
const Focus = createContext(0);
/** Bumps a counter every time the screen gains focus so <Rise> children replay their entrance. */
export function FocusReplay({ children }: { children: React.ReactNode }) {
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => { setTick(t => t + 1); }, []));
  return <Focus.Provider value={tick}>{children}</Focus.Provider>;
}
export const useFocusTick = () => useContext(Focus);

/** Fades and rises in; `i` staggers siblings. */
export function Rise({ i = 0, children, style, from = 16, scale, delay = 0 }: { i?: number; children: React.ReactNode; style?: StyleProp<ViewStyle>; from?: number; scale?: boolean; delay?: number }) {
  const tick = useFocusTick();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 640, delay: delay + 60 + Math.min(i, 12) * MOTION.stagger, easing: MOTION.out, useNativeDriver: native }).start();
  }, [tick]);
  const transform: any[] = [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }];
  if (scale) transform.push({ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) });
  return <Animated.View style={[style, { opacity: a, transform }]}>{children}</Animated.View>;
}

/** Re-plays a soft swap whenever `k` changes (date switches, layer changes, metric changes). */
export function Swap({ k, children, style, dir = 0 }: { k: string | number; children: React.ReactNode; style?: StyleProp<ViewStyle>; dir?: number }) {
  const a = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 420, easing: MOTION.out, useNativeDriver: native }).start();
  }, [k]);
  return (
    <Animated.View style={[style, { opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }), transform: [
      { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [dir * 14, 0] }) },
      { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [dir ? 0 : 6, 0] }) },
    ] }]}>{children}</Animated.View>
  );
}

// ----------------------------------------------------------------------------- press
type PressyProps = { children: React.ReactNode; onPress?: () => void; onLongPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; label?: string; role?: 'button' | 'tab' | 'link' | 'checkbox' | 'radio'; selected?: boolean; checked?: boolean; to?: number; hapticOn?: boolean; hitSlop?: number };
/** Springs down under the finger and back with a little overshoot; light haptic on press. */
export function Pressy({ children, onPress, onLongPress, disabled, style, label, role = 'button', selected, checked, to = 0.965, hapticOn = true, hitSlop }: PressyProps) {
  const s = useRef(new Animated.Value(1)).current;
  const spring = (v: number) => Animated.spring(s, { toValue: v, useNativeDriver: native, speed: v === 1 ? 18 : 50, bounciness: v === 1 ? 9 : 0 }).start();
  return (
    <Pressable accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected, checked }} disabled={disabled} hitSlop={hitSlop}
      onPress={() => { if (hapticOn) haptic.tap(); onPress?.(); }} onLongPress={onLongPress} onPressIn={() => spring(to)} onPressOut={() => spring(1)}
      style={web ? ({ cursor: disabled ? 'default' : 'pointer' } as any) : undefined}>
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ----------------------------------------------------------------------------- tweens
/** Smoothly tweens a number toward `target` (count-ups, gauges). Re-runs on focus when `replay` is set. */
export function useTween(target: number, duration = 900, replay = true) {
  const tick = useFocusTick();
  const [v, setV] = useState(replay ? 0 : target);
  const from = useRef(replay ? 0 : target);
  const lastTick = useRef(-1);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const a = replay && lastTick.current !== tick ? 0 : from.current;
    lastTick.current = tick;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const e = 1 - Math.pow(1 - t, 4);
      const x = a + (target - a) * e;
      from.current = x;
      setV(x);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, tick]);
  return v;
}

/** Endless 0→1 loop (orbits, pulses, shimmers). */
export function useLoop(duration: number, run = true) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!run) return;
    a.setValue(0);
    const l = Animated.loop(Animated.timing(a, { toValue: 1, duration, easing: (t: number) => t, useNativeDriver: native }));
    l.start();
    return () => l.stop();
  }, [duration, run]);
  return a;
}

export const isWeb = Platform.OS === 'web';
