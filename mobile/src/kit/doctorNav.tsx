/** The doctor portal's own navigation: a left rail on a laptop, a bottom bar on a phone. Doctors never see the astronaut app. */
import React from 'react';
import { View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Users, Mic, Flag, Radar, LogOut } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { AstraLogo } from '../astra';
import { K } from './tokens';
import { Kicker, Pressy, Txt } from './core';
import { Dot } from './ui';

const itemsFor = (leader: boolean) => [
  { to: '/admin', match: (p: string) => p === '/admin' || /^\/admin\/\d/.test(p) || p === '/admin/index', icon: Users, label: 'Crew' },
  { to: '/admin/voice', match: (p: string) => p.startsWith('/admin/voice'), icon: Mic, label: 'Messages' },
  { to: '/admin/reports', match: (p: string) => p.startsWith('/admin/reports'), icon: Flag, label: 'Concerns' },
  ...(leader ? [{ to: '/admin/leader', match: (p: string) => p.startsWith('/admin/leader'), icon: Radar, label: 'Team' }] : []),
];

export function DoctorSidebar() {
  const path = usePathname();
  const { user, logout } = useAuth();
  return (
    <View style={{ width: 252, paddingTop: 30, paddingHorizontal: 18, paddingBottom: 22, borderRightWidth: 1, borderRightColor: K.hair, backgroundColor: 'rgba(255,250,246,0.6)' }}>
      <View style={{ paddingHorizontal: 10 }}><AstraLogo size={17} /></View>
      <Kicker color={K.ink3} style={{ marginTop: 34, marginBottom: 10, marginLeft: 10 }}>{user?.leader ? 'Team leader' : 'Doctor portal'}</Kicker>
      {itemsFor(!!user?.leader).map(t => {
        const on = t.match(path);
        return (
          <Pressy key={t.to} label={t.label} role="tab" selected={on} onPress={() => router.navigate(t.to as any)} to={0.98}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, height: 46, borderRadius: 14, marginBottom: 4, backgroundColor: on ? K.copper : 'transparent' }}>
              <t.icon size={19} color={on ? '#fff' : K.ink2} strokeWidth={1.8} /><Txt v="bodyM" color={on ? '#fff' : K.ink}>{t.label}</Txt>
            </View>
          </Pressy>
        );
      })}
      <View style={{ flex: 1 }} />
      <View style={{ padding: 14, borderRadius: 16, backgroundColor: K.card, borderWidth: 1, borderColor: K.hair }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Dot tone="ok" pulse /><Txt v="subM">{user?.name ?? 'Doctor'}</Txt></View>
        <Pressy label="Sign out" onPress={async () => { await logout(); router.replace('/welcome'); }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}><LogOut size={14} color={K.ink2} /><Txt v="caption" color={K.ink2}>Sign out</Txt></View></Pressy>
      </View>
    </View>
  );
}

/** Phone: big tap targets along the bottom edge. */
export function DoctorBar() {
  const path = usePathname();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const items = itemsFor(!!user?.leader);
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: 'rgba(255,250,246,0.96)', borderTopWidth: 1, borderTopColor: K.hair, paddingBottom: Math.max(insets.bottom, 6), paddingTop: 6, zIndex: 50 }}>
      {items.map(t => {
        const on = t.match(path);
        return (
          <Pressy key={t.to} label={t.label} role="tab" selected={on} onPress={() => router.navigate(t.to as any)}>
            <View style={{ alignItems: 'center', justifyContent: 'center', height: 54, minWidth: 74, paddingHorizontal: 6 }}>
              <t.icon size={22} color={on ? K.copper : K.ink3} strokeWidth={on ? 2.2 : 1.8} /><Txt v="caption" color={on ? K.copperInk : K.ink3} style={{ fontSize: 11, marginTop: 3 }}>{t.label}</Txt>
            </View>
          </Pressy>
        );
      })}
      <Pressy label="Sign out" onPress={async () => { await logout(); router.replace('/welcome'); }}>
        <View style={{ alignItems: 'center', justifyContent: 'center', height: 54, minWidth: 74, paddingHorizontal: 6 }}><LogOut size={22} color={K.ink3} strokeWidth={1.8} /><Txt v="caption" color={K.ink3} style={{ fontSize: 11, marginTop: 3 }}>Sign out</Txt></View>
      </Pressy>
    </View>
  );
}
