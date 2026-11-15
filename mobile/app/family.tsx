import React, { useState } from 'react';
import { View } from 'react-native';
import { Share2, Trash2 } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { Kicker, Pressy, Txt } from '@/kit/core';
import { Button, Card, Chip, Notice, PageHead, Sheet, TopBar, toast } from '@/kit/ui';
import { Page } from '@/kit/page';
import { Field } from '@/kit/fields';
import { api } from '@/api';
import { useApi } from '@/useApi';
import { MessageComposer } from '@/kit/MessageComposer';
import { MediaBubble } from '@/kit/MediaBubble';

type Contact = { id: number; name: string; relation: string; token: string; unread: number };
type Msg = { id: number; fromFamily: number; text: string; kind: 'text' | 'voice' | 'video' | 'photo'; seconds: number; hasMedia: number; at: string };
const REL = ['Mother', 'Father', 'Wife / husband', 'Child', 'Sibling', 'Friend'];
const link = (t: string) => `${typeof location !== 'undefined' ? location.origin : ''}/f/${t}`;
const text = (c: Contact) => `Hi ${c.name}! Open this private link to send me a message, a video or a photo, and to see mine: ${link(c.token)}`;
const copy = (t: string) => { try { (navigator as any).clipboard?.writeText(t); toast('Link copied'); } catch { toast(t); } };

/** Family: video, photo and text messages through a private link. No calls: from space they would be pointless (the signal needs minutes). */
export default function Family() {
  const { data, reload } = useApi<{ family: Contact[] }>('/api/me/family');
  const [name, setName] = useState(''), [rel, setRel] = useState(REL[0]), [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Contact | null>(null), [chat, setChat] = useState<Contact | null>(null), [msgs, setMsgs] = useState<Msg[]>([]);
  const family = data?.family ?? [];

  const add = async () => { setBusy(true); try { const r = await api<{ contact: Contact }>('/api/me/family', { body: { name, relation: rel } }); setName(''); setAdded(r.contact); reload(); } catch (e: any) { toast(e.message); } finally { setBusy(false); } };
  const loadChat = async (c: Contact) => setMsgs((await api<{ messages: Msg[] }>(`/api/me/family/${c.id}/messages`)).messages);
  const openChat = async (c: Contact) => { setChat(c); await loadChat(c); reload(); };
  const shareBtns = (c: Contact) => (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <Button small icon={Share2} title="WhatsApp" onPress={() => window.open(`https://wa.me/?text=${encodeURIComponent(text(c))}`, '_blank')} />
      <Button small kind="secondary" title="Telegram" onPress={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(link(c.token))}&text=${encodeURIComponent(`Hi ${c.name}! Send me a message or a video from here:`)}`, '_blank')} />
      <Button small kind="secondary" title="Copy link" onPress={() => copy(text(c))} />
    </View>
  );

  return (
    <Page title="Family" maxWidth={640} onRefresh={reload} header={<TopBar title="Family and friends" />}>
      <PageHead kicker="Stay close" title="Messages home" sub="Send your family videos, photos and messages. They open a private link on any phone, no app and no account, and answer the same way." style={{ marginTop: 6 }} />

      {family.map(c => (
        <Card key={c.id} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}><Txt v="headline">{c.name}</Txt><Txt v="caption" color={K.ink2}>{c.relation || 'Family'}</Txt></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}><Button small title={c.unread ? `Open messages (${c.unread} new)` : 'Open messages'} onPress={() => openChat(c)} /></View>
            <Pressy label={`Remove ${c.name}`} onPress={async () => { await api(`/api/me/family/${c.id}`, { method: 'DELETE' }); reload(); }}><View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={17} color={K.flag} /></View></Pressy>
          </View>
          {shareBtns(c)}
        </Card>
      ))}

      <Card style={{ marginTop: 12 }}>
        <Kicker>Add someone</Kicker>
        <Field label="Name" value={name} onChange={setName} keyboard="default" placeholder="Mom" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{REL.map(r => <Chip key={r} label={r} on={rel === r} onPress={() => setRel(r)} />)}</View>
        <View style={{ marginTop: 14 }}><Button title="Add and get link" disabled={name.trim().length < 2} loading={busy} onPress={add} /></View>
      </Card>
      <View style={{ marginTop: 12 }}><Notice tone="watch" title="Why no calls" body="From far away the signal needs minutes to cross, so a call would only echo. Messages and videos are saved, sent in small pieces over the long link, and played when your family is ready." /></View>

      <Sheet open={!!added} onClose={() => setAdded(null)} kicker="Added" title={added ? `${added.name} is added` : ''}>
        <Txt v="sub" color={K.ink2}>Send them this private link. Whoever has it can message you, so only share it with them.</Txt>
        {added ? shareBtns(added) : null}
      </Sheet>
      <Sheet open={!!chat} onClose={() => setChat(null)} kicker="Messages" title={chat?.name ?? ''}>
        <View style={{ gap: 8, maxHeight: 340 }}>
          {msgs.length ? msgs.map(m => (
            <View key={m.id} style={{ alignSelf: m.fromFamily ? 'flex-start' : 'flex-end', maxWidth: '88%', backgroundColor: m.fromFamily ? K.cardSunk : K.copper, borderRadius: 14, padding: 10 }}>
              {m.kind === 'text' ? <Txt v="sub" color={m.fromFamily ? K.ink : '#fff'}>{m.text}</Txt> : m.hasMedia ? <MediaBubble path={`/api/me/family/${chat!.id}/messages/${m.id}/media`} kind={m.kind} seconds={m.seconds} caption={m.text} dark={!m.fromFamily} /> : <Txt v="caption" color={m.fromFamily ? K.ink3 : '#fff'}>The recording was removed after 14 days.</Txt>}
              <Txt v="caption" color={m.fromFamily ? K.ink3 : 'rgba(255,255,255,0.7)'} style={{ marginTop: 2 }}>{m.at} UTC</Txt>
            </View>
          )) : <Txt v="sub" color={K.ink2}>No messages yet.</Txt>}
        </View>
        <View style={{ marginTop: 14 }}>{chat ? <MessageComposer target={{ type: 'family-me', contactId: chat.id }} onSent={() => setTimeout(() => chat && loadChat(chat), 1500)} /> : null}</View>
      </Sheet>
    </Page>
  );
}
