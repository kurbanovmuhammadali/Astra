import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { nav } from '@/motion';
import { A } from '@/theme';
import { T } from '@/ui';
import { FormShell, Input, Star } from '@/astra';
import { api } from '@/api';
import { clearRelativeToken, getRelativeToken, setRelativeToken } from '@/data/relative';

/** Family sign-in: no account, no link. The astronaut reads out an 8-character code; this device then remembers it. */
export default function Relative() {
  const { code: preset } = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [checking, setChecking] = useState(true);
  const norm = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const pretty = (v: string) => (v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v);

  const enter = async (c: string) => {
    setBusy(true); setErr(null);
    try { const r = await api<{ token: string }>('/api/relative/login', { body: { code: c } }); setRelativeToken(r.token); router.replace(`/f/${r.token}` as any); }
    catch (e: any) { setErr(e.message ?? 'That code did not work.'); } finally { setBusy(false); }
  };
  useEffect(() => { // this device already signed in: go straight to the chat
    (async () => {
      const t = getRelativeToken();
      if (t) { try { await api(`/api/family/${t}/info`); router.replace(`/f/${t}` as any); return; } catch { clearRelativeToken(); } }
      if (typeof preset === 'string' && preset) { setCode(norm(preset)); await enter(norm(preset)); }
      setChecking(false);
    })();
  }, []);

  const valid = code.length === 8;
  return (
    <FormShell title="Family sign-in" sub="Type the 8-character code your astronaut gave you. It works on any phone or computer. No account, no app."
      top={<View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: A.copper, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 14 }}><Star size={30} color="#fff" /></View>}
      onBack={() => nav.back('/welcome')} onNext={() => enter(code)} nextDisabled={!valid || checking} nextLoading={busy} nextLabel="Open chat">
      <Input label="Family code" required value={pretty(code)} onChangeText={v => { setCode(norm(v)); setErr(null); }} valid={valid} placeholder="ABCD-EFGH"
        autoCapitalize="characters" autoCorrect={false} focusOnEnter returnKeyType="go" onSubmitEditing={() => valid && enter(code)} error={err} />
      <T size={12.5} color={A.ink3} style={{ marginTop: 12, lineHeight: 18 }}>Your astronaut finds the code in Celeste under Family. It is valid for 14 days and can be replaced at any time. From space there are no calls: you send each other videos, photos and messages.</T>
    </FormShell>
  );
}
