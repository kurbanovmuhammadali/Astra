import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Activity, Eye, HeartPulse, Footprints, RotateCcw, Move3d, ChevronRight } from 'lucide-react-native';
import { K, RAD, ELEV, toneWord } from '@/kit/tokens';
import { Kicker, Pressy, Swap, Txt, useLayout } from '@/kit/core';
import { Card, Chip, ChipRow, Dot, ListGroup, ListRow, Stepper, Tag } from '@/kit/ui';
import { Cols, Page } from '@/kit/page';
import AnatomyViewer from '@/three/AnatomyViewer';
import { LAYERS, LayerKey, findings as allFindings, useCrew } from '@/data/crew';

const ICON: Record<string, any> = { vision: Eye, heart: HeartPulse, knee: Footprints };

export default function Body() {
  const crew = useCrew();
  const { wide, gutter } = useLayout();
  const [li, setLi] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const layer = LAYERS[li];
  const today = crew.days[6];
  const all = useMemo(() => allFindings(today.rhr), [today.rhr]);
  const marks = all.filter(f => f.layers.includes(layer.key));
  const setLayer = (k: LayerKey) => { setSel(null); setLi(LAYERS.findIndex(l => l.key === k)); };
  const step = (n: number) => { setSel(null); setLi(i => (i + n + LAYERS.length) % LAYERS.length); };
  const selected = all.find(f => f.id === sel);

  const viewer = (
    <View style={[{ borderRadius: RAD.l, overflow: 'hidden', borderWidth: 1, borderColor: K.hair }, ELEV.card]}>
      <LinearGradient colors={['#FBEFE7', '#F3DCCD', '#EBCBB8']} locations={[0, 0.6, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <AnatomyViewer layer={layer.key} findings={marks} selected={sel} onSelect={setSel} height={wide ? 640 : 430} />
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ backgroundColor: 'rgba(255,253,251,0.85)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}><Kicker color={K.ink2}>{sel ? `Focus · ${selected?.label}` : 'Anterior view'}</Kicker></View>
        {sel ? <Pressy label="Reset view" onPress={() => setSel(null)}><View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,253,251,0.9)', alignItems: 'center', justifyContent: 'center' }}><RotateCcw size={15} color={K.ink} /></View></Pressy> : null}
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 12, right: 14, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Txt v="mono" color={K.ink2} upper style={{ fontSize: 9.5 }}>Drag to rotate</Txt><Move3d size={13} color={K.ink2} />
      </View>
    </View>
  );

  const legend = (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        {(['ok', 'watch', 'flag'] as const).map(t => <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Dot tone={t} size={7} /><Txt v="caption" color={K.ink2}>{toneWord(t)}</Txt></View>)}
      </View>
      <Txt v="caption" color={K.ink3} style={{ marginTop: 6 }}>Dots mark recorded findings. Areas without data are unmarked.</Txt>
    </View>
  );

  const side = (
    <View>
      <Swap k={layer.key}>
        <Card style={{ marginTop: wide ? 0 : 16 }}>
          <Kicker>{layer.label} layer</Kicker>
          <Txt v="headline" style={{ marginTop: 6 }}>{layer.topic}</Txt>
          <Txt v="sub" color={K.ink2} style={{ marginTop: 6 }}>{layer.text}</Txt>
          {layer.rows.length ? <View style={{ marginTop: 10, gap: 8 }}>{layer.rows.map(([a, b]) => (
            <View key={a} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: K.hair }}>
              <Txt v="subM">{a}</Txt><Txt v="mono" color={K.ink3} upper>{b}</Txt>
            </View>
          ))}</View> : null}
        </Card>
      </Swap>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }}>
        <Txt v="headline">Findings</Txt>
        <Txt v="mono" color={K.ink3} upper>{marks.length} on this layer</Txt>
      </View>
      <ListGroup>
        {all.map(f => (
          <ListRow key={f.id} icon={ICON[f.id] ?? Activity} title={f.title} sub={f.sub} tone={f.tone} current={sel === f.id}
            onPress={() => { if (!f.layers.includes(layer.key)) setLayer('overview'); setSel(sel === f.id ? null : f.id); }} />
        ))}
      </ListGroup>
      {selected ? (
        <Swap k={selected.id}>
          <Card style={{ marginTop: 10 }} onPress={() => router.push(selected.route as any)} label={`Open ${selected.title}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Dot tone={selected.tone} pulse />
              <View style={{ flex: 1 }}>
                <Txt v="subM">{toneWord(selected.tone)} · {selected.title}</Txt>
                <Txt v="caption" color={K.ink2}>{selected.id === 'heart' ? 'Open the 7-day heart-rate trend' : 'Add detail in a crew check-in'}</Txt>
              </View>
              <ChevronRight size={17} color={K.ink3} />
            </View>
          </Card>
        </Swap>
      ) : null}
      <Card onPress={() => router.push('/signals')} label="Health signals" style={{ marginTop: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}><Kicker>Body analytics</Kicker><Txt v="headline" style={{ marginTop: 4 }}>Health signals</Txt><Txt v="caption" color={K.ink2}>Recovery, heart-rate trend and personal dosimetry</Txt></View>
          <ChevronRight size={18} color={K.ink3} />
        </View>
      </Card>
    </View>
  );

  return (
    <Page tabs title="Body explorer" header={<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Txt v="headline">Body explorer</Txt><Tag label="3D reference" /></View>}>
      <Stepper label={`${layer.label} · system layers`} onPrev={() => step(-1)} onNext={() => step(1)} style={{ marginTop: 8 }} />
      <View style={{ marginTop: 12 }}>
        <ChipRow gutter={gutter}>{LAYERS.map(l => <Chip key={l.key} label={l.label} on={l.key === layer.key} onPress={() => setLayer(l.key)} />)}</ChipRow>
      </View>
      <Cols ratio={[1.25, 1]} gap={28} style={{ marginTop: 14 }}>
        <View>{viewer}{legend}</View>
        {side}
      </Cols>
      <Txt v="caption" color={K.ink3} center style={{ marginTop: 22 }}>Reference anatomy: BodyParts3D (CC BY-SA 2.1 JP) · Z-Anatomy (CC BY-SA 4.0). Not diagnostic.</Txt>
    </Page>
  );
}
