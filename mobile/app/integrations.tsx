import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Watch, Database, Smartphone, FlaskConical, Radiation, Shirt } from 'lucide-react-native';
import { api } from '@/api';
import { useApi } from '@/useApi';
import { C } from '@/theme';
import { Button, Card, Header, Loading, Notice, Row, Screen, T, Grid } from '@/ui';

type P = { key: string; name: string; kind: string; status: string; lastSync: string | null; available: boolean; metrics: string[]; note?: string };
const ICON: Record<string, any> = { whoop: Watch, demo: Database, healthkit: Smartphone, 'nasa-lab': FlaskConical, dosimeter: Radiation, astroskin: Shirt };
const STATUS: Record<string, [string, string]> = { connected: ['Connected', C.green], disconnected: ['Not connected', C.ink3], planned: ['Planned', C.ink3], ready: ['API ready', C.amber] };

export default function Integrations() {
  const q = useLocalSearchParams<{ whoop?: string }>();
  const { data, reload } = useApi<{ providers: P[] }>('/api/integrations');
  const [msg, setMsg] = useState<{ kind: 'green' | 'red' | 'amber'; text: string } | null>(
    q.whoop === 'connected' ? { kind: 'green', text: 'WHOOP connected and synced.' } : q.whoop ? { kind: 'red', text: 'WHOOP connection was not completed.' } : null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } catch (e: any) { setMsg({ kind: 'red', text: e.message }); } finally { setBusy(null); reload(); } };
  const connectWhoop = () => run('whoop', async () => {
    const { url } = await api<{ url: string }>('/api/integrations/whoop/start', { body: { platform: Platform.OS === 'web' ? 'web' : 'native' } });
    if (Platform.OS === 'web') { window.location.href = url; return; }
    const r = await WebBrowser.openAuthSessionAsync(url, Linking.createURL('integrations'));
    if (r.type === 'success') setMsg({ kind: 'green', text: 'WHOOP connected and synced.' });
  });
  const syncWhoop = () => run('whoop', async () => { const r = await api<{ imported: number }>('/api/integrations/whoop/sync', { method: 'POST' }); setMsg({ kind: 'green', text: `Imported ${r.imported} WHOOP values.` }); });
  const disconnectWhoop = () => run('whoop', async () => { await api('/api/integrations/whoop', { method: 'DELETE' }); setMsg({ kind: 'amber', text: 'WHOOP disconnected and access revoked.' }); });
  const demo = (on: boolean) => run('demo', async () => { await api('/api/integrations/demo', { method: on ? 'POST' : 'DELETE' }); setMsg({ kind: on ? 'green' : 'amber', text: on ? 'Demo dataset reloaded (30 days).' : 'Demo data removed. Only your real data remains.' }); });

  return (
    <Screen bottomSpace={40}>
      <Header title="Data sources" back sub="Everything becomes one record: metric · value · unit · source · time" />
      {msg ? <Notice kind={msg.kind} title={msg.text} /> : null}
      {!data ? <Loading /> : (
        <Grid wide={2}>
          {data.providers.map(p => {
            const Icon = ICON[p.key] ?? Database;
            const [label, color] = STATUS[p.status] ?? [p.status, C.ink3];
            return (
              <Card key={p.key} style={{ minHeight: 200 }}>
                <Row gap={12}>
                  <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: p.key === 'whoop' ? C.ink : C.soft, alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={p.key === 'whoop' ? '#fff' : C.ink} /></View>
                  <View style={{ flex: 1 }}>
                    <T size={17} weight="m">{p.name}</T>
                    <Row gap={6}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} /><T size={12} color={C.ink2}>{label} · {p.kind}</T></Row>
                  </View>
                </Row>
                <T size={12} color={C.ink3} style={{ marginTop: 10 }}>Provides: {p.metrics.join(', ')}</T>
                {p.lastSync ? <T size={12} color={C.ink3}>Last sync: {p.lastSync} UTC</T> : null}
                {p.note ? <T size={12} color={C.ink2} style={{ marginTop: 6 }}>{p.note}</T> : null}
                <View style={{ marginTop: 12 }}>
                  {p.key === 'whoop' && (p.status === 'connected'
                    ? <Row gap={8}><Button title="Sync now" kind="dark" loading={busy === 'whoop'} onPress={syncWhoop} style={{ flex: 1, height: 46 }} /><Button title="Disconnect" kind="ghost" onPress={disconnectWhoop} style={{ flex: 1, height: 46 }} /></Row>
                    : <>
                        <Button title="Connect WHOOP" kind="coral" loading={busy === 'whoop'} onPress={connectWhoop} style={{ height: 46 }} />
                        <T size={11} color={C.ink3} style={{ marginTop: 8 }}>You’ll sign in on WHOOP and approve read-only access to recovery, sleep, cycles, workouts and body measurements. We never see your WHOOP password.</T>
                      </>)}
                  {p.key === 'demo' && <Row gap={8}><Button title="Reload demo" kind="light" loading={busy === 'demo'} onPress={() => demo(true)} style={{ flex: 1, height: 46 }} />{p.status === 'connected' ? <Button title="Remove" kind="ghost" onPress={() => demo(false)} style={{ flex: 1, height: 46 }} /> : null}</Row>}
                </View>
              </Card>
            );
          })}
        </Grid>
      )}
    </Screen>
  );
}
