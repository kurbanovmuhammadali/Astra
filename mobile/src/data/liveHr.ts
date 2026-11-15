/**
 * TEMPORARY live heart rate test. WHOOP's public API has no live heart rate (only recovery, sleep, cycles, workouts, body).
 * What the strap can do is "Heart Rate Broadcast": it then advertises the standard Bluetooth Heart Rate service, which a browser
 * can read with Web Bluetooth (Chrome / Edge on a computer or Android, over https). Nothing is stored: values are only shown.
 * TO REMOVE: delete this file, app/live-hr.tsx, its route name in app/_layout.tsx and the row in app/profile/connected.tsx.
 */
export const liveHrSupported = () => typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;

/** Parses a Heart Rate Measurement value (Bluetooth spec): flags, then 8 or 16 bit heart rate, optional RR intervals. */
export function parseHr(dv: DataView): { bpm: number; rr: number[] } {
  const flags = dv.getUint8(0);
  let i = 1, bpm: number;
  if (flags & 0x01) { bpm = dv.getUint16(i, true); i += 2; } else { bpm = dv.getUint8(i); i += 1; }
  if (flags & 0x08) i += 2; // energy expended
  const rr: number[] = [];
  if (flags & 0x10) while (i + 1 < dv.byteLength) { rr.push(Math.round((dv.getUint16(i, true) / 1024) * 1000)); i += 2; } // 1/1024 s -> ms
  return { bpm, rr };
}

export type LiveHr = { stop: () => void; name: string };
/** Opens the browser's device picker (heart rate devices only) and streams beats per minute. */
export async function connectLiveHr(onBpm: (bpm: number, rr: number[]) => void, onState: (s: 'connecting' | 'live' | 'lost') => void): Promise<LiveHr> {
  const bt = (navigator as any).bluetooth;
  const dev = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service'] });
  onState('connecting');
  const server = await dev.gatt.connect();
  const svc = await server.getPrimaryService('heart_rate');
  const ch = await svc.getCharacteristic('heart_rate_measurement');
  const handler = (e: any) => { try { const { bpm, rr } = parseHr(e.target.value as DataView); if (bpm > 0) onBpm(bpm, rr); } catch { /* malformed packet */ } };
  ch.addEventListener('characteristicvaluechanged', handler);
  await ch.startNotifications();
  dev.addEventListener('gattserverdisconnected', () => onState('lost'));
  onState('live');
  return { name: dev.name ?? 'Heart rate sensor', stop: () => { try { ch.removeEventListener('characteristicvaluechanged', handler); ch.stopNotifications?.(); dev.gatt?.disconnect(); } catch { /* already gone */ } } };
}
