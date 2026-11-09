import React from 'react';
import { router } from 'expo-router';
import { nav } from '@/motion';
import { A } from '@/theme';
import { T } from '@/ui';
import { CheckRow, FormShell, Input } from '@/astra';
import { useDraft } from '@/onboarding';

export default function Name() {
  const [d, set] = useDraft();
  const ok = d.firstName.trim().length > 0 && d.lastName.trim().length > 0 && d.acceptTerms;
  return (
    <FormShell step={1} title="What should we call you?" sub="We’ll use your name to personalise Astra throughout your mission."
      onBack={() => nav.back('/welcome')} onNext={() => nav.push('/age')} nextDisabled={!ok}>
      <Input label="First name" required value={d.firstName} onChangeText={v => set({ firstName: v })} valid={d.firstName.trim().length > 1} placeholder="e.g. Joseph" autoComplete="given-name" textContentType="givenName" focusOnEnter returnKeyType="next" />
      <Input label="Last name" required value={d.lastName} onChangeText={v => set({ lastName: v })} valid={d.lastName.trim().length > 1} placeholder="e.g. Brown" autoComplete="family-name" textContentType="familyName" />
      <CheckRow checked={d.acceptTerms} onChange={v => set({ acceptTerms: v })}>
        <T size={13.5} color={A.ink2} style={{ lineHeight: 19 }}>
          I agree to the <T size={13.5} weight="m" color={A.copper} onPress={() => router.push('/legal/terms')}>Terms of Service</T> and <T size={13.5} weight="m" color={A.copper} onPress={() => router.push('/legal/privacy')}>Privacy Policy</T>, including Astra processing my health data.
        </T>
      </CheckRow>
    </FormShell>
  );
}
