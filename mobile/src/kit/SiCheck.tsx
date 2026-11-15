import React from 'react';
import { View } from 'react-native';
import { K } from '@/kit/tokens';
import { Kicker, Txt } from '@/kit/core';
import { Button, Card, Tag, toast } from '@/kit/ui';
import { api } from '@/api';
import { useApi } from '@/useApi';

type Brain = {
  analysis: { at: string; level: string; summary: string } | null;
  adjustments: { id: number; day: string | null; kind: string; title: string; detail: string; status: string; by: string }[];
};
const tone = (l: string) => (l === 'alert' ? 'flag' : l === 'watch' ? 'watch' : l === 'ok' ? 'ok' : 'none');

/** The SI's latest 30-minute analysis and the plan changes (day off, schedule) that apply to this person. */
export function SiCheck() {
  const { data, reload } = useApi<Brain>('/api/me/brain');
  if (!data) return null;
  const a = data.analysis;
  const today = new Date().toISOString().slice(0, 10);
  const run = async (id: number, action: 'apply' | 'dismiss') => { try { await api(`/api/me/adjustments/${id}`, { body: { action } }); reload(); } catch (e: any) { toast(e.message ?? 'Failed'); } };
  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Kicker style={{ flex: 1 }}>SI check · every 30 minutes</Kicker>{a ? <Tag label={a.level === 'ok' ? 'Normal for you' : a.level === 'nodata' ? 'No data' : a.level === 'alert' ? 'Needs attention' : 'Keep an eye'} tone={tone(a.level) as any} /> : null}</View>
      <Txt v="sub" style={{ marginTop: 8 }}>{a ? a.summary : 'No analysis yet. Connect WHOOP or enter your numbers by hand.'}</Txt>
      {a ? <Txt v="caption" color={K.ink3} style={{ marginTop: 4 }}>{a.at} UTC</Txt> : null}
      {data.adjustments.map(j => (
        <View key={j.id} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: K.hair }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Txt v="subM" style={{ flex: 1 }}>{j.title}{j.day ? (j.day === today ? ' · today' : ` · ${j.day}`) : ''}</Txt><Tag label={j.status === 'applied' ? (j.by === 'doctor' ? 'Doctor' : 'Confirmed') : 'Suggested'} tone={j.status === 'applied' ? 'ok' : 'watch'} /></View>
          {j.detail ? <Txt v="caption" color={K.ink2}>{j.detail}</Txt> : null}
          {j.status === 'proposed' ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}><Button small title="Apply" onPress={() => run(j.id, 'apply')} /><Button small kind="secondary" title="Dismiss" onPress={() => run(j.id, 'dismiss')} /></View> : null}
        </View>
      ))}
      <View style={{ marginTop: 10 }}><Button small kind="secondary" title="Analyse now" onPress={async () => { try { await api('/api/me/analyze', { body: {} }); reload(); } catch (e: any) { toast(e.message ?? 'Failed'); } }} /></View>
    </Card>
  );
}
