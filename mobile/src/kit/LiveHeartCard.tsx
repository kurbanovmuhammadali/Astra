/** TEMPORARY: live heart rate from a WHOOP strap through Bluetooth (see src/data/liveHr.ts). Display only, nothing is saved. Shown on /whoop-check. */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { Heart, Bluetooth } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { Kicker, Txt } from '@/kit/core';
import { Button, Card, Notice, Tag } from '@/kit/ui';
import { Spark } from '@/kit/charts';
import { connectLiveHr, liveHrSupported } from '@/data/liveHr';
import type { LiveHr } from '@/data/liveHr';

export function LiveHeartCard() {
  const [state, setState] = useState<'idle' | 'connecting' | 'live' | 'lost'>('idle');
  const [bpm, setBpm] = useState<number | null>(null), [series, setSeries] = useState<number[]>([]), [name, setName] = useState(''), [err, setErr] = useState<string | null>(null), [lastAt, setLastAt] = useState(0);
  const [rr, setRr] = useState<number | null>(null);
  const conn = useRef<LiveHr | null>(null), beat = useRef(new Animated.Value(0)).current;
  const supported = Platform.OS === 'web' && liveHrSupported();

  useEffect(() => () => conn.current?.stop(), []);
  useEffect(() => { // the heart pulses at the measured rate
    if (!bpm) return;
    const period = Math.max(300, 60000 / bpm);
    const loop = Animated.loop(Animated.sequence([Animated.timing(beat, { toValue: 1, duration: period * 0.25, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }), Animated.timing(beat, { toValue: 0, duration: period * 0.75, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' })]));
    loop.start(); return () => loop.stop();
  }, [bpm ? Math.round(bpm / 4) : 0]);

  const connect = async () => {
    setErr(null);
    try {
      conn.current?.stop(); setSeries([]); setBpm(null);
      conn.current = await connectLiveHr((b, r) => { setBpm(b); setLastAt(Date.now()); setSeries(s => [...s.slice(-59), b]); if (r.length) setRr(Math.round(r.reduce((a, c) => a + c, 0) / r.length)); }, setState);
      setName(conn.current.name);
    } catch (e: any) { setState('idle'); setErr(/cancel|chosen|NotFound/i.test(String(e?.name ?? e?.message)) ? 'No device was chosen.' : `Could not connect: ${e?.message ?? e}`); }
  };
  const disconnect = () => { conn.current?.stop(); conn.current = null; setState('idle'); };
  const vals = series.length ? series : [0];
  const min = series.length ? Math.min(...series) : null, max = series.length ? Math.max(...series) : null, avg = series.length ? Math.round(series.reduce((a, b) => a + b, 0) / series.length) : null;

  return (
    <View>
      {!supported ? <View style={{ marginTop: 14 }}><Notice tone="watch" title="This browser cannot read Bluetooth" body="Use Chrome or Edge on a computer or an Android phone, on https. iPhone Safari does not support Web Bluetooth." /></View> : null}

      <Card style={{ marginTop: 12, alignItems: 'center', paddingVertical: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Tag label={state === 'live' ? 'WHOOP · live' : state === 'connecting' ? 'Connecting…' : state === 'lost' ? 'Connection lost' : 'Not connected'} tone={state === 'live' ? 'ok' : state === 'lost' ? 'flag' : 'none'} />{name ? <Txt v="caption" color={K.ink3}>{name}</Txt> : null}</View>
        <Animated.View style={{ marginTop: 16, transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }] }}><Heart size={44} color={K.flag} fill={state === 'live' ? K.flag : 'transparent'} /></Animated.View>
        <Txt v="hero" style={{ fontSize: 72, lineHeight: 78, marginTop: 6 }}>{bpm ?? '—'}</Txt>
        <Txt v="mono" color={K.ink2} upper>beats per minute</Txt>
        {series.length > 1 ? <View style={{ marginTop: 14 }}><Spark values={vals} w={260} h={54} color={K.flag} /></View> : null}
        {series.length ? <View style={{ flexDirection: 'row', gap: 22, marginTop: 14 }}>{[['min', min], ['avg', avg], ['max', max]].map(([l, v]) => <View key={String(l)} style={{ alignItems: 'center' }}><Txt v="title">{String(v)}</Txt><Txt v="caption" color={K.ink3}>{String(l)}</Txt></View>)}{rr ? <View style={{ alignItems: 'center' }}><Txt v="title">{rr}</Txt><Txt v="caption" color={K.ink3}>RR ms</Txt></View> : null}</View> : null}
        {state === 'live' && lastAt && Date.now() - lastAt > 6000 ? <Txt v="caption" color={K.flag} style={{ marginTop: 10 }}>No new beat for a few seconds: check the strap fits snugly.</Txt> : null}
        <View style={{ marginTop: 18, width: '100%' }}>{state === 'live' || state === 'connecting' ? <Button kind="secondary" title="Disconnect" onPress={disconnect} /> : <Button icon={Bluetooth} title={state === 'lost' ? 'Reconnect' : 'Connect to WHOOP'} disabled={!supported} onPress={connect} />}</View>
        {err ? <Txt v="caption" color={K.flag} center style={{ marginTop: 10 }}>{err}</Txt> : null}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Kicker>How to test</Kicker>
        <Txt v="sub" color={K.ink2} style={{ marginTop: 6, lineHeight: 21 }}>1. In the WHOOP app, turn on Heart Rate Broadcast (in the app or device settings; the name can differ by version). The strap then shares its heart rate over Bluetooth.</Txt>
        <Txt v="sub" color={K.ink2} style={{ marginTop: 6, lineHeight: 21 }}>2. Open this page in Chrome or Edge, press "Connect to WHOOP" and pick your strap (it is listed as WHOOP followed by a number).</Txt>
        <Txt v="sub" color={K.ink2} style={{ marginTop: 6, lineHeight: 21 }}>3. The number should match the one in the WHOOP app within a beat or two. WHOOP's cloud API has no live heart rate, so this is the only way to see it live.</Txt>
      </Card>
    </View>
  );
}
