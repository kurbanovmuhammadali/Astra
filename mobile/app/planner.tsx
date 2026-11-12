import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, ChevronLeft } from 'lucide-react-native';
import { api } from '@/api';
import { A, F } from '@/theme';
import { Loading, T } from '@/ui';
import { shadowSoft } from '@/astra';

type Exercise = { name: string; sets: number | null; reps: string | null; minutes: number | null; camera: 'squat' | 'pushup' | 'pullup' | null; note: string };
type Session = { day: string; title: string; minutes: number; exercises: Exercise[] };
type Plan = {
  summary: string; weeks: { week: number; focus: string; sessions: Session[] }[]; nutrition: string[];
  milestones: { title: string; when: string; detail: string }[];
  review: { title: string; sections: { heading: string; text: string; refs: string[] }[]; references: Record<string, string> } | null;
  caveats: string[];
};
type Saved = { createdAt: string; source: 'ai' | 'offline'; provider: string | null; input: { goalType: string; missionGoal: string; weeks: number; daysPerWeek: number; level: string }; plan: Plan; aiError?: boolean };

const GOALS: [string, string, string][] = [['mission', 'Prepare for a mission', 'Training and a roadmap for a specific mission'], ['astronaut', 'Become an astronaut', 'Fitness plan and a step-by-step path'], ['fitness', 'Get fitter', 'A simple progressive plan']];

export default function Planner() {
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [aiOk, setAiOk] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [form, setForm] = useState(true);
  const [goalType, setGoalType] = useState('');
  const [missionGoal, setMissionGoal] = useState('');
  const [weeks, setWeeks] = useState(8);
  const [days, setDays] = useState(4);
  const [level, setLevel] = useState('');
  const [notes, setNotes] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [wk, setWk] = useState(1);

  useEffect(() => {
    api<{ saved: Saved | null; aiAvailable: boolean; provider: string | null }>('/api/planner')
      .then(r => { setSaved(r.saved); setAiOk(r.aiAvailable); setProvider(r.provider); setForm(!r.saved); })
      .catch(e => setErr(e.message)).finally(() => setLoaded(true));
  }, []);

  const create = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api<Saved>('/api/planner', { body: { goalType, missionGoal, weeks, daysPerWeek: days, level, notes, useAi } });
      setSaved(r); setForm(false); setWk(1);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const card = [{ backgroundColor: '#fff', borderRadius: 22, padding: 16, marginTop: 12 }, shadowSoft] as any;
  const Pills = ({ opts, value, onPick }: { opts: [string | number, string][]; value: string | number; onPick: (v: any) => void }) => (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {opts.map(([k, l]) => (
        <Pressable key={String(k)} accessibilityRole="button" onPress={() => onPick(k)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: value === k ? A.copper : '#fff' }}>
          <T size={13} weight="m" color={value === k ? '#fff' : A.ink}>{l}</T>
        </Pressable>
      ))}
    </View>
  );
  const Label = ({ children }: { children: string }) => <T size={13} weight="m" color={A.ink2} style={{ marginTop: 18 }}>{children}</T>;
  const ready = !!goalType && !!level && (goalType !== 'mission' || missionGoal.trim().length >= 5);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: A.sand, justifyContent: 'center' }}><Loading /></View>;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: A.sand }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 70, paddingHorizontal: 20, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <ChevronLeft size={20} color={A.ink} /><T size={14} color={A.ink2}>Back</T>
      </Pressable>
      <T size={28} weight="sb" color={A.ink} style={{ marginTop: 14, letterSpacing: -0.7 }}>Planner</T>

      {form ? (
        <>
          <Label>What do you want to prepare for?</Label>
          {GOALS.map(([k, t, d]) => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: goalType === k }} onPress={() => setGoalType(k)}
              style={{ marginTop: 8, padding: 14, borderRadius: 18, backgroundColor: goalType === k ? A.copper : '#fff' }}>
              <T size={15} weight="m" color={goalType === k ? '#fff' : A.ink}>{t}</T>
              <T size={12} color={goalType === k ? 'rgba(255,255,255,0.85)' : A.ink3} style={{ marginTop: 2 }}>{d}</T>
            </Pressable>
          ))}

          {goalType === 'mission' ? (
            <>
              <Label>What is the goal of the mission?</Label>
              <TextInput value={missionGoal} onChangeText={setMissionGoal} multiline maxLength={300} placeholder="e.g. 6-month ISS science increment, or a Mars transit" placeholderTextColor={A.ink3} accessibilityLabel="Mission goal"
                style={{ marginTop: 8, minHeight: 74, borderRadius: 16, backgroundColor: '#fff', padding: 12, fontFamily: F.r, fontSize: 15, color: A.ink, textAlignVertical: 'top' }} />
            </>
          ) : null}

          <Label>How many weeks?</Label>
          <Pills opts={[[4, '4'], [8, '8'], [12, '12']]} value={weeks} onPick={setWeeks} />
          <Label>Training days per week</Label>
          <Pills opts={[[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']]} value={days} onPick={setDays} />
          <Label>Your level now</Label>
          <Pills opts={[['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']]} value={level} onPick={setLevel} />
          <Label>Injuries or limits (optional)</Label>
          <TextInput value={notes} onChangeText={setNotes} maxLength={300} placeholder="e.g. sore left knee" placeholderTextColor={A.ink3} accessibilityLabel="Injuries or limits"
            style={{ marginTop: 8, height: 44, borderRadius: 14, backgroundColor: '#fff', paddingHorizontal: 12, fontFamily: F.r, fontSize: 15, color: A.ink }} />

          {aiOk ? (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: useAi }} onPress={() => setUseAi(v => !v)} style={{ flexDirection: 'row', gap: 10, marginTop: 20, alignItems: 'flex-start' }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: A.copper, backgroundColor: useAi ? A.copper : 'transparent' }} />
              <T size={12.5} color={A.ink2} style={{ flex: 1, lineHeight: 18 }}>Use AI ({provider}). Sends these answers and your age, sex, height and weight, not your name or email. Needed for the academic review.</T>
            </Pressable>
          ) : <T size={12} color={A.ink3} style={{ marginTop: 18 }}>AI is not set up on this server, so you get the basic plan without the academic review.</T>}

          {err ? <T size={13} color="#D9583F" style={{ marginTop: 12 }}>{err}</T> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Create my plan" disabled={!ready || busy} onPress={create}
            style={{ marginTop: 18, height: 52, borderRadius: 999, backgroundColor: ready && !busy ? A.copper : A.line, alignItems: 'center', justifyContent: 'center' }}>
            <T size={15} weight="m" color="#fff">{busy ? (useAi ? 'Writing your plan… up to a minute' : 'Creating…') : 'Create my plan'}</T>
          </Pressable>
          {saved ? <Pressable accessibilityRole="button" onPress={() => setForm(false)} style={{ marginTop: 14, alignSelf: 'center' }}><T size={13} color={A.ink3}>Back to my plan</T></Pressable> : null}
        </>
      ) : saved ? (
        <>
          <T size={14} color={A.ink2} style={{ marginTop: 6, lineHeight: 20 }}>{saved.plan.summary}</T>
          <T size={11.5} color={A.ink3} style={{ marginTop: 4 }}>
            {saved.source === 'ai' ? `Written by AI (${saved.provider}). Check it with a coach or doctor.` : saved.aiError ? 'AI was unavailable, so this is the basic plan.' : 'Basic plan, no AI.'}
          </T>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 16 }}>
            {saved.plan.weeks.map(w => (
              <Pressable key={w.week} accessibilityRole="button" onPress={() => setWk(w.week)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: wk === w.week ? A.copper : '#fff' }}>
                <T size={13} weight="m" color={wk === w.week ? '#fff' : A.ink}>Week {w.week}</T>
              </Pressable>
            ))}
          </ScrollView>
          {(() => {
            const w = saved.plan.weeks.find(x => x.week === wk) ?? saved.plan.weeks[0];
            return (
              <>
                {w.focus ? <T size={13} color={A.ink2} style={{ marginTop: 10 }}>{w.focus}</T> : null}
                {w.sessions.map((s, i) => (
                  <View key={i} style={card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <T size={15} weight="sb" color={A.ink}>{s.day} · {s.title}</T><T size={12.5} color={A.ink3}>{s.minutes} min</T>
                    </View>
                    {s.exercises.map((e, j) => (
                      <View key={j} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <T size={14} color={A.ink}>{e.name}</T>
                          <T size={12} color={A.ink3}>{[e.sets && e.reps ? `${e.sets} × ${e.reps}` : e.reps, e.minutes ? `${e.minutes} min` : null, e.note].filter(Boolean).join(' · ')}</T>
                        </View>
                        {e.camera ? (
                          <Pressable accessibilityRole="button" accessibilityLabel={`Check ${e.name} with the camera`} onPress={() => router.push({ pathname: '/workout', params: { ex: e.camera! } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: A.sand, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                            <Camera size={14} color={A.copper} /><T size={12} weight="m" color={A.ink}>Check</T>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))}
              </>
            );
          })()}

          {saved.plan.nutrition.length ? (
            <View style={card}>
              <T size={15} weight="sb" color={A.ink}>Nutrition</T>
              {saved.plan.nutrition.map((n, i) => <T key={i} size={13.5} color={A.ink2} style={{ marginTop: 6, lineHeight: 19 }}>• {n}</T>)}
            </View>
          ) : null}

          {saved.plan.milestones.length ? (
            <View style={card}>
              <T size={15} weight="sb" color={A.ink}>{saved.input.goalType === 'astronaut' ? 'Path to becoming an astronaut' : 'Preparation roadmap'}</T>
              {saved.plan.milestones.map((m, i) => (
                <View key={i} style={{ marginTop: 10 }}>
                  <T size={14} weight="m" color={A.ink}>{m.title}<T size={12} color={A.ink3}>{m.when ? `  ·  ${m.when}` : ''}</T></T>
                  <T size={13} color={A.ink2} style={{ marginTop: 2, lineHeight: 18 }}>{m.detail}</T>
                </View>
              ))}
            </View>
          ) : null}

          {saved.plan.review ? (
            <View style={card}>
              <T size={15} weight="sb" color={A.ink}>{saved.plan.review.title || 'Academic review'}</T>
              {saved.plan.review.sections.map((s, i) => (
                <View key={i} style={{ marginTop: 12 }}>
                  <T size={13.5} weight="m" color={A.ink}>{s.heading}</T>
                  <T size={13.5} color={A.ink2} style={{ marginTop: 3, lineHeight: 20 }}>{s.text}{s.refs.length ? ` [${s.refs.join('], [')}]` : ''}</T>
                </View>
              ))}
              {Object.keys(saved.plan.review.references).length ? (
                <View style={{ marginTop: 14 }}>
                  <T size={12} weight="m" color={A.ink3}>References</T>
                  {Object.entries(saved.plan.review.references).map(([id, c]) => <T key={id} size={11.5} color={A.ink3} style={{ marginTop: 4, lineHeight: 16 }}>[{id}] {c}</T>)}
                </View>
              ) : null}
              <T size={11.5} color={A.ink3} style={{ marginTop: 12, lineHeight: 16 }}>AI-written. Statements without a reference are general knowledge. Check the sources before citing.</T>
            </View>
          ) : saved.source === 'offline' ? <T size={12} color={A.ink3} style={{ marginTop: 12 }}>The academic review needs the AI option.</T> : null}

          {saved.plan.caveats.length ? <T size={11.5} color={A.ink3} style={{ marginTop: 14, lineHeight: 16 }}>{saved.plan.caveats.join(' ')}</T> : null}
          <Pressable accessibilityRole="button" onPress={() => setForm(true)} style={{ marginTop: 18, height: 48, borderRadius: 999, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <T size={14} weight="m" color={A.ink}>Make a new plan</T>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}
