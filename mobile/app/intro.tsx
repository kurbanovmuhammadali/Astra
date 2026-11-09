/**
 * First-launch intro (plays once). This is the in-app animated version built from the Astra artwork.
 * When the final commercial clip is ready, drop the MP4 into assets/astra/ and swap <Scenes/> for a
 * full-screen video player — Skip, progress and the hand-off to /welcome stay the same.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { A } from '@/theme';
import { T } from '@/ui';
import { AstraLogo, IMG, RATIO } from '@/astra';
import { setFlag } from '@/storage';

const DURATION = 10; // seconds
const native = Platform.OS !== 'web';

export default function Intro() {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const t = useRef(new Animated.Value(0)).current;
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    t.stopAnimation();
    setFlag('introSeen');
    router.replace('/welcome');
  };
  useEffect(() => {
    Animated.timing(t, { toValue: DURATION, duration: DURATION * 1000, easing: Easing.linear, useNativeDriver: native }).start(({ finished }) => finished && finish());
  }, []);

  const i = (input: number[], output: number[] | string[]) => t.interpolate({ inputRange: input, outputRange: output as any, extrapolate: 'clamp' });
  const w = Math.min(W, 520);

  const headline = (from: number, to: number, title: string, sub?: string) => (
    <Animated.View style={{ position: 'absolute', left: 26, right: 26, bottom: insets.bottom + 92, opacity: i([from, from + 0.5, to - 0.45, to], [0, 1, 1, 0]), transform: [{ translateY: i([from, from + 0.6], [24, 0]) }] }}>
      <T size={40} weight="sb" color="#fff" style={{ letterSpacing: -1, lineHeight: 44 }}>{title}</T>
      {sub ? <T size={15.5} color="rgba(255,255,255,0.82)" style={{ marginTop: 12, lineHeight: 22, maxWidth: 360 }}>{sub}</T> : null}
    </Animated.View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: A.space, overflow: 'hidden' }}>
      <Animated.Image source={IMG.mars} resizeMode="cover" style={{ position: 'absolute', width: W, height: H, transform: [{ scale: i([0, DURATION], [1.18, 1]) }] }} />
      <LinearGradient colors={['rgba(28,18,13,0.55)', 'rgba(28,18,13,0)', 'rgba(28,18,13,0.15)', 'rgba(28,18,13,0.85)']} locations={[0, 0.3, 0.6, 1]} style={{ position: 'absolute', inset: 0 } as any} />

      {/* 1 · Collect — signals sweep in */}
      <Animated.View style={{ position: 'absolute', left: (W - w * 1.15) / 2, top: H * 0.2, opacity: i([0, 0.6, 2.9, 3.4], [0, 1, 1, 0]), transform: [{ translateX: i([0, 1.3, 3.4], [-W * 0.7, 0, W * 0.18]) }, { rotate: i([0, 1.3], ['-8deg', '0deg']) }] }}>
        <Image source={IMG.wave} style={{ width: w * 1.15, height: (w * 1.15) / RATIO.wave }} resizeMode="contain" />
      </Animated.View>
      {headline(0.2, 3.4, 'Your body\nsends signals.', 'Astra collects them from your wearable: sleep, recovery, heart.')}

      {/* 2 · Understand — the body appears */}
      <Animated.View style={{ position: 'absolute', left: (W - w) / 2, top: H * 0.1, opacity: i([3.1, 3.8, 6.3, 6.8], [0, 1, 1, 0]), transform: [{ scale: i([3.1, 4.6, 6.8], [0.8, 1, 1.07]) }] }}>
        <Image source={IMG.body} style={{ width: w, height: w / RATIO.body }} resizeMode="contain" />
      </Animated.View>
      {headline(3.4, 6.8, 'We turn them into\na clear picture.', 'Your body, system by system, compared with your own baseline.')}

      {/* 3 · Act — the ship flies in, logo lands */}
      <Animated.View style={{ position: 'absolute', left: W * 0.08, top: H * 0.16, opacity: i([6.5, 6.9], [0, 1]), transform: [{ translateX: i([6.5, 8], [W * 0.8, 0]) }, { translateY: i([6.5, 8, DURATION], [H * 0.2, 0, -10]) }, { scale: i([6.5, 8], [0.6, 1]) }] }}>
        <Image source={IMG.ship} style={{ width: w * 0.86, height: (w * 0.86) / RATIO.ship }} resizeMode="contain" />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', left: 26, right: 26, bottom: insets.bottom + 92, opacity: i([7.2, 7.9], [0, 1]), transform: [{ translateY: i([7.2, 7.9], [24, 0]) }] }}>
        <AstraLogo color="#fff" star={A.copperSoft} size={16} />
        <T size={44} weight="sb" color="#fff" style={{ letterSpacing: -1, lineHeight: 48, marginTop: 14 }}>{'Care beyond\nEarth.'}</T>
      </Animated.View>

      {/* chrome: progress + skip */}
      <View style={{ position: 'absolute', left: 26, bottom: insets.bottom + 44, flexDirection: 'row', gap: 6 }}>
        {[0, 1, 2].map(k => (
          <View key={k} style={{ width: 34, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
            <Animated.View style={{ width: 34, height: 3, backgroundColor: '#fff', transform: [{ translateX: i([k * 3.33, (k + 1) * 3.33], [-34, 0]) }] }} />
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Skip intro" onPress={finish}
        style={{ position: 'absolute', top: insets.top + 14, right: 20, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}>
        <T size={14} weight="m" color={A.ink}>Skip</T>
      </Pressable>
      <View style={{ position: 'absolute', top: insets.top + 18, left: 22 }}><AstraLogo color="#fff" star={A.copperSoft} size={15} /></View>
    </View>
  );
}
