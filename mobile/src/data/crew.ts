/**
 * Crew health view-model: merges the server dashboard (WHOOP / demo measurements) with clearly-labelled
 * sample values for signals the server does not store yet (workout heart rate). Works offline with samples.
 */
import { useMemo } from 'react';
import { useApi } from '../useApi';
import type { Dashboard, Snap } from '../types';
import { useStore } from './store';

export type DayView = {
  key: string; label: string; short: string; date: Date;
  recovery: number | null; sleep: number | null; hrv: number | null; rhr: number | null; workoutHr: number | null; workoutMin: number | null; dose: number | null;
  steps: number | null; kcal: number | null;
};

const SAMPLE = {
  recovery: [56, 61, 69, 58, 65, 51, 47], sleep: [6.2, 6.77, 7.3, 6.58, 7.08, 6.35, 5.8], hrv: [53, 55, 59, 53, 57, 51, 50],
  rhr: [58, 57, 56, 59, 58, 60, 61], workoutHr: [112, 121, 116, 0, 0, 119, 118], workoutMin: [35, 62, 30, 0, 0, 40, 32], dose: [0.39, 0.42, 0.37, 0.51, 0.4, 0.45, 0.43],
  steps: [8120, 10230, 7650, 4310, 5120, 9840, 9245], kcal: [1822, 2105, 1690, 1214, 1352, 1980, 1648],
};

/** Active calories for the last 28 days (oldest first) — sample until Apple Health activity is connected. */
export const ACTIVITY_28 = Array.from({ length: 28 }, (_, i) => (i >= 21 ? SAMPLE.kcal[i - 21] : Math.round(1500 + 520 * Math.sin(i * 1.7) * Math.cos(i * 0.6) + (i % 7 === 3 ? -380 : 0))));

const pad7 = (a: (number | null)[] | undefined, fallback: number[]) => {
  if (!a || !a.length || a.every(v => v == null)) return fallback.map(v => v as number | null);
  const s = a.slice(-7);
  return [...Array(Math.max(0, 7 - s.length)).fill(null), ...s];
};

export const fmtSleep = (h: number | null | undefined) => (h == null ? '—' : `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`);

export function useCrew() {
  const { data, error, reload, loading } = useApi<Dashboard>('/api/dashboard');
  const profile = useStore(s => s.profile);
  return useMemo(() => {
    const m: Record<string, Snap> = data?.metrics ?? {};
    const sampleOnly = !data;
    const src = (k: string) => (m[k]?.source && m[k].source !== 'demo' ? m[k].source! : 'sample');
    const series = {
      recovery: pad7(m.recovery?.spark, SAMPLE.recovery), sleep: pad7(m.sleep?.spark, SAMPLE.sleep), hrv: pad7(m.hrv?.spark, SAMPLE.hrv),
      rhr: pad7(m.rhr?.spark, SAMPLE.rhr), workoutMin: pad7(m.exercise?.spark ? m.exercise.spark.map(v => (v == null ? null : Math.round(v / 4))) : undefined, SAMPLE.workoutMin),
      workoutHr: SAMPLE.workoutHr.map(v => v || null), dose: pad7(m.radiation?.spark, SAMPLE.dose),
      steps: SAMPLE.steps.map(v => v as number | null), kcal: SAMPLE.kcal.map(v => v as number | null),
    };
    const days: DayView[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() + i - 6);
      return {
        key: d.toISOString().slice(0, 10), date: d,
        label: i === 6 ? `Today · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        short: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        recovery: series.recovery[i], sleep: series.sleep[i], hrv: series.hrv[i], rhr: series.rhr[i], workoutHr: series.workoutHr[i], workoutMin: series.workoutMin[i], dose: series.dose[i], steps: series.steps[i], kcal: series.kcal[i],
      };
    });
    const start = new Date(profile.missionStart + 'T00:00:00');
    const missionDay = Math.max(1, Math.floor((Date.now() - start.getTime()) / 864e5) + 1);
    const duration = Number(profile.duration) || 180;
    const doses = series.dose.filter((v): v is number => v != null);
    const avgDose = doses.length ? doses.reduce((a, b) => a + b, 0) / doses.length : 0.43;
    const doseTotal = +(avgDose * missionDay).toFixed(1);
    const isSample = sampleOnly || [m.recovery, m.sleep, m.hrv].some(s => !s || s.source === 'demo');
    return {
      loading: loading && !data, error, reload, raw: data, days, series, missionDay, duration, doseTotal, avgDose, isSample,
      source: { recovery: src('recovery'), sleep: src('sleep'), hrv: src('hrv'), rhr: src('rhr') },
      alerts: data?.alerts ?? [], systems: data?.systems ?? [],
    };
  }, [data, error, loading, profile.missionStart, profile.duration]);
}

// ----------------------------------------------------------------------------- body systems
export type LayerKey = 'overview' | 'circulatory' | 'nervous' | 'skin' | 'digestive' | 'muscular' | 'skeletal';
export const LAYERS: { key: LayerKey; label: string; topic: string; text: string; rows: [string, string][] }[] = [
  { key: 'overview', label: 'Overview', topic: 'Whole body · system layers', text: 'Recorded findings appear as markers. Areas without data stay unmarked.', rows: [] },
  { key: 'circulatory', label: 'Circulatory', topic: 'Heart & blood vessels', text: 'Resting heart rate and HRV compared with your own baseline. Blood pressure comes from a cuff reading.', rows: [['Resting heart rate', 'WHOOP'], ['HRV', 'WHOOP'], ['Blood pressure', 'Cuff reading']] },
  { key: 'nervous', label: 'Nervous', topic: 'Brain, spinal cord & nerves', text: 'Reported headache, balance and vision changes. A clinical eye exam is a separate source.', rows: [['Balance check', 'Crew check-in'], ['Vision exam', 'Flight surgeon']] },
  { key: 'skin', label: 'Skin', topic: 'Skin & surface temperature', text: 'Overnight skin temperature and reported skin changes.', rows: [['Skin temperature', 'WHOOP'], ['Skin changes', 'Crew check-in']] },
  { key: 'digestive', label: 'Digestive', topic: 'Digestion & nutrition', text: 'Appetite and digestive symptoms from crew check-ins.', rows: [['Appetite', 'Crew check-in'], ['Body mass', 'Mass measurement device']] },
  { key: 'muscular', label: 'Muscular', topic: 'Muscles & strength', text: 'Resistance sessions and exercise logs during microgravity exposure.', rows: [['Resistance', 'Training log'], ['Strength test', 'Assessment']] },
  { key: 'skeletal', label: 'Skeletal', topic: 'Bones & loading', text: 'Loading sessions and clinician-provided bone assessments.', rows: [['Exercise loading', 'Training log'], ['Bone marker', 'Lab result']] },
];

/** `at` = marker position on the glass-body image (x, y as fractions of its width / height). `pos` = legacy 3D point. */
export type Finding = { id: string; label: string; title: string; sub: string; tone: 'ok' | 'watch' | 'flag'; pos: [number, number, number]; at: [number, number]; layers: LayerKey[]; route?: string };
export function findings(rhr: number | null): Finding[] {
  return [
    { id: 'mood', label: 'Brain', title: 'Mood & sleep', sub: 'Lower mood 3 of 7 days · check-in', tone: 'watch', pos: [0, 1.66, 0], at: [0.5, 0.035], layers: ['overview', 'nervous'], route: '/checkin' },
    { id: 'vision', label: 'Vision', title: 'Vision check', sub: 'New symptom · crew medical flag', tone: 'flag', pos: [0.032, 1.585, 0.105], at: [0.5, 0.075], layers: ['overview', 'nervous', 'skin'], route: '/checkin' },
    { id: 'heart', label: 'Heart', title: 'Resting heart rate', sub: `${rhr ?? 61} bpm · within personal baseline`, tone: 'ok', pos: [0.03, 1.29, 0.06], at: [0.535, 0.205], layers: ['overview', 'circulatory', 'muscular', 'skeletal'], route: '/signals' },
    { id: 'bone', label: 'Bone', title: 'Bone loss marker', sub: 'NTx +18% vs baseline · lab result', tone: 'watch', pos: [0, 0.95, 0], at: [0.5, 0.465], layers: ['overview', 'skeletal'], route: '/metric/ntx' },
    { id: 'knee', label: 'Knee', title: 'Right knee', sub: 'Discomfort · crew check-in', tone: 'watch', pos: [-0.095, 0.5, 0.045], at: [0.39, 0.72], layers: ['overview', 'muscular', 'skeletal', 'skin'], route: '/checkin' },
  ];
}
