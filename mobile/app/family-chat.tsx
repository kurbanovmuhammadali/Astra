import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import { ChatScreen } from '@/kit/Chat';
import type { ChatMsg } from '@/kit/Chat';

/** The astronaut's side of a family chat: videos, photos, voice and text. No calls. */
export default function FamilyChat() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return (
    <ChatScreen title={name ?? 'Family'} sub="Videos and messages · saved, sent in small pieces, played when opened" mineIs={0} target={{ type: 'family-me', contactId: Number(id) }}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/family'))}
      load={async after => (await api<{ messages: ChatMsg[] }>(`/api/me/family/${id}/messages?after=${after}`)).messages}
      mediaPath={m => `/api/me/family/${id}/messages/${m.id}/media`} emptyText="No messages yet. Send your first video or photo." />
  );
}
