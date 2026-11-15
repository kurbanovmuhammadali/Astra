import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Play, Trash2, FileText, Clock } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { Kicker, Pressy, Txt } from '@/kit/core';
import { Card, Tag } from '@/kit/ui';
import { api, API_URL } from '@/api';
import { useApi } from '@/useApi';
import { MessageComposer } from '@/kit/MessageComposer';

type Msg = { id: number; kind: 'text' | 'voice' | 'video'; text: string | null; seconds: number; urgent: boolean; at: string; arrivesAt: string; playedAt: string | null; fromName: string; toName: string | null; inTransit?: boolean };
const eta = (iso: string) => { const m = Math.max(0, Math.round((Date.parse(iso.replace(' ', 'T') + 'Z') - Date.now()) / 6e4)); return m < 1 ? 'any moment' : `${m} min`; };

/** Messages for a slow link: text, voice and video. Inbox plays them, outbox shows what is still in transit. */
export function VoiceInbox({ title = 'Messages', recordTo, delayMin = 0 }: { title?: string; recordTo?: 'doctors'; delayMin?: number }) {
  const { data, reload } = useApi<{ messages: Msg[]; unheard: number; outbox: Msg[] }>('/api/voicemail');
  const [open, setOpen] = useState<number | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => { const t = setInterval(reload, 30000); return () => { clearInterval(t); if (urlRef.current) URL.revokeObjectURL(urlRef.current); }; }, [reload]);
  const show = async (m: Msg) => {
    if (open === m.id) { setOpen(null); return; }
    setOpen(m.id); setSrc(null);
    try {
      if (m.kind === 'text') { await api(`/api/voicemail/${m.id}/heard`, { body: {} }); }
      else if (Platform.OS === 'web') {
        const r = await fetch(`${API_URL}/api/voicemail/${m.id}/media`, { credentials: 'include', headers: { 'X-Requested-With': 'perigee' } });
        if (r.ok) { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = URL.createObjectURL(await r.blob()); setSrc(urlRef.current); }
      }
      reload();
    } catch { /* offline */ }
  };
  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Kicker style={{ flex: 1 }}>{title}</Kicker>{data?.unheard ? <Tag label={`${data.unheard} new`} tone="flag" /> : null}</View>
      {(data?.messages ?? []).map(m => (
        <View key={m.id} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: K.hair }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressy label={`Open message from ${m.fromName}`} onPress={() => show(m)}><View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: open === m.id ? K.copper : K.copperTint, alignItems: 'center', justifyContent: 'center' }}>{m.kind === 'text' ? <FileText size={16} color={open === m.id ? '#fff' : K.copperInk} /> : <Play size={16} color={open === m.id ? '#fff' : K.copperInk} />}</View></Pressy>
            <View style={{ flex: 1 }}><Txt v="subM">{m.fromName}{m.playedAt ? '' : ' · new'}{m.urgent ? ' · URGENT' : ''}</Txt><Txt v="caption" color={K.ink3}>{m.kind === 'text' ? 'Text message' : `${m.kind === 'video' ? 'Video' : 'Voice'} · ${m.seconds}s`} · {m.at} UTC</Txt></View>
            <Pressy label="Delete message" onPress={async () => { await api(`/api/voicemail/${m.id}`, { method: 'DELETE' }).catch(() => {}); reload(); }}><Trash2 size={16} color={K.ink3} /></Pressy>
          </View>
          {open === m.id ? (m.kind === 'text' ? <Txt v="sub" style={{ marginTop: 8 }}>{m.text}</Txt> : src ? React.createElement(m.kind === 'video' ? 'video' : 'audio', { src, controls: true, autoPlay: true, playsInline: true, style: { width: '100%', maxHeight: 280, borderRadius: 12, marginTop: 8 } }) : <Txt v="caption" color={K.ink3} style={{ marginTop: 8 }}>Loading…</Txt>) : null}
        </View>
      ))}
      {data && !data.messages.length ? <Txt v="sub" color={K.ink2} style={{ marginTop: 8 }}>No messages.</Txt> : null}
      {(data?.outbox ?? []).some(m => m.inTransit) ? (
        <View style={{ marginTop: 12 }}>
          <Kicker color={K.ink2}>On its way</Kicker>
          {data!.outbox.filter(m => m.inTransit).map(m => <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}><Clock size={14} color={K.ink3} /><Txt v="caption" color={K.ink2} style={{ flex: 1 }}>{m.kind === 'text' ? (m.text ?? '').slice(0, 50) : m.kind === 'video' ? 'Video message' : 'Voice message'} · arrives in {eta(m.arrivesAt)}</Txt></View>)}
        </View>
      ) : null}
      {recordTo ? <View style={{ marginTop: 14 }}><Txt v="caption" color={K.ink2} style={{ marginBottom: 8 }}>Send a message to your doctors. Text, a voice recording or a short video all work without a live connection.</Txt><MessageComposer to={recordTo} onSent={reload} delayMin={delayMin} /></View> : null}
    </Card>
  );
}
