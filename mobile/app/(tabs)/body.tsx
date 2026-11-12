import React, { useState } from 'react';
import { Image, Pressable, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useApi } from '@/useApi';
import { C, statusColor, statusTint, statusWord } from '@/theme';
import type { Dashboard } from '@/types';
import { Card, FadeIn, Header, Loading, Row, Screen, StatusDot, T, useWide } from '@/ui';
import { Floaty, IMG, RATIO } from '@/astra';

/** Where each system sits on the artwork (share of image width / height). */
const SPOTS: { key: string; x: number; y: number }[] = [
  { key: 'brain', x: 0.42, y: 0.08 },
  { key: 'eyes', x: 0.58, y: 0.2 },
  { key: 'immune', x: 0.5, y: 0.37 },
  { key: 'heart', x: 0.56, y: 0.6 },
  { key: 'bones', x: 0.2, y: 0.62 },
  { key: 'metabolism', x: 0.5, y: 0.88 },
];

export default function Body() {
  const { data } = useApi<Dashboard>('/api/dashboard');
  const [sel, setSel] = useState<string | null>('heart');
  const wide = useWide();
  const { width: W } = useWindowDimensions();
  const figW = Math.min(wide ? 520 : W - 40, 460);
  if (!data) return <Screen><Loading /></Screen>;
  // a system with no readings has no status: show grey "No data", never a made-up "Normal"
  const hasData = (s: { metrics: string[] }) => s.metrics.some(k => data.metrics[k]?.value != null && data.metrics[k]?.status && data.metrics[k].status !== 'none');
  const statusOf = (s: { key: string; status: string; metrics: string[] }) => (hasData(s) ? s.status : 'none');
  const statuses = Object.fromEntries(data.systems.map(s => [s.key, statusOf(s)]));
  const sys = data.systems.find(s => s.key === sel);

  const detail = sys && (
    <FadeIn key={sys.key}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={22} weight="m">{sys.label}</T>
          <View style={{ backgroundColor: statusTint(statusOf(sys)), borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
            <T size={12} weight="sb" color={statusColor(statusOf(sys))}>{statusWord(statusOf(sys))}</T>
          </View>
        </Row>
        <View style={{ height: 1, backgroundColor: C.line, marginVertical: 14 }} />
        {sys.metrics.map(k => {
          const m = data.metrics[k];
          if (!m) return null;
          return (
            <Pressable key={k} onPress={() => router.push(`/metric/${k}`)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
              <View style={{ flex: 1 }}>
                <T size={15} weight="m">{m.label}</T>
                <StatusDot status={m.status} />
              </View>
              <T size={20} weight="m">{m.value == null ? '—' : m.value2 != null ? `${m.value}/${m.value2}` : m.value}</T>
              <T size={12} color={C.ink3} style={{ marginLeft: 4, width: 64 }}>{m.unit}</T>
            </Pressable>
          );
        })}
        {sys.reasons.filter(r => r.symptom).map(r => (
          <Row key={r.symptom} gap={8} style={{ paddingVertical: 6 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(r.status) }} /><T size={14}>Symptom reported: {r.label}</T></Row>
        ))}
      </Card>
    </FadeIn>
  );

  return (
    <Screen>
      <Header title="Body" />
      <View style={wide ? { flexDirection: 'row', gap: 24 } : undefined}>
        <View style={wide ? { flex: 1 } : undefined}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Floaty amp={5} rotate={0} dur={4200}>
              <View style={{ width: figW, height: figW / RATIO.body }}>
                <Image source={IMG.body} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityIgnoresInvertColors />
                {SPOTS.map(p => {
                  const on = sel === p.key;
                  return (
                    <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={data.systems.find(x => x.key === p.key)?.label ?? p.key} hitSlop={8} onPress={() => setSel(p.key)}
                      style={{ position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: 36, height: 36, marginLeft: -18, marginTop: -18, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: on ? 30 : 22, height: on ? 30 : 22, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: on ? 2 : 0, borderColor: C.ink }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: statusColor(statuses[p.key] ?? 'none') }} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Floaty>
          </View>
          <Row wrap gap={8} style={{ justifyContent: 'center', marginTop: 4, marginBottom: 16 }}>
            {data.systems.map(s => (
              <Pressable key={s.key} onPress={() => setSel(s.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: sel === s.key ? C.ink : '#fff' }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(statusOf(s)) }} />
                <T size={13} weight="m" color={sel === s.key ? '#fff' : C.ink}>{s.label}</T>
              </Pressable>
            ))}
          </Row>
        </View>
        <View style={wide ? { flex: 1 } : undefined}>{detail}</View>
      </View>
    </Screen>
  );
}
