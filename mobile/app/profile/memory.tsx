/** Profile › What the SI remembers: short facts it learned in earlier chats. Private; read, delete or add them here. */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Brain, Trash2 } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { F } from '@/theme';
import { Pressy, Txt } from '@/kit/core';
import { Button, Card, Notice, PageHead, TopBar, toast } from '@/kit/ui';
import { Page } from '@/kit/page';
import { api } from '@/api';
import { useApi } from '@/useApi';

export default function Memory() {
  const { data, reload } = useApi<{ facts: { id: number; fact: string; at: string }[] }>('/api/me/si-memory');
  const [fact, setFact] = useState('');
  const run = async (fn: () => Promise<any>) => { try { await fn(); reload(); } catch (e: any) { toast(e.message ?? 'Failed'); } };
  return (
    <Page title="SI memory" maxWidth={640} onRefresh={reload} header={<TopBar title="SI memory" />}>
      <PageHead kicker="Private" title="What the SI remembers" sub="Short facts from your earlier chats, so it stays consistent. Only you see this. Delete anything you do not want it to keep." style={{ marginTop: 6 }} />
      <Card style={{ marginTop: 14 }}>
        {(data?.facts ?? []).map(f => (
          <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: K.hair }}>
            <Brain size={16} color={K.copper} />
            <View style={{ flex: 1 }}><Txt v="sub">{f.fact}</Txt><Txt v="caption" color={K.ink3}>{f.at} UTC</Txt></View>
            <Pressy label={`Forget: ${f.fact}`} onPress={() => run(() => api(`/api/me/si-memory/${f.id}`, { method: 'DELETE' }))}><Trash2 size={16} color={K.ink3} /></Pressy>
          </View>
        ))}
        {data && !data.facts.length ? <Notice tone="ok" title="Nothing yet" body="As you chat, the SI keeps only lasting things: preferences, routines, goals." /> : null}
        <TextInput value={fact} onChangeText={setFact} placeholder="Tell the SI something to remember…" placeholderTextColor={K.ink3} maxLength={200} style={{ marginTop: 12, height: 44, borderRadius: 12, borderWidth: 1.2, borderColor: K.hair2, paddingHorizontal: 12, fontFamily: F.r, fontSize: 15, color: K.ink }} accessibilityLabel="New memory" />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Button small title="Remember" disabled={fact.trim().length < 4} onPress={() => run(async () => { await api('/api/me/si-memory', { body: { fact } }); setFact(''); })} />
          {data?.facts.length ? <Button small kind="secondary" title="Forget everything" onPress={() => run(() => api('/api/me/si-memory', { method: 'DELETE' }))} /> : null}
        </View>
      </Card>
    </Page>
  );
}
