import React from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, Dumbbell, Sparkles, PersonStanding, User } from 'lucide-react-native';
import { useAuth } from '@/auth';
import { A } from '@/theme';
import { Loading, T } from '@/ui';
import { shadowSoft } from '@/astra';

// Home · Training (their actual plan) · AI assistant (Gemini) · Body (3D model) · Profile
const TABS: Record<string, { icon: any; label: string }> = {
  today: { icon: House, label: 'Home' },
  plan: { icon: Dumbbell, label: 'Training' },
  assistant: { icon: Sparkles, label: 'Insights' },
  body: { icon: PersonStanding, label: 'Body' },
  profile: { icon: User, label: 'Profile' },
};

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r: any) => TABS[r.name]);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12), alignItems: 'center', paddingHorizontal: 14 }}>
      <View style={[{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', maxWidth: 480, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 30, paddingVertical: 8, paddingHorizontal: 6 }, shadowSoft]}>
        {routes.map((r: any) => {
          const on = state.routes[state.index]?.key === r.key;
          const { icon: Icon, label } = TABS[r.name];
          return (
            <Pressable key={r.key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }}
              onPress={() => { if (!on) navigation.navigate(r.name); }} style={{ alignItems: 'center', width: 64 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? A.copper : 'transparent' }}>
                <Icon size={20} color={on ? '#fff' : A.ink} strokeWidth={1.8} />
              </View>
              <T size={10.5} weight={on ? 'm' : 'r'} color={on ? A.copper : A.ink2} style={{ marginTop: 2 }}>{label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={p => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: A.sand } }}>
      <Tabs.Screen name="today" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="assistant" />
      <Tabs.Screen name="body" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="trends" options={{ href: null }} />
    </Tabs>
  );
}
