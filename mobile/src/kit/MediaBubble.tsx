import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Image as ImageIcon, Play } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { Pressy, Txt } from '@/kit/core';
import { API_URL } from '@/api';

/** A received voice message, video or photo. It is fetched only when opened, so a slow link is not used for things nobody looks at. */
export function MediaBubble({ path, kind, seconds, caption, dark }: { path: string; kind: 'voice' | 'video' | 'photo'; seconds?: number; caption?: string | null; dark?: boolean }) {
  const [src, setSrc] = useState<string | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState(false);
  const ref = useRef<string | null>(null);
  useEffect(() => () => { if (ref.current) URL.revokeObjectURL(ref.current); }, []);
  const ink = dark ? '#fff' : K.ink;
  const open = async () => {
    if (Platform.OS !== 'web') return;
    setBusy(true); setErr(false);
    try {
      const r = await fetch(API_URL + path, { credentials: 'include', headers: { 'X-Requested-With': 'perigee' } });
      if (!r.ok) throw new Error('x');
      if (ref.current) URL.revokeObjectURL(ref.current); ref.current = URL.createObjectURL(await r.blob()); setSrc(ref.current);
    } catch { setErr(true); } finally { setBusy(false); }
  };
  const style = { width: '100%', maxHeight: 280, borderRadius: 12, marginTop: 6, backgroundColor: '#000' } as any;
  return (
    <View style={{ minWidth: 200 }}>
      {src ? React.createElement(kind === 'photo' ? 'img' : kind === 'video' ? 'video' : 'audio', { src, controls: kind !== 'photo', autoPlay: kind !== 'photo', playsInline: true, style: kind === 'photo' ? { ...style, objectFit: 'contain' } : style }) : (
        <Pressy label={`Open ${kind}`} onPress={open}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: dark ? 'rgba(255,255,255,0.18)' : K.copperTint, alignItems: 'center', justifyContent: 'center' }}>{kind === 'photo' ? <ImageIcon size={15} color={ink} /> : <Play size={15} color={ink} />}</View>
            <Txt v="subM" color={ink}>{busy ? 'Loading…' : kind === 'photo' ? 'Open photo' : kind === 'video' ? `Play video${seconds ? ` · ${seconds}s` : ''}` : `Play voice message${seconds ? ` · ${seconds}s` : ''}`}</Txt>
          </View>
        </Pressy>
      )}
      {err ? <Txt v="caption" color="#F2A08C">Not available (it may have been removed).</Txt> : null}
      {caption ? <Txt v="sub" color={ink} style={{ marginTop: 4 }}>{caption}</Txt> : null}
    </View>
  );
}
