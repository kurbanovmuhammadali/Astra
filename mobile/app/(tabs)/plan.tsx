import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, Dumbbell, Footprints, Bike, Pill, GlassWater, BedDouble, Activity, HeartPulse, Sparkles, ShieldCheck, Lock } from 'lucide-react-native';
import { api } from '@/api';
import { useApi } from '@/useApi';
import { C } from '@/theme';
import type { Dashboard, Plan, Task } from '@/types';
import { Card, FadeIn, Header, Loading, Notice, RingProgress, Row, Screen, T, useWide } from '@/ui';
import { Platform } from 'react-native';

const ICON: Record<string, any> = { treadmill: Footprints, ared: Dumbbell, cevis: Bike, vitd: Pill, water: GlassWater, sleep: BedDouble, bp: HeartPulse, checkin: Activity };

function TaskRow({ t, onToggle }: { t: Task; onToggle: () => void }) {
  const Icon = ICON[t.key] ?? (t.origin === 'perigee' ? Sparkles : Activity);
  const adaptive = t.origin === 'perigee';
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: t.done }}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, backgroundColor: adaptive ? '#141312' : '#fff', marginBottom: 10, opacity: pressed ? 0.85 : 1 }]}>
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: adaptive ? 'rgba(238,108,77,0.18)' : C.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={adaptive ? C.coral2 : C.ink} strokeWidth={1.7} />
      </View>
      <View style={{ flex: 1 }}>
        <T size={15} weight="m" color={adaptive ? '#fff' : C.ink} style={t.done ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>{t.title}</T>
        <T size={12} color={adaptive ? 'rgba(255,255,255,0.65)' : C.ink3}>{t.target && t.unit ? `${t.target} ${t.unit} · ` : ''}{t.detail}</T>
        {adaptive && t.reason ? <T size={11} color={C.coral2} style={{ marginTop: 4 }}>Why: {t.reason}</T> : null}
        {adaptive && t.evidence?.length ? <T size={10.5} color="rgba(255,255,255,0.5)" style={{ marginTop: 2 }}>Evidence: {t.evidence.join(', ')} (see metric screens)</T> : null}
        {t.needsApproval ? <Row gap={4} style={{ marginTop: 4 }}><Lock size={11} color={C.amber} /><T size={11} color={C.amber}>Confirm with flight surgeon first</T></Row> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: t.done ? C.coral : adaptive ? 'rgba(255,255,255,0.35)' : C.line, backgroundColor: t.done ? C.coral : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {t.done ? <Check size={15} color="#fff" strokeWidth={3} /> : null}
        </View>
        <T size={10} color={adaptive ? 'rgba(255,255,255,0.5)' : C.ink3}>+{t.xp} XP</T>
      </View>
    </Pressable>
  );
}

export default function PlanScreen() {
  const { data, setData } = useApi<Plan>('/api/plan');
  const { data: dash, reload } = useApi<Dashboard>('/api/dashboard');
  const [err, setErr] = useState<string | null>(null);
  const wide = useWide();
  if (!data) return <Screen><Loading /></Screen>;
  const toggle = async (k: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    try { setData(await api<Plan>(`/api/plan/tasks/${k}/toggle`, { method: 'POST' })); reload(); } catch (e: any) { setErr(e.message); }
  };
  const g = dash?.game;

  return (
    <Screen>
      <Header title="Today’s plan" sub={`Mission plan: ${data.source}`} />
      <Row gap={16} style={{ marginBottom: 18 }}>
        <RingProgress value={data.progress} size={92} stroke={8}>
          <T size={22} weight="m">{Math.round(data.progress * 100)}%</T>
        </RingProgress>
        <View style={{ flex: 1 }}>
          <T size={26} weight="m">Level {g?.level ?? 1}</T>
          <T size={13} color={C.ink2}>{g ? `${g.xp} XP · ${g.nextLevelXp} XP to next level` : ''}</T>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: C.coralTint, marginTop: 8, overflow: 'hidden' }}>
            <View style={{ width: `${(g?.levelProgress ?? 0) * 100}%`, height: 6, backgroundColor: C.coral }} />
          </View>
          <T size={12} color={C.ink3} style={{ marginTop: 6 }}>🔥 {g?.streak ?? 0}-day check-in streak · {data.xpAvailable} XP left today</T>
        </View>
      </Row>
      {err ? <Notice kind="red" title={err} /> : null}

      <View style={wide ? { flexDirection: 'row', gap: 24, alignItems: 'flex-start' } : undefined}>
        <View style={wide ? { flex: 1 } : undefined}>
          {data.adaptations.length > 0 && (
            <FadeIn>
              <Row gap={8} style={{ marginBottom: 6 }}><Sparkles size={16} color={C.coral} /><T size={18} weight="m">Adapted by Astra</T></Row>
              <T size={13} color={C.ink2} style={{ marginBottom: 12 }}>Your mission plan stays as prescribed. These additions come from your data — each one says why.</T>
              {data.adaptations.map(t => <TaskRow key={t.key} t={t} onToggle={() => toggle(t.key)} />)}
            </FadeIn>
          )}
        </View>
        <View style={wide ? { flex: 1 } : { marginTop: 14 }}>
          <Row gap={8} style={{ marginBottom: 12 }}><ShieldCheck size={16} color={C.ink} /><T size={18} weight="m">Mission plan</T></Row>
          {data.items.map(t => <TaskRow key={t.key} t={t} onToggle={() => toggle(t.key)} />)}
        </View>
      </View>

      {g && (
        <Card style={{ marginTop: 14 }}>
          <T size={16} weight="m" style={{ marginBottom: 10 }}>Mission patches</T>
          <Row gap={10} wrap>
            {g.badges.map(b => (
              <View key={b.key} style={{ alignItems: 'center', width: 76, opacity: b.earned ? 1 : 0.4 }}>
                <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: b.earned ? C.coral : C.soft, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: b.earned ? C.coralSoft : C.line }}>
                  <Sparkles size={20} color={b.earned ? '#fff' : C.ink3} />
                </View>
                <T size={11} weight="m" center style={{ marginTop: 6 }}>{b.label}</T>
                <T size={9} color={C.ink3} center>{b.hint}</T>
              </View>
            ))}
          </Row>
        </Card>
      )}
    </Screen>
  );
}
