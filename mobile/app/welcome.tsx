import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth';
import { nav, MotionScreen } from '@/motion';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { A } from '@/theme';
import { T } from '@/ui';
import { AstraLogo, Floaty, IMG, Pill, RATIO } from '@/astra';
import { draft } from '@/onboarding';

const native = Platform.OS !== 'web';

/** Welcome: the title rises in on its own, then slides up while the two paths fade in. */
export default function Welcome() {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { guest } = useAuth();
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoErr, setDemoErr] = useState<string | null>(null);
  const a = useRef(new Animated.Value(0)).current;   // title in
  const b = useRef(new Animated.Value(0)).current;   // title up + buttons in
  useEffect(() => {
    Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.delay(700),
      Animated.timing(b, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
    ]).start();
  }, []);
  const shipW = Math.min(W * 0.78, 420);

  return (
    <View style={{ flex: 1, backgroundColor: A.sand }}>
      <MotionScreen>
      <Image source={IMG.mars} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, width: W, height: H * 0.72 }} />
      <LinearGradient colors={['rgba(248,238,232,0)', 'rgba(248,238,232,0.55)', A.sand]} locations={[0.35, 0.62, 0.9]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: H * 0.72 }} />
      <Floaty amp={7} dur={3600} rotate={1.5} style={{ position: 'absolute', top: H * 0.1, right: -shipW * 0.12 }}>
        <Image source={IMG.ship} style={{ width: shipW, height: shipW / RATIO.ship }} resizeMode="contain" />
      </Floaty>

      <View style={{ position: 'absolute', top: insets.top + 16, left: 24 }}><AstraLogo color="#fff" star={A.copperSoft} /></View>

      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: insets.bottom + 34, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        <Animated.View style={{ opacity: a, transform: [
          { translateY: Animated.add(a.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }), b.interpolate({ inputRange: [0, 1], outputRange: [150, 0] })) },
          { scale: b.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) },
        ] }}>
          <T size={40} weight="sb" color={A.ink} style={{ letterSpacing: -1.2, lineHeight: 44 }}>{'Welcome to\nASTRA'}</T>
          <T size={15.5} color={A.ink2} style={{ marginTop: 10, lineHeight: 22 }}>Your health companion for life beyond Earth.</T>
        </Animated.View>

        <Animated.View style={{ opacity: b, transform: [{ translateY: b.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }], marginTop: 30 }}>
          <Pill title="Log in" onPress={() => nav.push('/login')} />
          <T size={12.5} color={A.ink2} center style={{ marginTop: 8 }}>Crew member? Your account is ready.</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: A.line }} /><T size={13} color={A.ink3}>or</T><View style={{ flex: 1, height: 1, backgroundColor: A.line }} />
          </View>
          <Pill title="Get started" kind="outline" onPress={() => { draft.reset(); nav.push('/name'); }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Try the demo crew" disabled={demoBusy}
            onPress={async () => { setDemoBusy(true); setDemoErr(null); try { await guest(); router.replace('/today'); } catch (e: any) { setDemoErr(e.message); } finally { setDemoBusy(false); } }}
            style={{ marginTop: 16, alignItems: 'center', paddingVertical: 6 }}>
            <T size={14} weight="m" color={A.copper}>{demoBusy ? 'Preparing the crew…' : 'Try the demo crew →'}</T>
            <T size={11.5} color={A.ink3} style={{ marginTop: 2 }}>No sign-up · synthetic Mars-transit data</T>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="See real NASA data from Inspiration4" disabled={demoBusy}
            onPress={async () => { setDemoBusy(true); setDemoErr(null); try { await guest('osdr'); router.replace('/today'); } catch (e: any) { setDemoErr(e.message); } finally { setDemoBusy(false); } }}
            style={{ marginTop: 6, alignItems: 'center', paddingVertical: 6 }}>
            <T size={14} weight="m" color={A.copper}>See real NASA data (Inspiration4) →</T>
            <T size={11.5} color={A.ink3} style={{ marginTop: 2 }}>Actual blood-count results from NASA OSDR</T>
          </Pressable>
          {demoErr ? <T size={12} color="#D9583F" center style={{ marginTop: 4 }}>{demoErr}</T> : null}
        </Animated.View>
      </View>
      </MotionScreen>
    </View>
  );
}
