import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { K, ELEV } from '@/kit/tokens';
import { Pressy, Txt } from '@/kit/core';
import { Button } from '@/kit/ui';
import { useAuth } from '@/auth';

const WHO = (email: string) => /^doctor/i.test(email) ? 'the demo flight surgeon (Dr. Elena Voss)' : /^leader/i.test(email) ? 'the demo team leader (Cmdr. Volkova)' : /^mira/i.test(email) ? 'the demo ISS astronaut (Mira Okafor, live calls)' : 'the demo astronaut (Alex Morgan, on a Mars mission: messages and video only)';
const key = (email: string) => `celeste.demoGuide.${email}`;

/** Shown to judges who are inside a demo account: where the other parts of Celeste are and how to reach them. */
export function DemoGuide() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!user?.demo) { setOpen(false); return; }
    try { setOpen(typeof sessionStorage === 'undefined' || !sessionStorage.getItem(key(user.email))); } catch { setOpen(true); }
  }, [user?.email]);
  if (!open || !user?.demo) return null;
  const close = () => { try { sessionStorage.setItem(key(user.email), '1'); } catch { /* ignore */ } setOpen(false); };
  return (
    <View style={[{ position: 'absolute', left: 14, bottom: 14, maxWidth: 400, width: '92%', zIndex: 6000, padding: 16, borderRadius: 20, backgroundColor: K.cardSolid, borderWidth: 1, borderColor: K.hair }, ELEV.float] as any}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt v="mono" color={K.copperInk} upper style={{ flex: 1 }}>Demo tour</Txt>
        <Pressy label="Close" onPress={close}><X size={18} color={K.ink3} /></Pressy>
      </View>
      <Txt v="headline" style={{ marginTop: 6 }}>You are looking at {WHO(user.email)}</Txt>
      <Txt v="sub" color={K.ink2} style={{ marginTop: 8, lineHeight: 21 }}>Celeste has more parts than this one: the doctor portal, the team leader overview, an astronaut on the ISS with live calls, and the relatives' side. To visit them, sign out, go to the Welcome page, press Log in, and tap the demo account you want, for example Demo doctor. Everything is ready, no registration.</Txt>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <View style={{ flex: 1 }}><Button small title="Take me to Welcome" onPress={async () => { close(); await logout(); router.replace('/welcome'); }} /></View>
        <Button small kind="secondary" title="Got it" onPress={close} />
      </View>
    </View>
  );
}
