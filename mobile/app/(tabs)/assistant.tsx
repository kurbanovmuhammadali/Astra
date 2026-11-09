import React from 'react';
import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { A } from '@/theme';
import { T } from '@/ui';
import { AstraLogo, Floaty, IMG, RATIO } from '@/astra';

/** AI assistant tab (Gemini-based). Placeholder until the assistant is designed. */
export default function Assistant() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: A.sand, paddingTop: insets.top + 12, paddingHorizontal: 22 }}>
      <AstraLogo size={16} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 120 }}>
        <Floaty amp={6} rotate={3}><Image source={IMG.wave} style={{ width: 300, height: 300 / RATIO.wave }} resizeMode="contain" /></Floaty>
        <T size={26} weight="sb" color={A.ink} center style={{ marginTop: 12, letterSpacing: -0.5 }}>Astra Assistant</T>
        <T size={15} color={A.ink2} center style={{ marginTop: 8, lineHeight: 21, maxWidth: 320 }}>Ask about your body and your plan, powered by Gemini. Coming soon.</T>
      </View>
    </View>
  );
}
