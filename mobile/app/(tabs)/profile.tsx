import React, { useState } from 'react';
import { Animated, View } from 'react-native';
import { router } from 'expo-router';
import { UserPen, Orbit, Presentation, ScanFace, Cable, UserCog, Siren } from 'lucide-react-native';
import { Status } from '@/kit/settings';
import { useAuth } from '@/auth';
import { useApi } from '@/useApi';
import { ELEV, K } from '@/kit/tokens';
import { Txt, useLayout, useLoop } from '@/kit/core';
import { ListGroup, ListRow, Tag } from '@/kit/ui';
import { Cols, Page } from '@/kit/page';
import { useStore } from '@/data/store';

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

export default function Profile() {
  const { user } = useAuth();
  const { wide } = useLayout();
  const { data: integ } = useApi<Integrations>('/api/integrations');
  const profile = useStore(s => s.profile);
  const watch = useStore(s => !!s.devices.appleWatch);
  const face = useStore(s => !!s.face);
  const settings = useStore(s => s.settings);
  if (!user) return null;
  const whoop = integ?.providers.some(p => (p.key === 'whoop' || p.key === 'demo') && p.status === 'connected') ?? false;

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
        <ListRow icon={Orbit} title="Mission briefing" sub="Destination, comm delay, EVA schedule, crew" onPress={() => router.push('/profile/briefing')} />
        <ListRow icon={ScanFace} title="Face scan" sub="Crew recognition for camera tools" right={<Status on={face} onText="Saved" offText="Set up" />} onPress={() => router.push('/profile/face')} />
      </ListGroup>
    </View>
  );
  const right = (
    <View style={{ gap: 12, marginTop: wide ? 0 : 12 }}>
      <ListGroup kicker="Settings">
        <ListRow icon={Cable} title="Connected data" sub={`WHOOP ${whoop ? 'connected' : 'not connected'} · Apple Watch ${watch ? 'connected' : 'off'}`} onPress={() => router.push('/profile/connected')} />
        <ListRow icon={Presentation} title="Demo & presentation" sub={`${settings.demo ? 'Synthetic demo on' : 'Real data only'}${settings.judge ? ' · judge mode' : ''}`} onPress={() => router.push('/profile/presentation')} />
        <ListRow icon={UserCog} title="Account" sub="Privacy, flight surgeon, research, sign out" onPress={() => router.push('/profile/account')} />
      </ListGroup>
      <ListGroup kicker="Safety">
        <ListRow icon={Siren} title="Emergency protocols" sub="Offline training checklists" tone="flag" onPress={() => router.push('/emergency')} />
      </ListGroup>
      <Txt v="caption" color={K.ink3} center style={{ marginTop: 8 }}>Not a medical device · Not affiliated with NASA</Txt>
    </View>
  );

  return (
    <Page tabs title="Settings" maxWidth={980} header={<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Txt v="headline">Settings</Txt><Tag label="Crew account" /></View>}>
      {head}
      <Cols gap={16} style={{ marginTop: 14 }}>{left}{right}</Cols>
    </Page>
  );
}
