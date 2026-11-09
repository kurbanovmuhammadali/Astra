import { useSyncExternalStore } from 'react';

/** Sign-up answers collected across the onboarding screens, sent once with the email code. */
export type Draft = { firstName: string; lastName: string; acceptTerms: boolean; age: number; missionYears: number; email: string; devCode: string };
const initial: Draft = { firstName: '', lastName: '', acceptTerms: false, age: 32, missionYears: 1, email: '', devCode: '' };

let state: Draft = { ...initial };
const subs = new Set<() => void>();
export const draft = {
  get: () => state,
  set: (patch: Partial<Draft>) => { state = { ...state, ...patch }; subs.forEach(f => f()); },
  reset: () => { state = { ...initial }; subs.forEach(f => f()); },
};
export function useDraft(): [Draft, (p: Partial<Draft>) => void] {
  const s = useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, draft.get, draft.get);
  return [s, draft.set];
}

/** Mission length → where the crew is going. Drives the route animation and the label under the number. */
export type Destination = 'orbit' | 'moon' | 'mars' | 'jupiter';
export const destinationFor = (y: number): Destination => (y <= 1 ? 'orbit' : y <= 2 ? 'moon' : y <= 4 ? 'mars' : 'jupiter');
export const DEST_LABEL: Record<Destination, string> = { orbit: 'Earth orbit', moon: 'Moon', mars: 'Mars round trip', jupiter: 'Deep space' };
export const DEST_RANGE: Record<Destination, [number, number]> = { orbit: [0.5, 1], moon: [1.5, 2], mars: [2.5, 4], jupiter: [4.5, 10] };
