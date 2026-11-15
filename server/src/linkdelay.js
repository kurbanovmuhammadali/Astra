/**
 * How far is this astronaut from Earth, in signal time? A live conversation needs a round trip of a few seconds at most, so
 * live calls exist only near Earth (the ISS, the Moon). Farther away the only honest tools are messages and recorded video that
 * are stored, sent when the link is up, and played when the other side is ready (store and forward).
 */
export const ONE_WAY_MIN = { iss: 0, moon: 0.02, mars: 12, jupiter: 45, deep: 90, station: 0, lunar: 0.02, spacecraft: 45 };
export const LIVE_MAX_SECONDS = 2; // one-way: above this a conversation is not possible

export function delayMinFor(u) {
  if (!u) return 0;
  try { const g = u.mission_goal ? JSON.parse(u.mission_goal) : null; if (g?.dest in ONE_WAY_MIN) return ONE_WAY_MIN[g.dest]; } catch { /* ignore */ }
  return ONE_WAY_MIN[u.environment] ?? 0;
}
export const liveCallOk = u => delayMinFor(u) * 60 <= LIVE_MAX_SECONDS;
