/** Profile › Connected data: WHOOP and Apple Watch. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Activity, Check, Watch } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { Txt } from '@/kit/core';
import { Button, ListGroup, ListRow, PageHead, Sheet, TopBar, toast } from '@/kit/ui';
import { Page } from '@/kit/page';
import { Status } from '@/kit/settings';
import { useApi } from '@/useApi';
import { setStore, useStore } from '@/data/store';

export default function Connected() {
  const { data } = useApi<{ providers: { key: string; status: string }[] }>('/api/integrations');
  const whoop = data?.providers.some(p => (p.key === 'whoop' || p.key === 'demo') && p.status === 'connected') ?? false;
  const watch = useStore(s => !!s.devices.appleWatch);
  const [sheet, setSheet] = useState(false);
  return (
    <Page title="Connected data" maxWidth={640} header={<TopBar title="Connected data" />}>
      <PageHead kicker="Sources" title="Connected data" sub="Every value in Celeste shows which of these it came from." style={{ marginTop: 6 }} />
      <ListGroup style={{ marginTop: 16 }}>
        <ListRow icon={Activity} title="WHOOP" sub="Recovery, sleep and HRV" right={<Status on={whoop} />} onPress={() => router.push('/integrations')} />
        <ListRow icon={Watch} title="Apple Watch" sub="Apple Health permissions" right={<Status on={watch} />} onPress={() => setSheet(true)} />
      </ListGroup>
      <Sheet open={sheet} onClose={() => setSheet(false)} kicker="Apple Health" title={watch ? 'Apple Watch is connected' : 'Connect Apple Watch'}>
        <Txt v="sub" color={K.ink2}>Celeste reads heart rate, workouts and sleep from Apple Health on this iPhone. You choose each data type in the Health permission sheet.</Txt>
        <View style={{ gap: 8, marginTop: 14 }}>
          {['Heart rate & resting heart rate', 'Workouts and workout heart rate', 'Sleep analysis'].map(t => (
            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Check size={15} color={K.copper} /><Txt v="sub">{t}</Txt></View>
          ))}
        </View>
        <Button title={watch ? 'Disconnect' : 'Continue to Apple Health'} kind={watch ? 'secondary' : 'primary'} style={{ marginTop: 20 }}
          onPress={() => { setStore(s => ({ ...s, devices: { ...s.devices, appleWatch: !watch } })); setSheet(false); toast(watch ? 'Apple Watch disconnected' : 'Apple Watch connected · preview'); }} />
        <Txt v="caption" color={K.ink3} center style={{ marginTop: 10 }}>Preview · HealthKit access is requested in the iOS build.</Txt>
      </Sheet>
    </Page>
  );
}
