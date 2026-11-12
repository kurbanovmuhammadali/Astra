import React, { useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';
import { router } from 'expo-router';
import { Link as LinkIcon, FileText, Download, Lock, Cookie, LogOut, Trash, ChevronRight, Send, ShieldCheck, Utensils, Camera } from 'lucide-react-native';
import { useAuth } from '@/auth';
import { api, API_URL } from '@/api';
import { C } from '@/theme';
import { Button, Card, Field, Header, Notice, Row, Screen, T, useWide } from '@/ui';
import PlanetScene from '@/three/PlanetScene';

const ENV_LABEL: Record<string, string> = { station: 'Space station · low Earth orbit', spacecraft: 'Spacecraft · transit', lunar: 'Lunar surface base', mars: 'Mars surface base', analog: 'Earth analog habitat' };
const ROLE_LABEL: Record<string, string> = { astronaut: 'Astronaut', surgeon: 'Flight surgeon', analog: 'Analog crew' };

function Item({ icon: Icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: danger ? C.redTint : C.soft, alignItems: 'center', justifyContent: 'center' }}><Icon size={17} color={danger ? C.red : C.ink} /></View>
      <T size={15} weight="m" color={danger ? C.red : C.ink} style={{ flex: 1 }}>{label}</T>
      <ChevronRight size={18} color={C.ink3} />
    </Pressable>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const wide = useWide();
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!user) return null;

  const exportData = async () => {
    if (Platform.OS === 'web') { window.open(`${API_URL}/api/account/export`, '_blank'); return; }
    const data = await api('/api/account/export');
    await Share.share({ title: 'Perigee export', message: JSON.stringify(data, null, 2) });
  };
  const deleteAccount = async () => {
    try { await api('/api/account', { method: 'DELETE', body: user.passwordless ? { confirm: pw } : { password: pw } }); await logout(); router.replace('/welcome'); } catch (e: any) { setErr(e.message); }
  };
  const signOut = async () => { await logout(); router.replace('/welcome'); };

  return (
    <Screen>
      <Header title="Profile" />
      <View style={wide ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start' } : undefined}>
        <View style={wide ? { flex: 1 } : undefined}>
          <Card style={{ alignItems: 'center', paddingTop: 0, overflow: 'hidden' }}>
            <PlanetScene env={user.environment} height={wide ? 300 : 230} />
            <T size={26} weight="m">{user.name}</T>
            <T size={14} color={C.ink2} style={{ marginTop: 2 }}>{ROLE_LABEL[user.role] ?? user.role} · {user.mission}</T>
            <T size={12} color={C.ink3} style={{ marginTop: 4 }}>{ENV_LABEL[user.environment] ?? user.environment}</T>
            <T size={12} color={C.ink3} style={{ marginTop: 2, marginBottom: 6 }}>{user.email}</T>
          </Card>
        </View>
        <View style={wide ? { flex: 1 } : { marginTop: 14 }}>
          <Card style={{ paddingVertical: 6 }}>
            <Item icon={LinkIcon} label="Data sources · WHOOP & more" onPress={() => router.push('/integrations')} />
            <Item icon={Camera} label="Training check (camera)" onPress={() => router.push('/workout')} />
            <Item icon={Utensils} label="Food & calories" onPress={() => router.push('/food')} />
            <Item icon={Send} label="Flight surgeon report" onPress={() => router.push('/report')} />
            <Item icon={Download} label="Export my data" onPress={exportData} />
          </Card>
          <Card style={{ paddingVertical: 6, marginTop: 12 }}>
            <Item icon={FileText} label="Terms of Use" onPress={() => router.push('/legal/terms')} />
            <Item icon={Lock} label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
            <Item icon={Cookie} label="Cookie Policy" onPress={() => router.push('/legal/cookies')} />
          </Card>
          <Card style={{ paddingVertical: 6, marginTop: 12 }}>
            <Item icon={LogOut} label="Sign out" onPress={signOut} />
            <Item icon={Trash} label="Delete account" danger onPress={() => setDel(!del)} />
            {del && (
              <View style={{ paddingBottom: 12 }}>
                <Notice kind="red" title="This permanently deletes your account" body="All your measurements, check-ins, connections and consents are erased from our servers. This cannot be undone." />
                {user.passwordless
                  ? <Field label={`Type ${user.email} to confirm`} value={pw} onChangeText={setPw} autoCapitalize="none" keyboardType="email-address" />
                  : <Field label="Confirm with your password" value={pw} onChangeText={setPw} secureTextEntry />}
                {err ? <T size={13} color={C.red} style={{ marginBottom: 8 }}>{err}</T> : null}
                <Button title="Delete forever" kind="danger" disabled={!pw} onPress={deleteAccount} />
              </View>
            )}
          </Card>
          <Row gap={8} style={{ marginTop: 16, justifyContent: 'center' }}>
            <ShieldCheck size={14} color={C.ink3} />
            <T size={12} color={C.ink3}>Not a medical device · Not affiliated with NASA</T>
          </Row>
        </View>
      </View>
    </Screen>
  );
}
