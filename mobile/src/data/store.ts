/**
 * Small persisted app store (profile extras, completed workouts, chat history, device previews).
 * Web: localStorage. Native: a JSON file in the app's document directory.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type ChatMsg = { id: string; role: 'user' | 'astra'; text: string; at: number; files?: string[] };
export type Chat = { id: string; title: string; sub: string; at: number; messages: ChatMsg[] };

export type AppState = {
  profile: { age: string; gender: string; height: string; weight: string; duration: string; missionStart: string; displayName?: string };
  completed: Record<string, string[]>; // yyyy-mm-dd → session ids
  chats: Chat[];
  devices: { appleWatch?: boolean };
  seeded?: boolean;
  /** Mission briefing (set before tracking; editable in Profile › Mission briefing). */
  briefing: { dest: 'iss' | 'moon' | 'mars' | 'jupiter' | 'deep'; commDelayMin: number; evaDates: string[]; crewSize: number; objective: string; custom?: boolean };
  /** Synthetic Mars demo telemetry (clearly labelled) and the clean presentation mode for judges. */
  settings: { demo: boolean; judge: boolean };
  /** Daily crew checks, newest last. Private mood stays on the device and out of reports. */
  checks: { day: string; at: number; mood: number; moodPrivate: boolean; symptoms: string[]; exerciseMin: number; manual: Record<string, number> }[];
  /** Repeat measurements: metric → latest re-measured value. */
  remeasure: Record<string, { value: number; at: number; source: string }>;
  /** Flight-surgeon reports in the store-and-forward queue. */
  reports: { id: string; title: string; createdAt: number; status: 'draft' | 'queued' | 'sent' | 'ack'; sentAt?: number; ackAt?: number; body: string }[];
  /** Active solar-particle-event shelter alert. */
  spe: { startedAt: number; shelterBy: number } | null;
  /** Face enrolment for crew recognition in camera tools — small grey thumbnails, kept only on this device. */
  face: { enrolledAt: number; samples: string[] } | null;
};

const day = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const at = (offsetDays: number, h: number, m: number) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(h, m, 0, 0); return d.getTime(); };

const initial = (): AppState => ({
  profile: { age: '32', gender: 'Prefer not to say', height: '178', weight: '74', duration: '180', missionStart: day(-41) },
  completed: {},
  devices: {},
  briefing: { dest: 'mars', commDelayMin: 12, evaDates: [day(1), day(9)], crewSize: 4, objective: 'Surface science and habitat assembly' },
  settings: { demo: true, judge: false },
  checks: [],
  remeasure: {},
  reports: [
    { id: 'r40', title: 'Day 40 report', createdAt: at(-2, 19, 0), status: 'ack', sentAt: at(-2, 19, 20), ackAt: at(-2, 20, 5), body: '' },
    { id: 'r41', title: 'Day 41 report', createdAt: at(-1, 19, 0), status: 'queued', body: '' },
  ],
  spe: null,
  face: null,
  chats: [
    { id: 'c-dose', title: 'Reading my dose report', sub: 'Dosimetry report attached', at: at(0, 9, 18), messages: [
      { id: 'm1', role: 'user', text: 'Can you read my dose report?', at: at(0, 9, 17), files: ['dosimeter-nov.pdf'] },
      { id: 'm2', role: 'astra', text: 'Your personal dosimeter logged 0.43 mSv yesterday, close to your 7‑day average. Mission total is 18.6 mSv. Cabin monitors are reported separately from your personal dose.', at: at(0, 9, 18) },
    ] },
    { id: 'c-sleep', title: 'Last night’s sleep', sub: 'Recovery and sleep trend', at: at(0, 7, 42), messages: [
      { id: 'm1', role: 'user', text: 'How did I sleep last night?', at: at(0, 7, 41) },
      { id: 'm2', role: 'astra', text: 'You slept 5 h 48 m — about 50 minutes under your weekly average, and recovery dropped to 47%. Consider a lighter session today and an earlier lights-out.', at: at(0, 7, 42) },
    ] },
    { id: 'c-week', title: 'Review my weekly training', sub: 'Crew workout summary', at: at(-2, 18, 5), messages: [
      { id: 'm1', role: 'user', text: 'Review my weekly training', at: at(-2, 18, 4) },
      { id: 'm2', role: 'astra', text: 'Five sessions this week: two resistance blocks on ARED, two CEVIS rides and one mobility flow. You’re on track with the crew plan.', at: at(-2, 18, 5) },
    ] },
  ],
});

const KEY = 'astra.app.v1';
let state: AppState = initial();
let loaded = false;
const subs = new Set<() => void>();

async function read(): Promise<AppState | null> {
  try {
    if (Platform.OS === 'web') { const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; return v ? JSON.parse(v) : null; }
    const { File, Paths } = await import('expo-file-system');
    const f = new File(Paths.document, 'astra-app.json');
    if (!f.exists) return null;
    return JSON.parse(await (f as any).text());
  } catch { return null; }
}
async function write() {
  try {
    const s = JSON.stringify(state);
    if (Platform.OS === 'web') { localStorage.setItem(KEY, s); return; }
    const { File, Paths } = await import('expo-file-system');
    const f = new File(Paths.document, 'astra-app.json');
    if (!f.exists) f.create();
    f.write(s);
  } catch {}
}

export async function loadStore() {
  if (loaded) return;
  loaded = true;
  const saved = await read();
  if (saved) { const i = initial(); state = { ...i, ...saved, profile: { ...i.profile, ...saved.profile }, settings: { ...i.settings, ...(saved as any).settings }, briefing: { ...i.briefing, ...(saved as any).briefing } }; }
  subs.forEach(f => f());
}

export function getStore() { return state; }
export function setStore(fn: (s: AppState) => AppState) {
  state = fn(state);
  subs.forEach(f => f());
  write();
}

export function useStore<T>(pick: (s: AppState) => T): T {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force(n => n + 1);
    subs.add(f);
    loadStore();
    return () => { subs.delete(f); };
  }, []);
  return pick(state);
}

export const todayKey = () => day(0);
export const dayKey = day;
export const uid = () => Math.random().toString(36).slice(2, 10);
