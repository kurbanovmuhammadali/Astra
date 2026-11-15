/** Profile › Demo & presentation: synthetic Mars demo and judge mode. */
import React from 'react';
import { FlaskConical, Presentation } from 'lucide-react-native';
import { ListGroup, ListRow, PageHead, TopBar } from '@/kit/ui';
import { Page } from '@/kit/page';
import { Switch } from '@/kit/settings';
import { setStore, useStore } from '@/data/store';

export default function PresentationScreen() {
  const settings = useStore(s => s.settings);
  const set = (k: 'demo' | 'judge', v: boolean) => setStore(s => ({ ...s, settings: { ...s.settings, [k]: v } }));
  return (
    <Page title="Demo & presentation" maxWidth={640} header={<TopBar title="Demo & presentation" />}>
      <PageHead kicker="Presentation" title="Demo & presentation" sub="Synthetic data is always labelled SYNTHETIC." style={{ marginTop: 6 }} />
      <ListGroup style={{ marginTop: 16 }}>
        <ListRow icon={FlaskConical} title="Synthetic Mars demo" sub="Labelled demo telemetry for the full workflow" chevron={false} right={<Switch on={settings.demo} onChange={v => set('demo', v)} label="Synthetic Mars demo" />} />
        <ListRow icon={Presentation} title="Judge mode" sub="Hides chat, fitness extras and anything off-mission" chevron={false} right={<Switch on={settings.judge} onChange={v => set('judge', v)} label="Judge mode" />} />
      </ListGroup>
    </Page>
  );
}
