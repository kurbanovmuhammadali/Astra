import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Txt } from '@/kit/core';
import { A } from '@/theme';
import { useAuth } from '@/auth';

/** One link for judges: no registration, no password. /demo signs in as the demo astronaut; /demo?as=doctor, leader or iss for the other demo accounts. */
export default function Demo() {
  const { as } = useLocalSearchParams<{ as?: string }>();
  const { demoLogin, user, ready } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const who = as === 'doctor' ? 'doctor' : as === 'leader' ? 'leader' : as === 'iss' ? 'astronaut-iss' : 'astronaut';
  useEffect(() => { if (!ready) return; /* wait for the first session check, or its late answer could overwrite the sign-in */ demoLogin(who as any).catch(e => setErr(e?.message ?? 'The demo is not available right now.')); }, [ready]);
  // go only once the signed-in state is really in place, so the destination does not send you back to Welcome
  useEffect(() => { if (user) router.replace(user.role === 'surgeon' ? '/admin' : user.role === 'leader' ? '/admin/leader' : '/today'); }, [user]);
  return (
    <View style={{ flex: 1, backgroundColor: A.sand, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Txt v="title" center>{err ? 'The demo is not available' : 'Opening the Celeste demo…'}</Txt>
      <Txt v="sub" color={A.ink2} center style={{ marginTop: 8 }}>{err ?? 'No registration needed. You are signed in as a demo astronaut with ready-made data.'}</Txt>
      {err ? <Txt v="subM" color={A.copper} center style={{ marginTop: 16 }} onPress={() => router.replace('/login')}>Go to sign in</Txt> : null}
    </View>
  );
}
