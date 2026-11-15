import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHr } from '../src/data/liveHr.ts';
const dv = (...b: number[]) => new DataView(new Uint8Array(b).buffer);

test('Bluetooth heart rate packets: 8 bit, 16 bit and RR intervals', () => {
  assert.deepEqual(parseHr(dv(0x00, 72)), { bpm: 72, rr: [] });                       // flags 0: 8 bit value
  assert.equal(parseHr(dv(0x01, 0x2c, 0x01)).bpm, 300);                               // flags 1: 16 bit little endian
  const r = parseHr(dv(0x10, 60, 0x00, 0x04, 0x00, 0x03));                            // RR present: 1024/1024 s = 1000 ms, 768/1024 s = 750 ms
  assert.deepEqual(r, { bpm: 60, rr: [1000, 750] });
  assert.equal(parseHr(dv(0x08, 80, 0x10, 0x00)).bpm, 80);                            // energy expended field is skipped
});
