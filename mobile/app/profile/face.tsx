import React from 'react';
import { router } from 'expo-router';
import { PageHead, TopBar } from '@/kit/ui';
import { Page } from '@/kit/page';
import FaceScan from '@/FaceScan';
import { goBack } from '@/kit/transition';

export default function ProfileFace() {
  return (
    <Page title="Face scan" maxWidth={560} header={<TopBar title="Face scan" />}>
      <PageHead kicker="Crew recognition" title="Face scan" sub="Lets the camera form check tell you apart from your crewmates. Stored only on this device." style={{ marginTop: 6 }} />
      <FaceScan onDone={() => goBack('/profile')} />
    </Page>
  );
}
