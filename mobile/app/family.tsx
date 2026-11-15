import React, { useState } from 'react';
import { View } from 'react-native';
import { MessageCircle, RefreshCw, Trash2 } from 'lucide-react-native';
import { router } from 'expo-router';
import { K } from '@/kit/tokens';
import { Kicker, Pressy, Txt } from '@/kit/core';
import { Button, Card, Chip, Notice, PageHead, Sheet, TopBar, toast } from '@/kit/ui';
import { Page } from '@/kit/page';
import { Field } from '@/kit/fields';
import { api } from '@/api';
import { useApi } from '@/useApi';

type Contact = { id: number; name: string; relation: string; code: string; codeExpires: string; unread: number };
const REL = ['Mother', 'Father', 'Wife / husband', 'Child', 'Sibling', 'Friend'];

/** Family: video, photo and text messages through a private link. No calls: from space they would be pointless (the signal needs minutes). */
export default function Family() {
  const { data, reload } = useApi<{ family: Contact[] }>('/api/me/family');
  const [name, setName] = useState(''), [rel, setRel] = useState(REL[0]), [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Contact | null>(null);
  const family = data?.family ?? [];

  const newCode = async (c: Contact, signOutDevices: boolean) => { try { await api(`/api/me/family/${c.id}/code`, { body: { signOutDevices } }); toast(signOutDevices ? 'New code. Their devices are signed out.' : 'New code. The old one no longer works.'); reload(); } catch (e: any) { toast(e.message); } };
  const add = async () => { setBusy(true); try { const r = await api<{ contact: Contact }>('/api/me/family', { body: { name, relation: rel } }); setName(''); setAdded(r.contact); reload(); } catch (e: any) { toast(e.message); } finally { setBusy(false); } };
  const openChat = (c: Contact) => router.push({ pathname: '/family-chat', params: { id: String(c.id), name: c.name } });
  const codeCard = (c: Contact) => (
    <View style={{ marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: K.copperTint }}>
      <Kicker color={K.copperInk}>Family code</Kicker>
      <Txt v="hero" style={{ fontSize: 34, letterSpacing: 5, marginTop: 4 }} selectable>{c.code}</Txt>
      <Txt v="caption" color={K.ink2} style={{ marginTop: 4, lineHeight: 17 }}>Read it to {c.name}. They open celestasoft.health, press "I'm a relative" and type it. Valid until {c.codeExpires}.</Txt>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button small kind="secondary" icon={RefreshCw} title="New code" onPress={() => newCode(c, false)} />
        <Button small kind="secondary" title="Sign out their devices" onPress={() => newCode(c, true)} />
      </View>
    </View>
  );

  return (
    <Page title="Family" maxWidth={640} onRefresh={reload} header={<TopBar title="Family and friends" />}>
      <PageHead kicker="Stay close" title="Messages home" sub="Send your family videos, photos and messages. They sign in with a short code, on any phone, with no app and no account, and answer the same way." style={{ marginTop: 6 }} />

      {family.map(c => (
        <Card key={c.id} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}><Txt v="headline">{c.name}</Txt><Txt v="caption" color={K.ink2}>{c.relation || 'Family'}</Txt></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}><Button small icon={MessageCircle} title={c.unread ? `Open chat · ${c.unread} new` : 'Open chat'} onPress={() => openChat(c)} /></View>
            <Pressy label={`Remove ${c.name}`} onPress={async () => { await api(`/api/me/family/${c.id}`, { method: 'DELETE' }); reload(); }}><View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={17} color={K.flag} /></View></Pressy>
          </View>
          {codeCard(c)}
        </Card>
      ))}

      <Card style={{ marginTop: 12 }}>
        <Kicker>Add someone</Kicker>
        <Field label="Name" value={name} onChange={setName} keyboard="default" placeholder="Mom" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{REL.map(r => <Chip key={r} label={r} on={rel === r} onPress={() => setRel(r)} />)}</View>
        <View style={{ marginTop: 14 }}><Button title="Add and get code" disabled={name.trim().length < 2} loading={busy} onPress={add} /></View>
      </Card>
      <View style={{ marginTop: 12 }}><Notice tone="watch" title="Why no calls" body="From far away the signal needs minutes to cross, so a call would only echo. Messages and videos are saved, sent in small pieces over the long link, and played when your family is ready." /></View>

      <Sheet open={!!added} onClose={() => setAdded(null)} kicker="Added" title={added ? `${added.name} is added` : ''}>
        <Txt v="sub" color={K.ink2}>Give them this code, by voice or by writing it down. Whoever has it can message you, so only tell it to them.</Txt>
        {added ? codeCard(added) : null}
      </Sheet>
    </Page>
  );
}
