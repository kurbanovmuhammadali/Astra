import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/auth';
import { Loading } from '@/ui';
import { getFlag } from '@/storage';

export default function Index() {
  const { user, ready } = useAuth();
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  useEffect(() => { getFlag('introSeen').then(setIntroSeen); }, []);
  if (!ready || introSeen === null) return <Loading />;
  if (user) return <Redirect href="/today" />;
  return <Redirect href={introSeen ? '/welcome' : '/intro'} />;
}
