import React, { useState } from 'react';
import { Animated, Image, ImageBackground, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Activity, ArrowRight, ChevronRight, HeartPulse, Moon, Radiation, Timer, Waves, NotebookPen, Play } from 'lucide-react-native';
import { useAuth } from '@/auth';
import { AstraLogo, Floaty, IMG, RATIO } from '@/astra';
import { ELEV, K, RAD } from '@/kit/tokens';
import { Kicker, Pressy, Rise, Swap, Txt, useLayout, useLoop, useTween } from '@/kit/core';
import { Card, Dot, IconBubble, Notice, SectionHead, Skeleton, Stepper, Tag } from '@/kit/ui';
import { Spark } from '@/kit/charts';
import { Cols, Page } from '@/kit/page';
import { fmtSleep, useCrew } from '@/data/crew';
import { TODAY_SESSION, doneToday, sessionById } from '@/data/training';
import { useStore } from '@/data/store';

const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

function Metric({ icon, label, value, fmt, source, spark, onPress, i }: { icon: any; label: string; value: number | null; fmt: (v: number) => string; source: string; spark: (number | null)[]; onPress: () => void; i: number }) {
  const v = useTween(value ?? 0, 1000);
  return (
    <Rise i={i} style={{ flex: 1, minWidth: 0 }}>
      <Card pad={12} onPress={onPress} label={`${label} ${value == null ? 'no data' : fmt(value)}`} style={{ minHeight: 112 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt v="caption" color={K.ink2} numberOfLines={1} style={{ flex: 1 }}>{label}</Txt>
          {React.createElement(icon, { size: 13, color: K.copper, strokeWidth: 2 })}
        </View>
        <Txt v="num" tabular numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 6, fontSize: 21, lineHeight: 25 }}>{value == null ? '—' : fmt(v)}</Txt>
        <View style={{ marginTop: 'auto', paddingTop: 8 }}>
          <Spark values={spark} w={84} h={20} />
          <Txt v="mono" color={K.ink3} style={{ fontSize: 9, marginTop: 4 }} upper numberOfLines={1}>{source}</Txt>
        </View>
      </Card>
    </Rise>
  );
}

function BodyArt({ size }: { size: number }) {
  const spin = useLoop(14000);
  return (
    <Pressy label="Open body explorer" onPress={() => router.navigate('/body')} to={0.98}>
      <View style={{ alignItems: 'center', height: size * 0.92, justifyContent: 'center' }}>
        <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size * 0.92, height: size * 0.92, borderRadius: size, borderWidth: 1, borderColor: 'rgba(184,105,63,0.18)', borderStyle: 'dashed',
          transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }} />
        <View pointerEvents="none" style={{ position: 'absolute', width: size * 0.64, height: size * 0.64, borderRadius: size, backgroundColor: 'rgba(241,205,182,0.45)' }} />
        <Floaty amp={6} rotate={0} dur={4200}>
          <Image source={IMG.body} style={{ width: size, height: size / RATIO.body }} resizeMode="contain" accessibilityIgnoresInvertColors />
        </Floaty>
        <View style={{ position: 'absolute', right: 4, bottom: size * 0.1 }}>
          <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: K.cardSolid, borderRadius: 16, paddingHorizontal: 12, height: 32, borderWidth: 1, borderColor: K.hair2 }, ELEV.card]}>
            <Txt v="subM">Body explorer</Txt><ArrowRight size={14} color={K.copper} />
          </View>
        </View>
      </View>
    </Pressy>
  );
}

export default function Home() {
  const { user } = useAuth();
  const crew = useCrew();
  const { wide, w, sidebar } = useLayout();
  const [idx, setIdx] = useState(6);
  const dir = React.useRef(0);
  useStore(s => s.completed); // refresh when a workout is completed
  const d = crew.days[idx];
  const today = idx === 6;
  const name = user?.name.split(' ')[0] ?? 'crew';
  const session = sessionById(TODAY_SESSION);
  const sessionDone = doneToday(session.id);
  const red = crew.alerts.filter(a => a.level === 'red');
  const go = (n: number) => { dir.current = n; setIdx(i => Math.max(0, Math.min(6, i + n))); };
  const sl = (k: keyof typeof crew.series) => crew.series[k].slice(0, idx + 1);
  const src = (s: string, dev = 'WHOOP') => (s === 'sample' ? `${dev} · sample` : s);
  const bust = wide ? 420 : Math.min(w * 0.74, 330);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {sidebar ? <Txt v="headline">Home</Txt> : <AstraLogo size={16} />}
      <Tag label={`Day ${crew.missionDay} / ${crew.duration}`} onPress={() => router.push('/profile/mission')} />
    </View>
  );

  const metrics = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: wide ? 26 : 4, marginBottom: 10 }}>
        <Txt v="headline">Health snapshot</Txt>
        <Pressy label="7-day trends" onPress={() => router.push('/signals')}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Txt v="caption" color={K.copperInk} style={{ fontFamily: 'Geist_500Medium' }}>7-day trends</Txt><ChevronRight size={13} color={K.copperInk} /></View>
        </Pressy>
      </View>
      {crew.loading ? (
        <View style={{ gap: 8 }}>{[0, 1].map(r => <View key={r} style={{ flexDirection: 'row', gap: 8 }}>{[0, 1, 2].map(c => <View key={c} style={{ flex: 1 }}><Skeleton h={112} r={RAD.m} /></View>)}</View>)}</View>
      ) : (
        <Swap k={idx} dir={dir.current}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Metric i={0} icon={Activity} label="Recovery" value={d.recovery} fmt={v => `${Math.round(v)}%`} source={src(crew.source.recovery)} spark={sl('recovery')} onPress={() => router.push('/metric/recovery')} />
            <Metric i={1} icon={Moon} label="Sleep" value={d.sleep} fmt={fmtSleep} source={src(crew.source.sleep)} spark={sl('sleep')} onPress={() => router.push('/metric/sleep')} />
            <Metric i={2} icon={Waves} label="HRV" value={d.hrv} fmt={v => `${Math.round(v)} ms`} source={src(crew.source.hrv)} spark={sl('hrv')} onPress={() => router.push('/metric/hrv')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Metric i={3} icon={HeartPulse} label="Resting HR" value={d.rhr} fmt={v => `${Math.round(v)} bpm`} source={src(crew.source.rhr)} spark={sl('rhr')} onPress={() => router.push('/metric/rhr')} />
            <Metric i={4} icon={Activity} label="Workout HR" value={d.workoutHr} fmt={v => `${Math.round(v)} bpm`} source="Apple Health · sample" spark={sl('workoutHr')} onPress={() => router.navigate('/plan')} />
            <Metric i={5} icon={Timer} label="Workout" value={d.workoutMin} fmt={v => `${Math.round(v)} min`} source="Apple Health · sample" spark={sl('workoutMin')} onPress={() => router.navigate('/plan')} />
          </View>
        </Swap>
      )}
    </View>
  );

  const dose = (
    <Card onPress={() => router.push('/signals')} label="Radiation exposure" pad={14} style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBubble icon={Radiation} size={36} />
        <View style={{ flex: 1 }}>
          <Txt v="subM">Radiation exposure</Txt>
          <Txt v="caption" color={K.ink2}>Mission to date · personal dosimeter</Txt>
        </View>
        <Txt v="headline" tabular>{crew.doseTotal.toFixed(1)} <Txt v="caption" color={K.ink2}>mSv</Txt></Txt>
        <ChevronRight size={16} color={K.ink3} />
      </View>
    </Card>
  );

  const focus = (
    <View>
      <SectionHead kicker="Mission routine" title="In focus" action="Training" onAction={() => router.navigate('/plan')} />
      <View style={{ flexDirection: wide ? 'column' : 'row', gap: 10 }}>
        <Pressy label={`Today's session ${session.title}`} onPress={() => router.push(`/training/${session.id}`)} style={{ flex: 1.3 }} to={0.975}>
          <View style={[{ borderRadius: RAD.m, overflow: 'hidden', height: 168 }, ELEV.card]}>
            <ImageBackground source={session.img} style={{ flex: 1 }} resizeMode="cover">
              <LinearGradient colors={['rgba(28,18,13,0.05)', 'rgba(28,18,13,0.78)']} style={{ flex: 1, padding: 14, justifyContent: 'flex-end' }}>
                <Kicker color="#F3D9C6">{sessionDone ? 'Completed today' : 'Today’s session'}</Kicker>
                <Txt v="title" color="#fff" style={{ marginTop: 3, fontSize: 20 }}>{session.title}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <Txt v="caption" color="rgba(255,255,255,0.8)">{session.device} · {session.minutes} min</Txt>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Play size={13} color={K.copper} fill={K.copper} /></View>
                </View>
              </LinearGradient>
            </ImageBackground>
          </View>
        </Pressy>
        <Card onPress={() => router.push('/checkin')} label="Crew check-in" style={{ flex: 1, minHeight: wide ? 0 : 168, justifyContent: 'space-between' }}>
          <IconBubble icon={NotebookPen} />
          <View style={{ marginTop: 14 }}>
            <Txt v="headline">Crew check-in</Txt>
            <Txt v="caption" color={K.ink2} style={{ marginTop: 3 }}>Sleep, energy, symptoms and notes · 1 min</Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}><Txt v="subM" color={K.copperInk}>Log how you feel</Txt><ArrowRight size={14} color={K.copperInk} /></View>
        </Card>
      </View>
    </View>
  );

  return (
    <Page tabs title="Home" header={header} onRefresh={crew.reload}>
      <Stepper label={d.label} onPrev={() => go(-1)} onNext={() => go(1)} prevDisabled={idx === 0} nextDisabled={today} style={{ marginTop: 8 }} />
      <Cols ratio={[1.1, 1]} gap={36}>
        <View>
          <Swap k={today ? 'today' : 'past'}>
            <View style={{ marginTop: 22 }}>
              <Kicker>{today ? `Daily overview · mission day ${crew.missionDay}` : `Mission day ${crew.missionDay - (6 - idx)} · look back`}</Kicker>
              <Txt v="hero" style={{ marginTop: 8 }}>{today ? `${greeting()},` : 'Daily overview,'}</Txt>
              <Txt v="hero" color={K.copper}>{today ? `${name}.` : `${d.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`}</Txt>
            </View>
          </Swap>
          {!wide ? <BodyArt size={bust} /> : null}
          {metrics}
          {dose}
          {red.map((a, i) => <View key={i} style={{ marginTop: 10 }}><Notice tone="flag" title={a.title} body={a.body} /></View>)}
        </View>
        <View>
          {wide ? <BodyArt size={bust} /> : null}
          {focus}
        </View>
      </Cols>
      {crew.isSample ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22 }}>
          <Dot tone="watch" size={6} /><Txt v="caption" color={K.ink3}>Sample data · connect WHOOP in Profile to see yours</Txt>
        </View>
      ) : null}
    </Page>
  );
}

