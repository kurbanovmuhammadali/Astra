import React from 'react';
import { Redirect } from 'expo-router';
import { useDraft } from '@/onboarding';
import { nav } from '@/motion';
import QuestionScreen from '@/QuestionScreen';
import { Ship } from './age';

export default function Height() {
  const [d, set] = useDraft();
  if (!d.firstName) return <Redirect href="/name" />;
  return (
    <QuestionScreen
      step={4}
      question="How tall are you?"
      hero={<Ship />}
      ruler={{ min: 120, max: 220, step: 1, majorEvery: 10, value: d.heightCm, onChange: v => set({ heightCm: v }) }}
      value={String(d.heightCm)}
      unit="cm"
      onBack={() => nav.back('/sex')}
      onNext={() => nav.push('/weight')}
    />
  );
}
