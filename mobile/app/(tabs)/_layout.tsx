import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, View } from 'react-native';
import { Redirect, Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { House, Dumbbell, Sparkles, PersonStanding, User } from 'lucide-react-native';
import { useAuth } from '@/auth';
import { AstraLogo } from '@/astra';
import { ELEV, K, native } from '@/kit/tokens';
import { Kicker, Pressy, Txt, haptic, useLayout } from '@/kit/core';
import { Backdrop } from '@/kit/page';
import { Dot } from '@/kit/ui';

// Home · Training · Assistant · Body · Profile
const TABS: { name: string; icon: any; label: string }[] = [
  { name: 'today', icon: House, label: 'Home' },
  { name: 'plan', icon: Dumbbell, label: 'Training' },
  { name: 'assistant', icon: Sparkles, label: 'Assistant' },
  { name: 'body', icon: PersonStanding, label: 'Body' },
  { name: 'profile', icon: User, label: 'Profile' },
];

function TabIcon({ icon: Icon, on }: { icon: any; on: boolean }) {
  const a = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.spring(a, { toValue: on ? 1 : 0, useNativeDriver: native, speed: 16, bounciness: 12 }).start(); }, [on]);
  return (
    <Animated.View style={{ transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }, { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) }] }}>
      <Icon size={20} color={on ? '#fff' : K.ink2} strokeWidth={on ? 2 : 1.7} />
    </Animated.View>
  );
}

/** Floating dock: a copper bubble glides to the active tab and the icon pops. */
function Dock({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const routes = state.routes.filter((r: any) => TABS.some(t => t.name === r.name));
  const active = Math.max(0, routes.findIndex((r: any) => r.key === state.routes[state.index]?.key));
  const x = useRef(new Animated.Value(active)).current;
  const squish = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(x, { toValue: active, useNativeDriver: native, speed: 14, bounciness: 7 }),
      Animated.sequence([
        Animated.timing(squish, { toValue: 1.25, duration: 120, useNativeDriver: native }),
        Animated.spring(squish, { toValue: 1, useNativeDriver: native, speed: 12, bounciness: 10 }),
      ]),
    ]).start();
  }, [active]);
  const seg = w / Math.max(1, routes.length);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom - 6, 12), alignItems: 'center', paddingHorizontal: 14 }}>
      <View style={[{ width: '100%', maxWidth: 440, borderRadius: 32 }, ELEV.float]}>
        <BlurView intensity={native ? 80 : 40} tint="light" style={{ borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' }}>
          <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width - 12)} style={{ flexDirection: 'row', padding: 6, backgroundColor: 'rgba(255,250,246,0.82)' }}>
            {w > 0 ? (
              <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 6 + seg / 2 - 21, width: 42, height: 42, borderRadius: 21, backgroundColor: K.copper,
                transform: [{ translateX: Animated.multiply(x, seg) }, { scaleX: squish }] }} />
            ) : null}
            {routes.map((r: any, i: number) => {
              const t = TABS.find(t => t.name === r.name)!;
              const on = i === active;
              return (
                <Pressable key={r.key} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }}
                  onPress={() => { haptic.tap(); if (!on) navigation.navigate(r.name); }} style={{ flex: 1, alignItems: 'center', paddingTop: 2 }}>
                  <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}><TabIcon icon={t.icon} on={on} /></View>
                  <Txt v="caption" color={on ? K.copperInk : K.ink2} style={{ fontSize: 10.5, marginTop: 1, fontFamily: on ? 'Geist_600SemiBold' : 'Geist_400Regular' }}>{t.label}</Txt>
                </Pressable>
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

/** Desktop web: a calm left rail with the same five destinations. */
function Sidebar() {
  const path = usePathname();
  const cur = TABS.find(t => path.startsWith('/' + t.name))?.name ?? 'today';
  return (
    <View style={{ width: 252, paddingTop: 30, paddingHorizontal: 18, paddingBottom: 22, borderRightWidth: 1, borderRightColor: K.hair, backgroundColor: 'rgba(255,250,246,0.6)' }}>
      <View style={{ paddingHorizontal: 10 }}><AstraLogo size={17} /></View>
      <Kicker color={K.ink3} style={{ marginTop: 34, marginBottom: 10, marginLeft: 10 }}>Crew health</Kicker>
      {TABS.map(t => {
        const on = t.name === cur;
        return (
          <Pressy key={t.name} label={t.label} role="tab" selected={on} onPress={() => router.navigate(`/${t.name}` as any)} to={0.98}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, height: 46, borderRadius: 14, marginBottom: 4, backgroundColor: on ? K.copper : 'transparent' }}>
              <t.icon size={19} color={on ? '#fff' : K.ink2} strokeWidth={1.8} />
              <Txt v="bodyM" color={on ? '#fff' : K.ink}>{t.label}</Txt>
            </View>
          </Pressy>
        );
      })}
      <View style={{ flex: 1 }} />
      <View style={{ padding: 14, borderRadius: 16, backgroundColor: K.card, borderWidth: 1, borderColor: K.hair }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Dot tone="ok" pulse /><Txt v="subM">Sync active</Txt></View>
        <Txt v="caption" color={K.ink2} style={{ marginTop: 4 }}>WHOOP · Apple Health · Dosimeter</Txt>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { user, ready } = useAuth();
  const { sidebar } = useLayout();
  if (!ready) return <View style={{ flex: 1, backgroundColor: K.canvas }}><Backdrop /></View>;
  if (!user) return <Redirect href="/welcome" />;
  const tabs = (
    <Tabs tabBar={p => (sidebar ? null : <Dock {...p} />)} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: K.canvas }, animation: 'shift' }}>
      <Tabs.Screen name="today" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="assistant" />
      <Tabs.Screen name="body" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="trends" options={{ href: null }} />
    </Tabs>
  );
  if (!sidebar) return tabs;
  return <View style={{ flex: 1, flexDirection: 'row', backgroundColor: K.canvas }}><Sidebar /><View style={{ flex: 1 }}>{tabs}</View></View>;
}
