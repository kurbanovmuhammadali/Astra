import React from 'react';
import { Pressable, View } from 'react-native';
import { Redirect } from 'expo-router';
import { nav } from '@/motion';
import { A } from '@/theme';
import { T } from '@/ui';
import { FormShell } from '@/astra';
import { useDraft } from '@/onboarding';

const OPTIONS: { key: 'male' | 'female' | 'other'; label: string; note: string }[] = [
  { key: 'male', label: 'Male', note: '' },
  { key: 'female', label: 'Female', note: '' },
  { key: 'other', label: 'Prefer not to say', note: 'We use an average of the two formulas' },
];

/** Biological sex is only used for the energy-needs formula (Mifflin–St Jeor); it is never shown to anyone else. */
export default function Sex() {
  const [d, set] = useDraft();
  if (!d.firstName) return <Redirect href="/name" />;
  return (
    <FormShell step={3} title="Your biology" sub="Sex, height and weight set how many calories your body needs each day. Only you see this."
      onBack={() => nav.back('/age')} onNext={() => nav.push('/height')} nextDisabled={!d.sex}>
      <View style={{ gap: 10 }}>
        {OPTIONS.map(o => {
          const on = d.sex === o.key;
          return (
            <Pressable key={o.key} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => set({ sex: o.key })}
              style={{ paddingVertical: 16, paddingHorizontal: 18, borderRadius: 18, backgroundColor: on ? A.copper : '#fff', borderWidth: 1, borderColor: on ? A.copper : A.line }}>
              <T size={16} weight="m" color={on ? '#fff' : A.ink}>{o.label}</T>
              {o.note ? <T size={12} color={on ? 'rgba(255,255,255,0.85)' : A.ink3} style={{ marginTop: 2 }}>{o.note}</T> : null}
            </Pressable>
          );
        })}
      </View>
    </FormShell>
  );
}
