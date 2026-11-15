import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Play, Trash2 } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { Kicker, Pressy, Txt } from '@/kit/core';
import { Card, Tag } from '@/kit/ui';
import { api, API_URL } from '@/api';
import { useApi } from '@/useApi';
import { VoiceRecorder } from '@/kit/VoiceRecorder';

type Msg = { id: number; seconds: number; at: string; playedAt: string | null; fromName: string; fromId: number };

/** Delay-tolerant voice messages: play, delete and (for the astronaut) record one for the doctors. */
export function VoiceInbox({ title = 'Voice messages', recordTo }: { title?: string; recordTo?: 'doctors' }) {
  const { data, reload } = useApi<{ messages: Msg[]; unheard: number }>('/api/voicemail');
  const [playing, setPlaying] = useState<number | null>(null);
  const el = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { const t = setInterval(reload, 60000); return () => clearInterval(t); }, [reload]);
  const play = async (m: Msg) => {
    if (Platform.OS !== 'web') return;
    try {
      el.current?.pause();
      const r = await fetch(`${API_URL}/api/voicemail/${m.id}/audio`, { credentials: 'include', headers: { 'X-Requested-With': 'perigee' } });
      if (!r.ok) return;
      const a = new Audio(URL.createObjectURL(await r.blob())); el.current = a; setPlaying(m.id);
      a.onended = () => { setPlaying(null); reload(); }; await a.play(); reload();
    } catch { setPlaying(null); }
  };
  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Kicker style={{ flex: 1 }}>{title}</Kicker>{data?.unheard ? <Tag label={`${data.unheard} new`} tone="flag" /> : null}</View>
      {(data?.messages ?? []).map(m => (
        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: K.hair }}>
          <Pressy label={`Play message from ${m.fromName}`} onPress={() => play(m)}><View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: playing === m.id ? K.copper : K.copperTint, alignItems: 'center', justifyContent: 'center' }}><Play size={16} color={playing === m.id ? '#fff' : K.copperInk} /></View></Pressy>
          <View style={{ flex: 1 }}><Txt v="subM">{m.fromName}{m.playedAt ? '' : ' · new'}</Txt><Txt v="caption" color={K.ink3}>{m.at} UTC · {m.seconds}s</Txt></View>
          <Pressy label="Delete message" onPress={async () => { await api(`/api/voicemail/${m.id}`, { method: 'DELETE' }).catch(() => {}); reload(); }}><Trash2 size={16} color={K.ink3} /></Pressy>
        </View>
      ))}
      {data && !data.messages.length ? <Txt v="sub" color={K.ink2} style={{ marginTop: 8 }}>No messages.</Txt> : null}
      {recordTo ? <View style={{ marginTop: 12 }}><Txt v="caption" color={K.ink2} style={{ marginBottom: 6 }}>When a live call is not possible (a slow link, or nobody answers), record a message. It is held and delivered when the doctors are reachable.</Txt><VoiceRecorder to={recordTo} onSent={reload} /></View> : null}
    </Card>
  );
}
