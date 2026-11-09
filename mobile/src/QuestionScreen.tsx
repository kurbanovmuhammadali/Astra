import React from 'react';
import { Animated, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { A } from './theme';
import { T } from './ui';
import { AstraLogo, IMG, RATIO, RollingValue, RoundBtn, Ruler, Steps } from './astra';
import { MotionScreen, Reveal, useEntrance } from './motion';

/** Shared layout for the age / mission questions: Mars hero on top, curved ruler and big value below. */
export function useHero() {
  const { width: W, height: H } = useWindowDimensions();
  return { W, H, heroH: Math.round(Math.min(H * 0.54, 520)) };
}

function Badge({ text }: { text: string }) {
  const a = useEntrance(500);
  return (
    <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }], paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
      <T size={11.5} weight="m" color="#fff" style={{ letterSpacing: 0.8 }}>{text.toUpperCase()}</T>
    </Animated.View>
  );
}

export default function QuestionScreen({ step, question, hero, badge, ruler, value, unit, onBack, onNext }: {
  step: number; question: string; hero: React.ReactNode; badge?: string;
  ruler: React.ComponentProps<typeof Ruler>; value: string; unit: string; onBack: () => void; onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { W, heroH } = useHero();
  const imgH = W / RATIO.mars;
  const zoom = useEntrance(1400);
  return (
    <View style={{ flex: 1, backgroundColor: A.sand }}>
      <MotionScreen>
        <View style={{ height: heroH, overflow: 'hidden' }}>
          <Animated.Image source={IMG.mars} resizeMode="cover" style={{ position: 'absolute', left: 0, width: W, height: imgH, top: heroH - imgH * 0.74,
            transform: [{ scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) }, { translateY: zoom.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }} />
          {hero}
          <LinearGradient pointerEvents="none" colors={['rgba(248,238,232,0)', A.sand]} locations={[0.72, 1]} style={{ position: 'absolute', inset: 0 } as any} />
          <View style={{ position: 'absolute', top: insets.top + 14, left: 22, right: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AstraLogo color="#fff" star={A.copperSoft} size={16} />
            {badge ? <Badge key={badge} text={badge} /> : null}
          </View>
        </View>

        <View style={{ flex: 1, alignItems: 'center', paddingBottom: insets.bottom + 24, marginTop: -26 }}>
          <Reveal i={1}><Steps n={step} /></Reveal>
          <Reveal i={2}><T size={28} weight="sb" color={A.ink} center style={{ letterSpacing: -0.6, marginTop: 14, paddingHorizontal: 24 }}>{question}</T></Reveal>
          <Reveal i={3} style={{ flex: 1, justifyContent: 'center', minHeight: 110 }}>
            <Ruler width={Math.min(W - 24, 420)} {...ruler} />
          </Reveal>
          <Reveal i={4} from={30} style={{ width: '100%', maxWidth: 470, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <RoundBtn dir="back" onPress={onBack} />
            <RollingValue value={value} unit={unit} />
            <RoundBtn dir="next" onPress={onNext} />
          </Reveal>
        </View>
      </MotionScreen>
    </View>
  );
}
