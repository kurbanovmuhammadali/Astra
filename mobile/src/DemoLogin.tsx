/**
 * DEMO-ONLY (temporary): "Demo astronaut" and "Demo flight surgeon" buttons on the welcome screen.
 * Shown only when the server reports demoLogin (DEMO_LOGIN=on, non-production). Delete this file and its two
 * "DEMO-ONLY" lines in app/welcome.tsx, plus `demoLogin` in src/auth.tsx. See ../DEMO_REMOVAL.md.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { nav } from '@/motion';
import { A } from '@/theme';
import { T } from '@/ui';
import { Pill } from '@/astra';
import { api } from '@/api';
import { useAuth } from '@/auth';
import { dayKey, getStore, setStore } from '@/data/store';
import { MARS_BRIEF } from '@/data/hmscMission';

export default function DemoLogin() {
  const { demoLogin } = useAuth();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState<'crew' | 'admin' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ demoLogin?: boolean }>('/api/health').then(h => setOn(!!h.demoLogin)).catch(() => setOn(false)); }, []);
  if (!on) return null;

  const go = async (as: 'crew' | 'admin') => {
    setBusy(as); setErr(null);
    try {
      await demoLogin(as);
      if (as === 'crew' && !getStore().dataMode) {
        setStore(s => ({ ...s, dataMode: 'whoop', briefing: MARS_BRIEF(), profile: { ...s.profile, age: '36', gender: 'Male', height: '178', weight: '74', duration: '900', missionStart: dayKey(-73) } }));
      }
      nav.replace(as === 'admin' ? '/admin' : '/today');
    } catch (e: any) { setErr(e.message ?? 'Demo sign-in failed.'); } finally { setBusy(null); }
  };

  return (
    <View style={{ marginTop: 14 }}>
      <T size={11.5} weight="m" color={A.ink3} center style={{ letterSpacing: 0.8, marginBottom: 8 }}>DEMO · NO REGISTRATION</T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Pill title={busy === 'crew' ? '…' : 'Demo astronaut'} kind="outline" onPress={() => go('crew')} /></View>
        <View style={{ flex: 1 }}><Pill title={busy === 'admin' ? '…' : 'Demo surgeon'} kind="outline" onPress={() => go('admin')} /></View>
      </View>
      {err ? <T size={12.5} color="#D9583F" center style={{ marginTop: 8 }}>{err}</T> : null}
    </View>
  );
}

/**
 * DEMO-ONLY: opening the admin console without being a flight surgeon signs in as the demo surgeon automatically
 * (only when the server has DEMO_LOGIN=on). Call with the screen's reload function.
 */
export function useDemoAdmin(reload: () => void) {
  const { user, ready, demoLogin } = useAuth();
  useEffect(() => {
    if (!ready || user?.role === 'surgeon') return;
    let alive = true;
    api<{ demoLogin?: boolean }>('/api/health')
      .then(h => (h.demoLogin ? demoLogin('admin').then(() => { if (alive) reload(); }) : undefined))
      .catch(() => {});
    return () => { alive = false; };
  }, [ready, user?.role]);
}
