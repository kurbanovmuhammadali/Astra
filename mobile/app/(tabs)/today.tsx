import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Lightbulb, Plus, Utensils } from 'lucide-react-native';
import { useAuth } from '@/auth';
import { useApi } from '@/useApi';
import { A } from '@/theme';
import type { Dashboard } from '@/types';
import { Button, Loading, Notice, T } from '@/ui';
import { AstraLogo, shadowSoft } from '@/astra';
import ReplayBar from '@/ReplayBar';

type Goal = { key: string; label: string; unit: string; value: number | null; goal: number; pct: number | null; met: boolean | null; where: 'daily' | 'food' };
type Goals = { day: string; hasData: boolean; goals: Goal[]; tip: string; week: { day: string; tracked: number; met: number }[] };

const SOURCE: Record<string, string> = { apple: 'Apple Watch', whoop: 'WHOOP', manual: 'By hand', demo: 'Demo data' };
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function GoalRow({ g }: { g: Goal }) {
  const none = g.value == null;
  const over = g.where === 'food' && g.value != null && g.value > g.goal * 1.1;
  const color = none ? A.line : g.met ? '#4FAE72' : over ? '#D9583F' : A.copper;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${g.label}: ${none ? 'no data' : `${g.value} of ${g.goal} ${g.unit}`}`} onPress={() => router.push(g.where === 'food' ? '/food' : '/daily')} style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T size={14} weight="m" color={A.ink}>{g.label}</T>
        {none
          ? <T size={13} color={A.ink3}>No data · add</T>
          : <T size={13} color={A.ink2}><T size={15} weight="sb" color={A.ink}>{g.value!.toLocaleString('en-US')}</T> / {g.goal.toLocaleString('en-US')} {g.unit}</T>}
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: A.line, marginTop: 6, overflow: 'hidden' }}>
        <View style={{ height: 8, width: `${none ? 0 : Math.min(100, g.pct ?? 0)}%`, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </Pressable>
  );
}

export default function Home() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { data: g, error, reload } = useApi<Goals>('/api/goals');
  const { data: dash } = useApi<Dashboard>('/api/dashboard');

  if (!g) return (
    <View style={{ flex: 1, backgroundColor: A.sand, justifyContent: 'center', padding: 24 }}>
      {error ? <Notice kind="red" title={error} action={<Button title="Retry" kind="light" onPress={reload} />} /> : <Loading />}
    </View>
  );

  const demo = user?.dataSource === 'demo';
  const alerts = (dash?.alerts ?? []).filter(a => a.level === 'red' || a.level === 'amber').sort((a, b) => Number(b.level === 'red') - Number(a.level === 'red')).slice(0, 3);
  const date = new Date(g.day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const quick = (Icon: any, label: string, to: string) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(to as any)}
      style={[{ flex: 1, alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 14 }, shadowSoft]}>
      <Icon size={20} color={A.copper} /><T size={12.5} weight="m" color={A.ink}>{label}</T>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: A.sand }}>
      <LinearGradient colors={['#FBF2EE', A.sand, '#F1DED3']} style={{ position: 'absolute', inset: 0 } as any} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 140, paddingHorizontal: 18, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AstraLogo size={16} />
          <Pressable accessibilityRole="button" accessibilityLabel="Data source" onPress={() => router.push('/integrations')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#4FAE72' }} />
            <T size={12.5} weight="m" color={A.ink}>{SOURCE[user?.dataSource ?? ''] ?? 'Data'}</T>
          </Pressable>
        </View>

        <T size={28} weight="sb" color={A.ink} style={{ marginTop: 22, letterSpacing: -0.7 }}>Hi, {user?.name.split(' ')[0]}</T>
        <T size={14} color={A.ink3} style={{ marginTop: 2 }}>{date}</T>

        {demo ? <ReplayBar /> : null}

        {alerts.map((a, i) => (
          <View key={i} style={{ marginTop: 12 }}>
            <Notice kind={a.level === 'red' ? 'red' : 'amber'} title={a.title} body={a.body} action={a.escalate ? <Button title="Prepare surgeon report" kind="light" onPress={() => router.push('/report')} style={{ height: 44 }} /> : undefined} />
          </View>
        ))}

        {!g.hasData ? (
          <View style={[{ backgroundColor: '#fff', borderRadius: 26, padding: 20, marginTop: 18 }, shadowSoft]}>
            <T size={18} weight="sb" color={A.ink}>Nothing tracked yet</T>
            <T size={14} color={A.ink2} style={{ marginTop: 6, lineHeight: 20 }}>{g.tip}</T>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/daily')} style={{ flex: 1, height: 46, borderRadius: 999, backgroundColor: A.copper, alignItems: 'center', justifyContent: 'center' }}><T size={14} weight="m" color="#fff">Add today's numbers</T></Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push('/integrations')} style={{ flex: 1, height: 46, borderRadius: 999, backgroundColor: A.sand, alignItems: 'center', justifyContent: 'center' }}><T size={14} weight="m" color={A.ink}>Data sources</T></Pressable>
            </View>
          </View>
        ) : (
          <>
            <View style={[{ backgroundColor: '#fff', borderRadius: 26, padding: 18, marginTop: 18 }, shadowSoft]}>
              <T size={17} weight="sb" color={A.ink}>Today's goals</T>
              {g.goals.map(x => <GoalRow key={x.key} g={x} />)}
            </View>

            <View style={[{ backgroundColor: '#FFF6E8', borderRadius: 22, padding: 16, marginTop: 12, flexDirection: 'row', gap: 12 }]}>
              <Lightbulb size={20} color={A.copper} style={{ marginTop: 2 }} />
              <T size={14} color={A.ink} style={{ flex: 1, lineHeight: 20 }}>{g.tip}</T>
            </View>

            <View style={[{ backgroundColor: '#fff', borderRadius: 26, padding: 18, marginTop: 12 }, shadowSoft]}>
              <T size={17} weight="sb" color={A.ink}>This week</T>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 90, marginTop: 14 }}>
                {g.week.map(w => {
                  const frac = w.tracked ? w.met / w.tracked : 0;
                  return (
                    <View key={w.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                      <View style={{ width: '100%', height: Math.max(4, frac * 64), borderRadius: 6, backgroundColor: w.tracked === 0 ? A.line : frac === 1 ? '#4FAE72' : A.copper }} />
                      <T size={11} color={A.ink3} style={{ marginTop: 4 }}>{WD[new Date(w.day + 'T12:00:00').getDay()]}</T>
                    </View>
                  );
                })}
              </View>
              <T size={12} color={A.ink3} style={{ marginTop: 10 }}>Bar height = share of tracked goals met that day.</T>
            </View>
          </>
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          {quick(Plus, 'Add numbers', '/daily')}
          {quick(Utensils, 'Food', '/food')}
          {quick(Camera, 'Workout', '/workout')}
        </View>
        {demo ? <T size={12} color={A.ink3} center style={{ marginTop: 14 }}>Demo data. Not a medical device.</T> : null}
      </ScrollView>
    </View>
  );
}
