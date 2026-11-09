import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, SlidersHorizontal } from 'lucide-react-native';
import { K } from '@/kit/tokens';
import { Kicker, Rise, Txt, useLayout, useTween } from '@/kit/core';
import { Button, Card, ListGroup, ListRow, PageHead, Tag } from '@/kit/ui';
import { HeatGrid } from '@/kit/charts';
import { Cols, Page } from '@/kit/page';
import { SessionHero } from '@/kit/training';
import { TODAY_SESSION, doneToday, frequency, sessionById, week } from '@/data/training';
import { useStore } from '@/data/store';
import { useCrew } from '@/data/crew';

function DayBox({ d, i }: { d: ReturnType<typeof week>[number]; i: number }) {
  return (
    <Rise i={i} from={10} style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', paddingVertical: 8, borderRadius: 14, backgroundColor: d.today ? K.copper : d.count ? K.copperTint : 'rgba(246,231,222,0.5)' }}>
        <Txt v="caption" color={d.today ? 'rgba(255,255,255,0.8)' : K.ink2} style={{ fontSize: 10.5 }}>{d.label}</Txt>
        <Txt v="headline" tabular color={d.today ? '#fff' : d.count ? K.ink : K.ink3} style={{ marginTop: 2 }}>{d.count}</Txt>
      </View>
    </Rise>
  );
}

export default function Training() {
  useStore(s => s.completed);
  const crew = useCrew();
  const { wide } = useLayout();
  const days = week();
  const total = days.reduce((a, d) => a + d.count, 0);
  const shown = useTween(total, 900);
  const s = sessionById(TODAY_SESSION);
  const done = doneToday(s.id);

  const summary = (
    <View>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt v="subM">This week</Txt>
          <Txt v="subM" tabular color={K.copperInk}>{Math.round(shown)} sessions</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 5, marginTop: 12 }}>{days.map((d, i) => <DayBox key={d.key} d={d} i={i} />)}</View>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <Txt v="headline">Workout frequency</Txt>
        <Txt v="caption" color={K.ink2} style={{ marginTop: 2, marginBottom: 14 }}>Past 7 weeks · logged sessions</Txt>
        <HeatGrid weeks={frequency()} />
      </Card>
    </View>
  );
  const today = (
    <View style={{ marginTop: wide ? 0 : 12 }}>
      <SessionHero s={s} kicker={done ? 'Completed today' : 'Today’s session'} done={done} onPress={() => router.push(`/training/${s.id}`)} height={wide ? 260 : 190} />
      <ListGroup style={{ marginTop: 12 }}>
        <ListRow icon={SlidersHorizontal} title="Plan inputs" sub="Crew profile, flight duration and device data" onPress={() => router.push('/profile/mission')} />
      </ListGroup>
      <Card sunk style={{ marginTop: 12 }}>
        <Kicker color={K.ink2}>Why it matters</Kicker>
        <Txt v="caption" color={K.ink2} style={{ marginTop: 4 }}>In microgravity, bones can lose 1–1.5% of mass per month without loading. Daily aerobic and resistance work is the main countermeasure.</Txt>
      </Card>
    </View>
  );

  return (
    <Page tabs title="Training" header={<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Txt v="headline">Training</Txt><Tag label={`Day ${crew.missionDay}`} /></View>}
      footer={<Button title="Browse workout sets" icon={ArrowRight} onPress={() => router.push('/training/sets')} />}>
      <PageHead kicker="Mission training" title="Weekly summary" sub="Completed sessions by day." style={{ marginTop: 6 }} />
      <Cols gap={20} style={{ marginTop: 16 }}>{summary}{today}</Cols>
    </Page>
  );
}
