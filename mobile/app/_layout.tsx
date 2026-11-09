import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { AuthProvider } from '@/auth';
import CookieBanner from '@/CookieBanner';
import { C } from '@/theme';
import { DeviceFrame, DeviceInsets, shouldFrame } from '@/DeviceFrame';
import { ToastHost } from '@/kit/ui';
import { K } from '@/kit/tokens';
import { loadStore } from '@/data/store';

/** Pushed screens inside the crew app slide in natively on iOS; on web each page animates itself (src/kit/page.tsx). */
const PUSHED = ['signals', 'assistant/history', 'assistant/menu', 'training/sets', 'training/[id]', 'training/setup', 'profile/edit', 'profile/mission', 'profile/privacy', 'integrations', 'report', 'metric/[key]', 'legal/[doc]'];

export default function Root() {
  const [loaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, GeistMono_400Regular, GeistMono_500Medium });
  useEffect(() => { loadStore(); }, []);
  if (shouldFrame) return <DeviceFrame />; // ?frame=1 on desktop → the app inside an iPhone-sized frame
  if (!loaded) return <View style={{ flex: 1, backgroundColor: '#F8EEE8' }} />;
  return (
    <SafeAreaProvider>
      <DeviceInsets>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade_from_bottom' }}>
          {/* onboarding screens animate themselves (src/motion.tsx), so the native stack transition is off */}
          {['intro', 'welcome', '(auth)/name', '(auth)/age', '(auth)/mission', '(auth)/email', '(auth)/code', '(auth)/login', '(auth)/done'].map(n => (
            <Stack.Screen key={n} name={n} options={{ animation: 'none', contentStyle: { backgroundColor: '#F8EEE8' } }} />
          ))}
          <Stack.Screen name="(tabs)" options={{ animation: 'fade', contentStyle: { backgroundColor: K.canvas } }} />
          {PUSHED.map(n => <Stack.Screen key={n} name={n} options={{ animation: 'slide_from_right', gestureEnabled: true, contentStyle: { backgroundColor: K.canvas } }} />)}
          <Stack.Screen name="training/active" options={{ animation: 'slide_from_bottom', gestureEnabled: false, contentStyle: { backgroundColor: K.canvas } }} />
          <Stack.Screen name="checkin" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="log" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
        <CookieBanner />
        <ToastHost />
      </AuthProvider>
      </DeviceInsets>
    </SafeAreaProvider>
  );
}
