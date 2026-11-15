import React from 'react';
import { PageHead, TopBar } from '@/kit/ui';
import { Page } from '@/kit/page';
import { VoiceInbox } from '@/kit/VoiceInbox';

/** Voice messages astronauts left for the doctors (store and forward). Reply from the astronaut's own page. */
export default function AdminVoice() {
  return (
    <Page title="Messages" maxWidth={760} header={<TopBar title="Messages" />}>
      <PageHead kicker="Delayed link" title="Messages" sub="Text, voice and video from astronauts. Far from Earth this replaces calls. Open the astronaut to reply." style={{ marginTop: 6 }} />
      <VoiceInbox title="From astronauts" />
    </Page>
  );
}
