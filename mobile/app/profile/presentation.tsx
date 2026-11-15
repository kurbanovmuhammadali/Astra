/** Profile › Demo & presentation: synthetic Mars demo, judge mode, emergency drill and the camera station. */
import React from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { Camera, FlaskConical, Presentation, Siren } from 'lucide-react-native';
import { ListGroup, ListRow, PageHead, TopBar, toast } from '@/kit/ui';
import { Page } from '@/kit/page';
import { Switch } from '@/kit/settings';
import { api } from '@/api';
import { setStore, useStore } from '@/data/store';
import { disableJudge, enableJudge } from '@/data/judge';

export default function PresentationScreen() {
  const settings = useStore(s => s.settings);
  const set = (k: 'demo' | 'judge', v: boolean) => {
    if (k === 'judge') { if (v) enableJudge(); else disableJudge(); } // judge mode also switches to the synthetic Mars case and back
    setStore(s => ({ ...s, settings: { ...s.settings, [k]: v, ...(k === 'judge' && v ? { demo: true } : {}) } }));
  };
  const drill = async () => { try { await api('/api/alerts/test', { body: {} }); toast('Test alert sent to flight surgeons and crew'); } catch (e: any) { toast(e.message ?? 'Could not send'); } };
  return (
    <Page title="Demo & presentation" maxWidth={640} header={<TopBar title="Demo & presentation" />}>
      <PageHead kicker="Presentation" title="Demo & presentation" sub="Synthetic data is always labelled SYNTHETIC." style={{ marginTop: 6 }} />
      <ListGroup style={{ marginTop: 16 }}>
        <ListRow icon={FlaskConical} title="Synthetic Mars demo" sub="Labelled demo telemetry for the full workflow" chevron={false} right={<Switch on={settings.demo} onChange={v => set('demo', v)} label="Synthetic Mars demo" />} />
        <ListRow icon={Presentation} title="Judge mode" sub="Mars mission, one real dataset, one handoff. Hides off-mission extras" chevron={false} right={<Switch on={settings.judge} onChange={v => set('judge', v)} label="Judge mode" />} />
      </ListGroup>
      <ListGroup kicker="Live demo tools" style={{ marginTop: 14 }}>
        <ListRow icon={Siren} title="Send a test emergency alert" sub="A labelled drill to every flight surgeon and crew mate" onPress={drill} />
        {Platform.OS === 'web' ? <ListRow icon={Camera} title="Open the camera station" sub="Scan the room: faces, live video, emergency detection (laptop, demo only)" onPress={() => { try { window.open('/camera', '_blank'); } catch { router.push('/camera'); } }} /> : null}
      </ListGroup>
    </Page>
  );
}
