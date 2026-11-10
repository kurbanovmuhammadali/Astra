import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Pause, Play, SkipBack, SkipForward, Radio } from 'lucide-react-native';
import { useApi } from '@/useApi';
import { A } from '@/theme';
import { T } from '@/ui';
import { shadowSoft } from '@/astra';
import { useReplay } from '@/replay';

type Scenario = { active: boolean; title: string; blurb: string; days: number; start?: string; end?: string; truthLabel?: string; idleText?: string; playFrom?: number; step?: number; events?: { id: string; label: string; day: number; metric: string }[] };
const DAY = 864e5;

/**
 * Scrub 120 days of a scripted Mars-transit mission. Four problems are hidden in the data; watch Astra's alerts,
 * body map and plan react as the days pass. The "ground truth" list reveals when each problem actually began.
 */
export default function ReplayBar() {
  const { data } = useApi<Scenario>('/api/scenario');
  const { setAsOf } = useReplay();
  const [day, setDay] = useState<number | null>(null); // null = live (last day)
  const [playing, setPlaying] = useState(false);
  const [w, setW] = useState(0);
  const track = useRef<View>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const last = (data?.days ?? 1) - 1;
  const apply = useCallback((d: number | null) => {
    setDay(d);
    if (!data?.start || d == null || !Number.isFinite(d) || d >= last) { setAsOf(null); return; }
    setAsOf(new Date(new Date(data.start).getTime() + (d + 1) * DAY - 60_000).toISOString()); // end of that day
  }, [data?.start, last, setAsOf]);

  useEffect(() => () => { setAsOf(null); if (timer.current) clearInterval(timer.current); }, [setAsOf]);
  useEffect(() => {
    if (!playing) { if (timer.current) clearInterval(timer.current); return; }
    timer.current = setInterval(() => {
      setDay(prev => {
        const step = data?.step ?? 1;
        const next = (prev ?? last) >= last ? (data?.playFrom ?? 20) : Math.min(last, (prev ?? 0) + step);
        apply(next);
        if (next >= last) setPlaying(false);
        return next;
      });
    }, 650);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, apply, last, data?.step, data?.playFrom]);

  if (!data?.active) return null;
  const cur = day ?? last;
  const pct = cur / last;
  const past = (data.events ?? []).filter(e => e.day <= cur);

  return (
    <View style={[{ backgroundColor: '#1C120D', borderRadius: 24, padding: 16, marginTop: 14 }, shadowSoft]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Radio size={15} color={A.copperSoft} />
          <T size={12} weight="sb" color={A.copperSoft} numberOfLines={1} style={{ flexShrink: 1 }}>{data.title.toUpperCase()}</T>
        </View>
        <T size={12} weight="m" color="#fff" numberOfLines={1} style={{ marginLeft: 8 }}>Day {cur + 1}/{data.days}</T>
      </View>

      <Pressable ref={track as any} accessibilityRole="adjustable" accessibilityLabel="Mission day" onLayout={e => setW(e.nativeEvent.layout.width)}
        onPress={e => {
          setPlaying(false);
          const n: any = e.nativeEvent;
          const px: number | undefined = n.pageX ?? n.clientX;
          track.current?.measureInWindow((x: number, _y: number, width: number) => {
            const frac = px != null && width ? (px - x) / width : (n.locationX ?? 0) / (w || 1);
            if (Number.isFinite(frac)) apply(Math.round(Math.max(0, Math.min(1, frac)) * last));
          });
        }}
        style={{ height: 34, justifyContent: 'center', marginTop: 10 }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' }}>
          <View style={{ width: `${pct * 100}%`, height: 6, borderRadius: 3, backgroundColor: A.copper }} />
        </View>
        {(data.events ?? []).map(ev => (
          <View key={ev.id} style={{ position: 'absolute', left: `${(ev.day / last) * 100}%`, top: 4, width: 2, height: 26, backgroundColor: ev.day <= cur ? '#F4B183' : 'rgba(255,255,255,0.25)' }} />
        ))}
        <View style={{ position: 'absolute', left: `${pct * 100}%`, marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', borderWidth: 3, borderColor: A.copper }} />
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Btn label="Back 7 days" onPress={() => { setPlaying(false); apply(Math.max(0, cur - 7)); }}><SkipBack size={16} color="#fff" /></Btn>
        <Btn label={playing ? 'Pause replay' : 'Play replay'} big onPress={() => { if (!playing && cur >= last) apply(data.playFrom ?? 20); setPlaying(p => !p); }}>
          {playing ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" />}
        </Btn>
        <Btn label="Forward 7 days" onPress={() => { setPlaying(false); apply(Math.min(last, cur + 7)); }}><SkipForward size={16} color="#fff" /></Btn>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" onPress={() => { setPlaying(false); apply(null); }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: cur >= last ? 'rgba(255,255,255,0.12)' : A.copper }}>
          <T size={12.5} weight="m" color="#fff">Live</T>
        </Pressable>
      </View>

      <T size={11.5} color="rgba(255,255,255,0.6)" style={{ marginTop: 10, lineHeight: 16 }}>
        {past.length ? `${data.truthLabel ?? 'Ground truth so far'}: ${past.map(e => `${e.label} (day ${e.day + 1})`).join(' · ')}` : (data.idleText ?? 'Nothing is wrong yet. Press play and watch what Astra notices.')}
      </T>
    </View>
  );
}

function Btn({ children, onPress, label, big }: { children: React.ReactNode; onPress: () => void; label: string; big?: boolean }) {
  const s = big ? 42 : 34;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: big ? A.copper : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </Pressable>
  );
}
