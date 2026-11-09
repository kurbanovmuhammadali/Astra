import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useApi } from '@/useApi';
import { C, statusColor, statusTint, statusWord } from '@/theme';
import type { Dashboard } from '@/types';
import { Card, FadeIn, Header, Loading, Row, Screen, StatusDot, T, useWide } from '@/ui';
import BodyScene from '@/three/BodyScene';

export default function Body() {
  const { data } = useApi<Dashboard>('/api/dashboard');
  const [sel, setSel] = useState<string | null>('heart');
  const wide = useWide();
  if (!data) return <Screen><Loading /></Screen>;
  const statuses = Object.fromEntries(data.systems.map(s => [s.key, s.status]));
  const sys = data.systems.find(s => s.key === sel);

  const detail = sys && (
    <FadeIn key={sys.key}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T size={22} weight="m">{sys.label}</T>
          <View style={{ backgroundColor: statusTint(sys.status), borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
            <T size={12} weight="sb" color={statusColor(sys.status)}>{statusWord(sys.status)}</T>
          </View>
        </Row>
        <T size={12} color={C.ink3} style={{ marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Hazard · {sys.hazard}</T>
        <T size={14} color={C.ink2} style={{ marginTop: 10 }}>{sys.blurb}</T>
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
      <Header title="Body map" sub="Tap a glowing point to inspect a system" />
      <View style={wide ? { flexDirection: 'row', gap: 24 } : undefined}>
        <View style={wide ? { flex: 1 } : undefined}>
          <View style={{ borderRadius: 32, overflow: 'hidden' }}>
            <BodyScene statuses={statuses} selected={sel} onSelect={setSel} height={wide ? 600 : 440} />
          </View>
          <Row wrap gap={8} style={{ justifyContent: 'center', marginTop: 4, marginBottom: 16 }}>
            {data.systems.map(s => (
              <Pressable key={s.key} onPress={() => setSel(s.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: sel === s.key ? C.ink : '#fff' }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(s.status) }} />
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
