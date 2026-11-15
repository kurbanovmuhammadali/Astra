import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { K } from '@/kit/tokens';
import { F } from '@/theme';
import { Kicker, Txt } from '@/kit/core';
import { Button, Card, Chip, Tag, toast } from '@/kit/ui';
import { api } from '@/api';
import { MessageComposer } from '@/kit/MessageComposer';
import { useApi } from '@/useApi';

type Norm = { metric: string; label: string; unit: string; learned: { mean: number; sd: number; n: number; low: number; high: number } | null; doctor: { low: number | null; high: number | null; note: string | null } | null };
type Brain = {
  analyses: { at: string; level: string; summary: string }[];
  norms: Norm[];
  notes: { id: number; text: string; at: string; doctor: string | null; validUntil: string | null; active: number }[];
  adjustments: { id: number; day: string | null; kind: string; title: string; detail: string; status: string; by: string; at: string }[];
};
const tone = (l: string) => (l === 'alert' ? 'flag' : l === 'watch' ? 'watch' : l === 'ok' ? 'ok' : 'none');
const box = { height: 38, borderRadius: 10, borderWidth: 1.2, borderColor: K.hair2, paddingHorizontal: 8, fontFamily: F.r, fontSize: 14, color: K.ink, textAlign: 'center' as const };

/** What the SI knows about this astronaut, and what the doctor can tell it: normal ranges, notes, a day off. */
export function DoctorBrain({ uid, name }: { uid: number; name: string }) {
  const { data, reload } = useApi<Brain>(`/api/admin/crew/${uid}/brain`);
  const [note, setNote] = useState('');
  const [days, setDays] = useState<number | null>(7); // how long the note stays in force
  const [edit, setEdit] = useState<Record<string, { low: string; high: string }>>({});
  const [day, setDay] = useState(new Date(Date.now() + 864e5).toISOString().slice(0, 10));
  const first = name.split(' ')[0];
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok); reload(); } catch (e: any) { toast(e.message ?? 'Failed'); } };
  if (!data) return null;
  const last = data.analyses[0];
  return (
    <Card style={{ marginTop: 14 }}>
      <Kicker>SI dataset for {first}</Kicker>
      <Txt v="caption" color={K.ink2} style={{ marginTop: 4 }}>The SI learns {first}'s normal from their own data every 30 minutes. What you enter here always wins, and the SI checks it before it suggests anything.</Txt>

      {last ? <View style={{ marginTop: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Tag label={`SI: ${last.level}`} tone={tone(last.level) as any} /><Txt v="caption" color={K.ink3}>{last.at} UTC</Txt></View><Txt v="sub" style={{ marginTop: 6 }}>{last.summary}</Txt></View> : <Txt v="sub" style={{ marginTop: 10 }}>No analysis yet.</Txt>}

      <Kicker color={K.ink2} style={{ marginTop: 16 }}>Doctor's notes (the SI remembers them for as long as you choose)</Kicker>
      <TextInput value={note} onChangeText={setNote} multiline placeholder={`e.g. ${first} has a low resting heart rate (athlete). Avoid hard intervals this week.`} placeholderTextColor={K.ink3} style={{ ...box, height: 78, textAlign: 'left', paddingTop: 8, marginTop: 6 }} accessibilityLabel="Doctor note" />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{([['Today', 1], ['This week', 7], ['This month', 30], ['Until I remove it', null]] as [string, number | null][]).map(([l, d]) => <Chip key={l} label={l} on={days === d} onPress={() => setDays(d)} />)}</View>
      <View style={{ marginTop: 8 }}><Button small title="Save note" disabled={note.trim().length < 2} onPress={() => run(async () => { await api(`/api/admin/crew/${uid}/doctor-notes`, { body: { text: note, days } }); setNote(''); }, 'Note saved')} /></View>
      {data.notes.map(n => (
        <View key={n.id} style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: K.hair }}>
          <Txt v="sub" color={n.active ? K.ink : K.ink3}>{n.text}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}><Txt v="caption" color={K.ink3} style={{ flex: 1 }}>{n.doctor ?? 'Doctor'} · {n.at} UTC · {n.validUntil ? (n.active ? `in force until ${n.validUntil}` : `ended ${n.validUntil}`) : 'in force until removed'}</Txt><Button small kind="secondary" title="Delete" onPress={() => run(() => api(`/api/admin/doctor-notes/${n.id}`, { method: 'DELETE' }), 'Deleted')} /></View>
        </View>
      ))}

      <Kicker color={K.ink2} style={{ marginTop: 16 }}>Normal ranges for {first}</Kicker>
      <Txt v="caption" color={K.ink3} style={{ marginTop: 2 }}>Learned from their data (grey). Type your own low / high to override.</Txt>
      {data.norms.map(n => {
        const e = edit[n.metric] ?? { low: n.doctor?.low != null ? String(n.doctor.low) : '', high: n.doctor?.high != null ? String(n.doctor.high) : '' };
        return (
          <View key={n.metric} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <View style={{ width: 120 }}><Txt v="subM">{n.label}</Txt><Txt v="caption" color={n.doctor ? K.copperInk : K.ink3}>{n.doctor ? 'doctor-set' : n.learned ? `learned ${n.learned.low}–${n.learned.high} ${n.unit}` : 'not enough data'}</Txt></View>
            <TextInput value={e.low} onChangeText={v => setEdit(s => ({ ...s, [n.metric]: { ...e, low: v.replace(/[^0-9.]/g, '') } }))} placeholder="low" placeholderTextColor={K.ink3} keyboardType="decimal-pad" style={{ ...box, width: 70 }} accessibilityLabel={`${n.label} low`} />
            <TextInput value={e.high} onChangeText={v => setEdit(s => ({ ...s, [n.metric]: { ...e, high: v.replace(/[^0-9.]/g, '') } }))} placeholder="high" placeholderTextColor={K.ink3} keyboardType="decimal-pad" style={{ ...box, width: 70 }} accessibilityLabel={`${n.label} high`} />
            <Button small title="Set" disabled={!e.low && !e.high} onPress={() => run(() => api(`/api/admin/crew/${uid}/norms/${n.metric}`, { method: 'PUT', body: { low: e.low, high: e.high } }), `${n.label} range set`)} />
            {n.doctor ? <Button small kind="secondary" title="Use learned" onPress={() => run(() => api(`/api/admin/crew/${uid}/norms/${n.metric}`, { method: 'DELETE' }), 'Back to learned')} /> : null}
          </View>
        );
      })}

      <Kicker color={K.ink2} style={{ marginTop: 16 }}>Message to {first} (text, voice or video)</Kicker>
      <View style={{ marginTop: 8 }}><MessageComposer to={uid} /></View>

      <Kicker color={K.ink2} style={{ marginTop: 16 }}>Rest and plan changes</Kicker>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <TextInput value={day} onChangeText={setDay} placeholder="YYYY-MM-DD" placeholderTextColor={K.ink3} style={{ ...box, width: 130 }} accessibilityLabel="Date" />
        <Button small title="Day off" onPress={() => run(() => api(`/api/admin/crew/${uid}/adjustments`, { body: { kind: 'day_off', day, reason: 'Doctor order' } }), 'Day off scheduled')} />
        <Button small kind="secondary" title="Lighter day" onPress={() => run(() => api(`/api/admin/crew/${uid}/adjustments`, { body: { kind: 'lighter_day', day, reason: 'Doctor order' } }), 'Lighter day scheduled')} />
      </View>
      {data.adjustments.map(a => (
        <View key={a.id} style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: K.hair }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Txt v="subM" style={{ flex: 1 }}>{a.title}{a.day ? ` · ${a.day}` : ''}</Txt><Tag label={`${a.by === 'si' ? 'SI' : 'Doctor'} · ${a.status}`} tone={a.status === 'proposed' ? 'watch' : a.status === 'applied' ? 'ok' : 'none'} /></View>
          {a.detail && a.kind !== 'norm' ? <Txt v="caption" color={K.ink2}>{a.detail}</Txt> : null}
          {a.status === 'proposed' ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <Button small title="Approve" onPress={() => run(() => api(`/api/admin/adjustments/${a.id}`, { body: { action: 'apply' } }), 'Approved')} />
              <Button small kind="secondary" title="Dismiss" onPress={() => run(() => api(`/api/admin/adjustments/${a.id}`, { body: { action: 'dismiss' } }), 'Dismissed')} />
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
}
