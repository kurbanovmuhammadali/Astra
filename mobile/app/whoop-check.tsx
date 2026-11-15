/** /whoop-check: one page that answers a single question: does WHOOP work? Keys, connection, a live test call, imported data, live heart rate. */
import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { Check, Minus, X } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { Kicker, Txt } from '@/kit/core';
import { Button, Card, PageHead, TopBar, toast } from '@/kit/ui';
import { Page } from '@/kit/page';
import { api } from '@/api';
import { useApi } from '@/useApi';
import { LiveHeartCard } from '@/kit/LiveHeartCard';

type Check = {
  configured: boolean; connected: boolean; status: string; lastSync: string | null; total: number;
  api: { ok: boolean; status: number; error?: string } | null;
  detail: { imported: number; recoveries: number; recoveriesScored: number; calibrating: number; invalid: number; sleeps: number; sleepsScored: number; at: string } | null;
  latest: Record<string, { value: number; unit: string; at: string }>;
};
const ms = (s: string) => Date.parse(s.replace(' ', 'T') + 'Z');
const ago = (s: string) => { const m = Math.max(0, Math.round((Date.now() - ms(s)) / 6e4)); return m < 2 ? 'just now' : m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const LABEL: Record<string, string> = { recovery: 'Recovery', hrv: 'HRV', rhr: 'Resting heart rate', sleep: 'Sleep', spo2: 'SpO₂', strain: 'Strain', weight: 'Weight' };

function Row({ ok, title, detail }: { ok: boolean | null; title: string; detail?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: K.hair }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ok === null ? K.cardSunk : ok ? K.okTint : K.flagTint }}>
        {ok === null ? <Minus size={15} color={K.ink3} /> : ok ? <Check size={16} color={K.ok} strokeWidth={2.6} /> : <X size={16} color={K.flag} strokeWidth={2.6} />}
      </View>
      <View style={{ flex: 1 }}><Txt v="subM">{title}</Txt>{detail ? <Txt v="caption" color={K.ink2} style={{ marginTop: 2 }}>{detail}</Txt> : null}</View>
    </View>
  );
}

export default function WhoopCheck() {
  const { data, reload, loading } = useApi<Check>('/api/integrations/whoop/check');
  const [busy, setBusy] = useState<string | null>(null), [note, setNote] = useState<string | null>(null);
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); setNote(null); try { await fn(); } catch (e: any) { setNote(e.message ?? 'Failed'); } finally { setBusy(null); reload(); } };
  const connect = () => run('connect', async () => { const r = await api<{ url: string }>('/api/integrations/whoop/start', { body: { platform: 'web' } }); if (Platform.OS === 'web') window.location.href = r.url; });
  const sync = () => run('sync', async () => { const r = await api<{ imported: number; recoveries: number; sleeps: number; calibrating: number }>('/api/integrations/whoop/sync', { method: 'POST' }); setNote(r.imported > 0 ? `Imported ${r.imported} values.` : r.recoveries + r.sleeps === 0 ? 'WHOOP returned nothing for the last 30 days. It has not collected data yet, or it is not synced in the WHOOP app.' : r.calibrating ? 'WHOOP is still calibrating your recovery (first days of wear).' : 'WHOOP has records but none are scored yet.'); toast('Sync finished'); });
  const d = data, scoredOk = d?.detail ? d.detail.recoveriesScored + d.detail.sleepsScored > 0 : null;
  const latest = Object.entries(d?.latest ?? {});
  return (
    <Page title="WHOOP check" maxWidth={560} onRefresh={reload} header={<TopBar title="WHOOP check" />}>
      <PageHead kicker="One check" title="Does WHOOP work?" sub="Four quick tests, then the live heartbeat. Everything here is read from your own account." style={{ marginTop: 6 }} />

      <Card style={{ marginTop: 14 }}>
        <Row ok={d ? d.configured : null} title="The server has WHOOP keys" detail={d && !d.configured ? 'Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET on the server.' : undefined} />
        <Row ok={d ? d.connected : null} title="Your account is connected" detail={d ? (d.connected ? `Status: ${d.status}` : d.status === 'error' ? 'The WHOOP session expired: connect again.' : 'Not connected yet. Press Connect below.') : undefined} />
        <Row ok={d?.connected ? !!d.api?.ok : null} title="WHOOP answers with your token" detail={d?.connected ? (d.api?.ok ? 'A live test call succeeded.' : `The test call failed${d.api ? ` (HTTP ${d.api.status})` : ''}${d.api?.error ? `: ${d.api.error}` : ''}. Reconnect WHOOP.`) : 'Connect first.'} />
        <Row ok={d ? (d.total > 0 ? true : d.connected ? false : null) : null} title="Data has been imported" detail={d ? (d.total > 0 ? `${d.total} WHOOP values · last sync ${d.lastSync ? ago(d.lastSync) : 'never'}` : d.connected ? (scoredOk === false ? 'WHOOP has not scored anything yet. It needs a night of wear and a sync in the WHOOP app.' : 'Nothing imported yet. Press Sync now.') : 'Connect first.') : undefined} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {d && !d.connected ? <Button title="Connect WHOOP" loading={busy === 'connect'} disabled={!d.configured} onPress={connect} /> : null}
          {d?.connected ? <Button title="Sync now" loading={busy === 'sync'} onPress={sync} /> : null}
          <Button kind="secondary" title="Check again" loading={loading || busy === 'recheck'} onPress={() => run('recheck', async () => {})} />
        </View>
        {note ? <Txt v="sub" color={K.ink2} style={{ marginTop: 10 }}>{note}</Txt> : null}
      </Card>

      {latest.length ? (
        <Card style={{ marginTop: 12 }}>
          <Kicker>Latest from WHOOP</Kicker>
          {latest.map(([k, v]) => <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: K.hair }}><Txt v="sub" style={{ flex: 1 }}>{LABEL[k] ?? k}</Txt><Txt v="subM">{k === 'sleep' ? `${v.value} h` : `${v.value}${v.unit ? ' ' + v.unit : ''}`}</Txt><Txt v="caption" color={K.ink3} style={{ width: 84, textAlign: 'right' }}>{ago(v.at)}</Txt></View>)}
        </Card>
      ) : null}

      <LiveHeartCard />
    </Page>
  );
}
