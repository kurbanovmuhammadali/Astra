import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Hand, Watch } from 'lucide-react-native';
import { api } from '@/api';
import { useAuth } from '@/auth';
import { extractFromFile, pickFile } from '@/appleHealth';
import { A } from '@/theme';
import { T } from '@/ui';
import { AstraLogo, shadowSoft } from '@/astra';

/**
 * Required step: Astra tracks real numbers, so every account says where they come from —
 * Apple Watch / Apple Health (import), WHOOP, or typed in by hand. Nothing is pre-filled.
 */
export default function Connect() {
  const insets = useSafeAreaInsets();
  const { refresh, logout } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const importApple = async () => {
    setErr(''); setMsg('');
    try {
      const file = await pickFile();
      if (!file) return;
      setBusy('apple'); setMsg('Reading the file on this device…');
      const samples = await extractFromFile(file, 90, f => setMsg(`Reading the file on this device… ${Math.round(f * 100)}%`));
      if (!samples.length) throw new Error('No heart-rate, sleep, steps or similar records from the last 90 days were found in that file.');
      setMsg(`Uploading ${samples.length.toLocaleString()} records…`);
      await api('/api/integrations/apple-health/batch', { body: { samples, days: 90 } });
      await refresh(); router.replace('/today');
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); setMsg(''); }
  };
  const byHand = async () => {
    setErr('');
    try { setBusy('manual'); await api('/api/profile/data-source', { method: 'PUT', body: { source: 'manual' } }); await refresh(); router.replace('/today'); }
    catch (e: any) { setErr(e.message); setBusy(null); }
  };
  const whoop = async () => {
    setErr('');
    try {
      const { url } = await api<{ url: string }>('/api/integrations/whoop/start', { body: { platform: Platform.OS === 'web' ? 'web' : 'native' } });
      if (Platform.OS === 'web') window.location.href = url;
    } catch (e: any) { setErr(e.message); }
  };

  const Option = ({ icon: Icon, title, text, action, label, onPress, primary, k }: any) => (
    <View style={[{ backgroundColor: '#fff', borderRadius: 24, padding: 18, marginTop: 12 }, shadowSoft]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: A.sand, alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={A.copper} /></View>
        <View style={{ flex: 1 }}><T size={16} weight="sb" color={A.ink}>{title}</T><T size={12.5} color={A.ink3} style={{ marginTop: 1 }}>{text}</T></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={!!busy} onPress={onPress}
        style={{ marginTop: 14, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? A.copper : A.sand, opacity: busy && busy !== k ? 0.5 : 1 }}>
        <T size={14} weight="m" color={primary ? '#fff' : A.ink}>{busy === k ? 'Working…' : label}</T>
      </Pressable>
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: A.sand }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 50, paddingHorizontal: 20, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
      <AstraLogo size={16} />
      <T size={28} weight="sb" color={A.ink} style={{ marginTop: 20, letterSpacing: -0.7 }}>How will Astra get your numbers?</T>
      <T size={14} color={A.ink2} style={{ marginTop: 6 }}>Pick one to continue. You can add more later.</T>

      <Option icon={Watch} k="apple" title="Apple Watch / Apple Health" text="Import your Health export" label="Choose export.xml" primary onPress={Platform.OS === 'web' ? importApple : () => setErr('Importing works in the web app. Open Astra in your phone browser.')} />
      {msg ? <T size={12.5} color={A.ink2} style={{ marginTop: 8, marginLeft: 6 }}>{msg}</T> : null}
      <Option icon={Watch} k="whoop" title="WHOOP" text="Link your WHOOP account" label="Connect WHOOP" onPress={whoop} />
      <Option icon={Hand} k="manual" title="Add by hand" text="Garmin, Fitbit, Samsung or no watch: type your numbers each day" label="Enter numbers myself" onPress={byHand} />

      {err ? <T size={13} color="#D9583F" style={{ marginTop: 14, lineHeight: 18 }}>{err}</T> : null}
      <Pressable accessibilityRole="button" onPress={async () => { await logout(); router.replace('/welcome'); }} style={{ marginTop: 22, alignSelf: 'center' }}>
        <T size={13} color={A.ink3}>Log out</T>
      </Pressable>
    </ScrollView>
  );
}
