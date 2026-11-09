import React from 'react';
import { Image, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, ChevronLeft, ChevronRight, Moon, HeartPulse } from 'lucide-react-native';
import { useAuth } from '@/auth';
import { useApi } from '@/useApi';
import { A } from '@/theme';
import type { Dashboard, Plan, Snap } from '@/types';
import { Button, FadeIn, Loading, Notice, T } from '@/ui';
import { AstraLogo, Floaty, IMG, Pill, RATIO, shadowSoft } from '@/astra';

type Integrations = { providers: { key: string; status: string }[] };

const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const fmtSleep = (h: number | null | undefined) => (h == null ? '—' : `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`);

function Tile({ icon: Icon, label, value, m }: { icon: any; label: string; value: string; m?: Snap }) {
  const dot = m?.status === 'red' ? '#D9583F' : m?.status === 'amber' ? '#E3A23B' : m?.status === 'green' ? '#4FAE72' : A.ink3;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value}`} onPress={() => m && router.push(`/metric/${m.key}`)}
      style={[{ flex: 1, backgroundColor: 'rgba(255,255,255,0.86)', borderRadius: 22, paddingVertical: 14, alignItems: 'center' }, shadowSoft]}>
      <Icon size={22} color={A.copper} strokeWidth={1.8} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
        <T size={12} color={A.ink2}>{label}</T>
      </View>
      <T size={20} weight="sb" color={A.ink} style={{ marginTop: 2, letterSpacing: -0.4 }}>{value}</T>
    </Pressable>
  );
}

export default function Home() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { data, error, reload } = useApi<Dashboard>('/api/dashboard');
  const { data: plan } = useApi<Plan>('/api/plan');
  const { data: integ } = useApi<Integrations>('/api/integrations');

  if (!data) return (
    <View style={{ flex: 1, backgroundColor: A.sand, justifyContent: 'center', padding: 24 }}>
      {error ? <Notice kind="red" title={error} action={<Button title="Retry" kind="light" onPress={reload} />} /> : <Loading />}
    </View>
  );

  const m = data.metrics;
  const whoop = integ?.providers.find(p => p.key === 'whoop')?.status === 'connected';
  const demo = [m.recovery, m.sleep, m.hrv].some(s => s?.source === 'demo');
  const red = data.alerts.filter(a => a.level === 'red');
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const bodyW = Math.min(W * 0.8, 380);
  const open = plan ? plan.items.filter(t => !t.done).length : null;

  return (
    <View style={{ flex: 1, backgroundColor: A.sand }}>
      <LinearGradient colors={['#FBF2EE', A.sand, '#F1DED3']} style={{ position: 'absolute', inset: 0 } as any} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 140, paddingHorizontal: 18, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {/* header: logo + alert dot · date switcher · WHOOP status */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={red.length ? `${red.length} urgent alerts` : 'Astra'} onPress={() => red.length && router.push('/report')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <AstraLogo size={16} />
            {red.length ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#D9583F', marginTop: -10 }} /> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Data sources" onPress={() => router.push('/integrations')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: whoop ? '#4FAE72' : A.ink3 }} />
            <T size={12.5} weight="m" color={A.ink}>{whoop ? 'WHOOP · connected' : 'WHOOP · not connected'}</T>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 999, padding: 5, marginTop: 14 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', opacity: 0.35 }}><ChevronLeft size={18} color={A.ink} /></View>
          <T size={14} weight="m" color={A.ink}>Today · {today}</T>
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', opacity: 0.35 }}><ChevronRight size={18} color={A.ink} /></View>
        </View>

        <FadeIn>
          <T size={30} weight="sb" color={A.ink} style={{ marginTop: 22, letterSpacing: -0.8, lineHeight: 34 }}>{`${greeting()},\n${user?.name.split(' ')[0] ?? ''}.`}</T>
        </FadeIn>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <Tile icon={Activity} label="Recovery" value={m.recovery?.value != null ? `${Math.round(m.recovery.value)}%` : '—'} m={m.recovery} />
          <Tile icon={Moon} label="Sleep" value={fmtSleep(m.sleep?.value)} m={m.sleep} />
          <Tile icon={HeartPulse} label="HRV" value={m.hrv?.value != null ? `${Math.round(m.hrv.value)}ms` : '—'} m={m.hrv} />
        </View>

        {red.map((a, i) => (
          <View key={i} style={{ marginTop: 12 }}>
            <Notice kind="red" title={a.title} body={a.body} action={a.escalate ? <Button title="Prepare surgeon report" kind="light" onPress={() => router.push('/report')} style={{ height: 44 }} /> : undefined} />
          </View>
        ))}

        <Pressable accessibilityRole="button" accessibilityLabel="Open body view" onPress={() => router.push('/body')} style={{ alignItems: 'center', marginTop: 6 }}>
          <Floaty amp={5} rotate={0} dur={4000}>
            <Image source={IMG.body} style={{ width: bodyW, height: bodyW / RATIO.body }} resizeMode="contain" />
          </Floaty>
        </Pressable>

        <View style={[{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 26, padding: 18, marginTop: -10 }, shadowSoft]}>
          <Pressable onPress={() => router.push('/plan')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <T size={17} weight="sb" color={A.ink}>Today’s plan</T>
              <T size={13} color={A.ink2} style={{ marginTop: 2 }}>
                {plan ? `${open} of ${plan.items.length} tasks left${plan.adaptations.length ? ` · ${plan.adaptations.length} suggestions` : ''}` : 'Your mission routine for today'}
              </T>
            </View>
            <ChevronRight size={20} color={A.ink2} />
          </Pressable>
          <Pill title="View plan" onPress={() => router.push('/plan')} style={{ marginTop: 14, height: 50 }} />
        </View>
        {demo ? <T size={12} color={A.ink3} center style={{ marginTop: 12 }}>Sample data · connect WHOOP in Profile to see yours</T> : null}
      </ScrollView>
    </View>
  );
}
