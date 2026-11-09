import React, { useState } from 'react';
import { Animated, View } from 'react-native';
import { router } from 'expo-router';
import { UserPen, CalendarRange, Activity, Watch, ShieldCheck, LogOut, Clapperboard, FileHeart, Check } from 'lucide-react-native';
import { useAuth } from '@/auth';
import { useApi } from '@/useApi';
import { ELEV, K } from '@/kit/tokens';
import { Txt, useLayout, useLoop } from '@/kit/core';
import { Button, ListGroup, ListRow, Sheet, Tag, toast } from '@/kit/ui';
import { Cols, Page } from '@/kit/page';
import { setStore, useStore } from '@/data/store';

type Integrations = { providers: { key: string; status: string; name?: string }[] };

function Avatar({ name }: { name: string }) {
  const spin = useLoop(20000);
  return (
    <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 1.2, borderColor: K.copperSoft, borderStyle: 'dashed', transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }} />
      <View style={[{ width: 76, height: 76, borderRadius: 38, backgroundColor: K.copperTint, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' }, ELEV.card]}>
        <Txt v="display" color={K.copper}>{name.trim().charAt(0).toUpperCase() || 'A'}</Txt>
      </View>
    </View>
  );
}

const Status = ({ on }: { on: boolean }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: on ? K.okTint : K.copperTint }}>
    {on ? <Check size={12} color={K.ok} strokeWidth={2.6} /> : null}
    <Txt v="caption" color={on ? K.ok : K.copperInk} style={{ fontFamily: 'Geist_500Medium' }}>{on ? 'Connected' : 'Connect'}</Txt>
  </View>
);

export default function Profile() {
  const { user, logout } = useAuth();
  const { wide } = useLayout();
  const { data: integ } = useApi<Integrations>('/api/integrations');
  const profile = useStore(s => s.profile);
  const watch = useStore(s => !!s.devices.appleWatch);
  const [watchSheet, setWatchSheet] = useState(false);
  const [outSheet, setOutSheet] = useState(false);
  if (!user) return null;
  const whoop = integ?.providers.some(p => (p.key === 'whoop' || p.key === 'demo') && p.status === 'connected') ?? false;
  const signOut = async () => { setOutSheet(false); await logout(); router.replace('/welcome'); };

  const head = (
    <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
      <Avatar name={user.name} />
      <Txt v="title" style={{ marginTop: 10 }}>{user.name}</Txt>
      <Txt v="sub" color={K.ink2} style={{ marginTop: 2 }}>Crew member · {profile.duration}-day mission</Txt>
      <Txt v="mono" color={K.ink3} style={{ marginTop: 4 }}>{user.email}</Txt>
    </View>
  );

  const left = (
    <View style={{ gap: 12 }}>
      <ListGroup kicker="Crew profile">
        <ListRow icon={UserPen} title="Edit profile" sub="Name and personal details" onPress={() => router.push('/profile/edit')} />
        <ListRow icon={CalendarRange} title="Mission & training" sub="Flight duration and plan inputs" onPress={() => router.push('/profile/mission')} />
      </ListGroup>
      <ListGroup kicker="Connected data">
        <ListRow icon={Activity} title="WHOOP" sub="Recovery, sleep and HRV" right={<Status on={whoop} />} onPress={() => router.push('/integrations')} />
        <ListRow icon={Watch} title="Apple Watch" sub="Apple Health permissions" right={<Status on={watch} />} onPress={() => setWatchSheet(true)} />
      </ListGroup>
    </View>
  );
  const right = (
    <View style={{ gap: 12, marginTop: wide ? 0 : 12 }}>
      <ListGroup kicker="Account">
        <ListRow icon={ShieldCheck} title="Privacy & account controls" sub="Data permissions and account deletion" onPress={() => router.push('/profile/privacy')} />
        <ListRow icon={FileHeart} title="Flight surgeon report" sub="Share a summary with your surgeon" onPress={() => router.push('/report')} />
        <ListRow icon={Clapperboard} title="Replay intro" sub="Watch the Astra film again" onPress={() => router.push('/intro?replay=1')} />
        <ListRow icon={LogOut} title="Sign out" sub="End this session" onPress={() => setOutSheet(true)} />
      </ListGroup>
      <Txt v="caption" color={K.ink3} center style={{ marginTop: 8 }}>Not a medical device · Not affiliated with NASA</Txt>
    </View>
  );

  return (
    <Page tabs title="Settings" maxWidth={980} header={<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Txt v="headline">Settings</Txt><Tag label="Crew account" /></View>}>
      {head}
      <Cols gap={16} style={{ marginTop: 14 }}>{left}{right}</Cols>

      <Sheet open={watchSheet} onClose={() => setWatchSheet(false)} kicker="Apple Health" title={watch ? 'Apple Watch is connected' : 'Connect Apple Watch'}>
        <Txt v="sub" color={K.ink2}>Astra reads heart rate, workouts and sleep from Apple Health on this iPhone. You choose each data type in the Health permission sheet, and can change it any time in Settings › Health.</Txt>
        <View style={{ gap: 8, marginTop: 14 }}>
          {['Heart rate & resting heart rate', 'Workouts and workout heart rate', 'Sleep analysis'].map(t => (
            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Check size={15} color={K.copper} /><Txt v="sub">{t}</Txt></View>
          ))}
        </View>
        <Button title={watch ? 'Disconnect' : 'Continue to Apple Health'} kind={watch ? 'secondary' : 'primary'} style={{ marginTop: 20 }}
          onPress={() => { setStore(s => ({ ...s, devices: { ...s.devices, appleWatch: !watch } })); setWatchSheet(false); toast(watch ? 'Apple Watch disconnected' : 'Apple Watch connected · preview'); }} />
        <Txt v="caption" color={K.ink3} center style={{ marginTop: 10 }}>Preview · HealthKit access is requested in the iOS build.</Txt>
      </Sheet>

      <Sheet open={outSheet} onClose={() => setOutSheet(false)} kicker="Account" title="Sign out of Astra?">
        <Txt v="sub" color={K.ink2}>Your data stays on the server. You can sign in again with your crew email.</Txt>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <Button title="Cancel" kind="secondary" style={{ flex: 1 }} onPress={() => setOutSheet(false)} />
          <Button title="Sign out" style={{ flex: 1 }} onPress={signOut} />
        </View>
      </Sheet>
    </Page>
  );
}
