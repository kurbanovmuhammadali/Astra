import React from 'react';
import { Redirect } from 'expo-router';
import { useDraft } from '@/onboarding';
import { nav } from '@/motion';
import QuestionScreen from '@/QuestionScreen';
import { Ship } from './age';

export default function Weight() {
  const [d, set] = useDraft();
  if (!d.firstName) return <Redirect href="/name" />;
  return (
    <QuestionScreen
      step={5}
      question="How much do you weigh?"
      hero={<Ship />}
      ruler={{ min: 30, max: 200, step: 1, majorEvery: 10, value: d.weightKg, onChange: v => set({ weightKg: v }) }}
      value={String(d.weightKg)}
      unit="kg"
      onBack={() => nav.back('/height')}
      onNext={() => nav.push('/mission')}
    />
  );
}
