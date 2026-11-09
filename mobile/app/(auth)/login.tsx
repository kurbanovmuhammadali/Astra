import React, { useState } from 'react';
import { View } from 'react-native';
import { nav } from '@/motion';
import { Press } from '@/astra';
import { A } from '@/theme';
import { T } from '@/ui';
import { FormShell, Input, Star } from '@/astra';
import { useDraft } from '@/onboarding';
import { useAuth } from '@/auth';

const DEMO_EMAIL = 'crew@astra.demo';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Crew log in: accounts are prepared by the mission, so it's just email → 4-digit code. */
export default function Login() {
  const [d, set] = useDraft();
  const { requestCode } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = EMAIL_RE.test(d.email.trim());
  const next = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await requestCode(d.email.trim(), 'login');
      set({ devCode: r.devCode ?? '' });
      nav.push({ pathname: '/code', params: { purpose: 'login' } });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <FormShell title="Log in" sub="Crew accounts are set up by your mission. Enter your email and we’ll send you a code."
      top={<View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: A.copper, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 14 }}><Star size={30} color="#fff" /></View>}
      onBack={() => nav.back('/welcome')} onNext={next} nextDisabled={!valid} nextLoading={busy} nextLabel="Send code">
      <Input label="Email" required value={d.email} onChangeText={v => { set({ email: v }); setErr(null); }} valid={valid} placeholder="name@crew.agency"
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" focusOnEnter
        returnKeyType="send" onSubmitEditing={() => valid && next()} error={err} />
      {__DEV__ ? (
        <Press onPress={() => { set({ email: DEMO_EMAIL }); setErr(null); }} label="Use the demo crew account"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: A.line }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: A.sand2, alignItems: 'center', justifyContent: 'center' }}><Star size={16} /></View>
          <View style={{ flex: 1 }}>
            <T size={14} weight="m" color={A.ink}>Use the demo crew account</T>
            <T size={12} color={A.ink3}>{DEMO_EMAIL} · sample data</T>
          </View>
        </Press>
      ) : null}
      <T size={13} color={A.ink3} style={{ marginTop: 14, marginLeft: 4 }}>New here? <T size={13} weight="m" color={A.copper} onPress={() => nav.replace('/name')}>Get started</T></T>
    </FormShell>
  );
}
