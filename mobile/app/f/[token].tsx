import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { K } from '@/kit/tokens';
import { Kicker, Txt } from '@/kit/core';
import { api } from '@/api';
import { MessageComposer } from '@/kit/MessageComposer';
import { MediaBubble } from '@/kit/MediaBubble';
import { startOutbox } from '@/data/outbox';

type Msg = { id: number; fromFamily: number; text: string; kind: 'text' | 'voice' | 'video' | 'photo'; seconds: number; hasMedia: number; at: string };
/** Public page for a family member (no account): videos, photos and messages to and from the astronaut. The link is the credential. */
export default function FamilyGuest() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [info, setInfo] = useState<{ name: string; astronaut: string } | 'bad' | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const load = () => { api<{ name: string; astronaut: string }>(`/api/family/${token}/info`).then(setInfo).catch(() => setInfo('bad')); api<{ messages: Msg[] }>(`/api/family/${token}/messages`).then(r => setMsgs(r.messages)).catch(() => {}); };
  useEffect(() => { startOutbox(); load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [token]);
  const box = { flex: 1, backgroundColor: '#1C120D' } as const;
  if (info === 'bad') return <View style={{ ...box, alignItems: 'center', padding: 22, paddingTop: 48 }}><Txt v="title" color="#fff" center>This link is not valid</Txt><Txt v="sub" color="#E3B79E" center style={{ marginTop: 8 }}>Ask for a new link.</Txt></View>;
  if (!info) return <View style={box} />;
  return (
    <ScrollView style={box} contentContainerStyle={{ alignItems: 'center', padding: 22, paddingTop: 48, paddingBottom: 60 }}>
      <Txt v="mono" color="#E3B79E" upper>✦ Celeste · family line</Txt>
      <Txt v="hero" color="#fff" center style={{ marginTop: 14, fontSize: 32 }}>Hi {info.name}</Txt>
      <Txt v="sub" color="#E3B79E" center style={{ marginTop: 6, maxWidth: 360 }}>{info.astronaut} is far away, so there are no calls. Send a message, a video or a photo: it is saved, sent in small pieces and arrives when the link allows.</Txt>

      <View style={{ width: '100%', maxWidth: 420, marginTop: 22, gap: 8 }}>
        <Kicker color="#E3B79E">Messages</Kicker>
        {msgs.length ? msgs.slice(-12).map(m => (
          <View key={m.id} style={{ alignSelf: m.fromFamily ? 'flex-end' : 'flex-start', maxWidth: '90%', backgroundColor: m.fromFamily ? K.copper : 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 10 }}>
            {m.kind === 'text' ? <Txt v="sub" color="#fff">{m.text}</Txt> : m.hasMedia ? <MediaBubble path={`/api/family/${token}/messages/${m.id}/media`} kind={m.kind} seconds={m.seconds} caption={m.text} dark /> : <Txt v="caption" color="#F2D9CB">The recording was removed after 14 days.</Txt>}
            <Txt v="caption" color="rgba(255,255,255,0.6)" style={{ marginTop: 2 }}>{m.fromFamily ? 'You' : info.astronaut} · {m.at} UTC</Txt>
          </View>
        )) : <Txt v="sub" color="#A8958B">No messages yet. Write the first one.</Txt>}
      </View>

      <View style={{ width: '100%', maxWidth: 420, marginTop: 22, padding: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.94)' }}>
        <MessageComposer target={{ type: 'family-guest', token: String(token) }} onSent={() => setTimeout(load, 1500)} />
      </View>
      <Txt v="caption" color="#A8958B" center style={{ marginTop: 20, maxWidth: 340 }}>Private link: only share it with people you trust. Recordings are kept for 14 days.</Txt>
    </ScrollView>
  );
}
