import React, { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { api } from '@/api';
import { A, F } from '@/theme';
import { T } from '@/ui';
import { shadowSoft } from '@/astra';

/** Add today's numbers by hand. Leave a box empty if you do not have that number: nothing is guessed or filled in. */
const FIELDS: { k: string; label: string; unit: string; ph: string }[] = [
  { k: 'steps', label: 'Steps', unit: 'steps', ph: 'e.g. 6500' },
  { k: 'sleep', label: 'Sleep last night', unit: 'hours', ph: 'e.g. 7.5' },
  { k: 'exercise', label: 'Active minutes', unit: 'min', ph: 'e.g. 30' },
  { k: 'activekcal', label: 'Calories burned', unit: 'kcal', ph: 'e.g. 450' },
  { k: 'rhr', label: 'Resting heart rate', unit: 'bpm', ph: 'e.g. 60' },
  { k: 'weight', label: 'Weight', unit: 'kg', ph: 'e.g. 72.5' },
  { k: 'spo2', label: 'Blood oxygen', unit: '%', ph: 'e.g. 97' },
];

export default function Daily() {
  const insets = useSafeAreaInsets();
  const [v, setV] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const box = { height: 44, borderRadius: 14, backgroundColor: A.sand, paddingHorizontal: 12, fontFamily: F.r, fontSize: 15, color: A.ink } as const;

  const save = async () => {
    setErr(''); setBusy(true);
    try { await api('/api/daily', { body: v }); router.back(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const any = Object.values(v).some(x => x?.trim());

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: A.sand }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 60, paddingHorizontal: 20, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <ChevronLeft size={20} color={A.ink} /><T size={14} color={A.ink2}>Back</T>
      </Pressable>
      <T size={28} weight="sb" color={A.ink} style={{ marginTop: 14, letterSpacing: -0.7 }}>Today's numbers</T>
      <T size={14} color={A.ink2} style={{ marginTop: 4 }}>Fill in what you have. Leave the rest empty.</T>

      <View style={[{ backgroundColor: '#fff', borderRadius: 24, padding: 16, marginTop: 16, gap: 12 }, shadowSoft]}>
        {FIELDS.map(f => (
          <View key={f.k}>
            <T size={12.5} color={A.ink3}>{f.label} · {f.unit}</T>
            <TextInput value={v[f.k] ?? ''} onChangeText={t => setV({ ...v, [f.k]: t })} placeholder={f.ph} placeholderTextColor={A.ink3} keyboardType="decimal-pad" accessibilityLabel={f.label} style={[box, { marginTop: 4 }]} />
          </View>
        ))}
        <View>
          <T size={12.5} color={A.ink3}>Blood pressure · mmHg</T>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TextInput value={v.sys ?? ''} onChangeText={t => setV({ ...v, sys: t })} placeholder="top, e.g. 120" placeholderTextColor={A.ink3} keyboardType="numeric" accessibilityLabel="Systolic" style={[box, { flex: 1 }]} />
            <TextInput value={v.dia ?? ''} onChangeText={t => setV({ ...v, dia: t })} placeholder="bottom, e.g. 80" placeholderTextColor={A.ink3} keyboardType="numeric" accessibilityLabel="Diastolic" style={[box, { flex: 1 }]} />
          </View>
        </View>
      </View>

      {err ? <T size={13} color="#D9583F" style={{ marginTop: 12 }}>{err}</T> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Save numbers" disabled={!any || busy} onPress={save}
        style={{ marginTop: 16, height: 50, borderRadius: 999, backgroundColor: any && !busy ? A.copper : A.line, alignItems: 'center', justifyContent: 'center' }}>
        <T size={15} weight="m" color="#fff">{busy ? 'Saving…' : 'Save'}</T>
      </Pressable>
    </ScrollView>
  );
}
