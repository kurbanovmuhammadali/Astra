import React, { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { Send } from 'lucide-react-native';
import { useApi } from '@/useApi';
import { C } from '@/theme';
import { Button, Card, Header, Loading, Notice, Screen, T } from '@/ui';

export default function Report() {
  const { data } = useApi<{ text: string }>('/api/report');
  const [done, setDone] = useState<string | null>(null);
  const send = async () => {
    if (!data) return;
    if (Platform.OS === 'web') {
      try { await navigator.clipboard.writeText(data.text); setDone('Copied. Paste it into your mission’s private medical channel.'); } catch { setDone('Select the text below and copy it.'); }
    } else {
      const r = await Share.share({ title: 'Perigee crew health report', message: data.text });
      if (r.action === Share.sharedAction) setDone('Report handed to the share sheet.');
    }
  };
  return (
    <Screen bottomSpace={40}>
      <View style={{ maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <Header title="Flight surgeon report" back sub="Store-and-forward: works even with comms delay" />
        <Notice kind="info" title="You stay in control" body="Nothing is sent automatically. Review the summary, then share it through your mission’s private medical channel." />
        {done ? <Notice kind="green" title={done} /> : null}
        {!data ? <Loading /> : (
          <Card>
            <T size={12} color={C.ink2} style={{ fontFamily: Platform.select({ ios: 'Menlo', web: 'ui-monospace, Menlo, monospace', default: 'monospace' }), lineHeight: 19 }} selectable>{data.text}</T>
          </Card>
        )}
        <Button title={Platform.OS === 'web' ? 'Copy report' : 'Send report'} kind="coral" icon={<Send size={18} color="#fff" />} onPress={send} style={{ marginTop: 16 }} />
      </View>
    </Screen>
  );
}
