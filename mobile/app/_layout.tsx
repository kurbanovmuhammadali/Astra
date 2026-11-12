import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold } from '@expo-google-fonts/inter-tight';
import { AuthProvider } from '@/auth';
import { ReplayProvider } from '@/replay';
import CookieBanner from '@/CookieBanner';
import { C } from '@/theme';
import { DeviceFrame, DeviceInsets, shouldFrame } from '@/DeviceFrame';

export default function Root() {
  const [loaded] = useFonts({ InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold });
  if (shouldFrame) return <DeviceFrame />; // desktop browser → show the app inside an iPhone-sized frame
  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <DeviceInsets>
      <AuthProvider>
      <ReplayProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade_from_bottom' }}>
          {/* onboarding screens animate themselves (src/motion.tsx), so the native stack transition is off */}
          {['intro', 'welcome', '(auth)/name', '(auth)/age', '(auth)/sex', '(auth)/height', '(auth)/weight', '(auth)/mission', '(auth)/email', '(auth)/code', '(auth)/login', '(auth)/done'].map(n => (
            <Stack.Screen key={n} name={n} options={{ animation: 'none', contentStyle: { backgroundColor: '#F8EEE8' } }} />
          ))}
          <Stack.Screen name="checkin" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="log" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
        <CookieBanner />
      </ReplayProvider>
      </AuthProvider>
      </DeviceInsets>
    </SafeAreaProvider>
  );
}
