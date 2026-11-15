import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Txt } from '@/kit/core';
import { api } from '@/api';
import { A } from '@/theme';
import { ChatScreen } from '@/kit/Chat';
import type { ChatMsg } from '@/kit/Chat';
import { startOutbox } from '@/data/outbox';

/** Public page for a family member (no account): the same messenger as the astronaut, through a private link. No calls. */
export default function FamilyGuest() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [info, setInfo] = useState<{ name: string; astronaut: string } | 'bad' | null>(null);
  useEffect(() => { startOutbox(); api<{ name: string; astronaut: string }>(`/api/family/${token}/info`).then(setInfo).catch(() => setInfo('bad')); }, [token]);
  if (info === 'bad') return <View style={{ flex: 1, backgroundColor: A.sand, alignItems: 'center', padding: 24, paddingTop: 80 }}><Txt v="title" center>This link is not valid</Txt><Txt v="sub" center style={{ marginTop: 8 }}>Ask for a new link.</Txt></View>;
  if (!info) return <View style={{ flex: 1, backgroundColor: A.sand }} />;
  return (
    <ChatScreen title={info.astronaut} sub={`Hi ${info.name}. ${info.astronaut} is far away, so there are no calls: send videos, photos and messages.`} mineIs={1} target={{ type: 'family-guest', token: String(token) }}
      load={async after => (await api<{ messages: ChatMsg[] }>(`/api/family/${token}/messages?after=${after}`)).messages}
      mediaPath={m => `/api/family/${token}/messages/${m.id}/media`} emptyText="No messages yet. Write the first one." />
  );
}
