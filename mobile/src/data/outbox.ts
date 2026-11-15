/**
 * Outbox for the long-distance link. A message (text, voice, video, photo) is saved on the device FIRST. Then it is sent in small
 * pieces; if the link drops, the next try asks the server how much arrived and carries on from there. Nothing is lost when the app is
 * closed, and a retry never creates a duplicate (every message has a client id). This is store and forward on the sender's side.
 */
import { useEffect, useState } from 'react';
import { API_URL, ApiError, api } from '@/api';

export type Target = { type: 'voicemail'; to: 'doctors' | number } | { type: 'family-me'; contactId: number } | { type: 'family-guest'; token: string };
export type OutItem = {
  id: string; clientId: string; createdAt: number; target: Target; kind: 'text' | 'voice' | 'video' | 'photo'; text?: string; seconds?: number; urgent?: boolean;
  mime?: string; blob?: Blob; size?: number; uploadId?: string; sent: number; state: 'queued' | 'sending' | 'delivered' | 'failed'; error?: string;
};

const web = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
const mem = new Map<string, OutItem>();
const subs = new Set<() => void>();
const notify = () => subs.forEach(f => f());

// ---------- storage: IndexedDB when available (survives closing the app), memory otherwise ----------
let dbp: Promise<IDBDatabase> | null = null;
const idb = () => (dbp ??= new Promise((ok, no) => { const r = indexedDB.open('celeste-outbox', 1); r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
const put = async (it: OutItem) => { mem.set(it.id, it); if (!web) return; try { const d = await idb(); d.transaction('items', 'readwrite').objectStore('items').put(it); } catch { /* memory only */ } };
const del = async (id: string) => { mem.delete(id); if (!web) return; try { const d = await idb(); d.transaction('items', 'readwrite').objectStore('items').delete(id); } catch { /* ignore */ } };
let loaded = false;
async function load() {
  if (loaded) return; loaded = true;
  if (!web) return;
  try { const d = await idb(); await new Promise<void>(ok => { const q = d.transaction('items').objectStore('items').getAll(); q.onsuccess = () => { (q.result as OutItem[]).forEach(i => mem.set(i.id, { ...i, state: i.state === 'sending' ? 'queued' : i.state })); ok(); }; q.onerror = () => ok(); }); } catch { /* ignore */ }
  notify();
}

const uid = () => (typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const headersFor = (t: Target): Record<string, string> => (t.type === 'family-guest' ? { 'X-Family-Token': t.token } : {});
const msgPath = (t: Target) => (t.type === 'voicemail' ? '/api/voicemail' : t.type === 'family-me' ? `/api/me/family/${t.contactId}/messages` : `/api/family/${t.token}/messages`);

async function call(path: string, init: RequestInit & { json?: any }, t: Target) {
  const headers: Record<string, string> = { 'X-Requested-With': 'perigee', ...headersFor(t), ...((init.headers as any) ?? {}) };
  if (init.json !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(init.json); }
  const r = await fetch(API_URL + path, { ...init, headers, credentials: 'include' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error ?? `HTTP ${r.status}`), { status: r.status, body });
  return body;
}
const isNetwork = (e: any) => !e?.status; // no status = the link itself failed (fetch threw)

/** Sends one item as far as the link allows. Resolves when delivered; throws on a break (the next round resumes). */
async function deliver(it: OutItem) {
  const t = it.target;
  if (it.kind !== 'text' && it.blob) {
    if (!it.uploadId) {
      const r = await call('/api/upload', { method: 'POST', json: { size: it.blob.size, mime: it.mime || it.blob.type, kind: it.kind } }, t);
      it.uploadId = r.id; await put(it);
    }
    const chunk = 512 * 1024;
    for (;;) {
      let received: number;
      try { received = (await call(`/api/upload/${it.uploadId}`, { method: 'GET' }, t)).received; }
      catch (e: any) { if (e.status === 404) { it.uploadId = undefined; await put(it); } throw e; } // the server forgot it: start the upload again next round
      it.sent = received; notify();
      if (received >= it.blob.size) break;
      const piece = it.blob.slice(received, Math.min(received + chunk, it.blob.size));
      try { await call(`/api/upload/${it.uploadId}?offset=${received}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: piece }, t); }
      catch (e: any) { if (e.status === 409) continue; throw e; } // out of order: ask again where we are
    }
  }
  const body: any = { kind: it.kind, text: it.text, seconds: it.seconds, clientId: it.clientId, uploadId: it.uploadId };
  if (t.type === 'voicemail') { body.to = t.to; body.urgent = !!it.urgent; }
  await call(msgPath(t), { method: 'POST', json: body }, t);
}

let running = false, started = false, delay = 8000;
export async function flush() {
  if (running) return; running = true;
  try {
    await load();
    for (const it of [...mem.values()].sort((a, b) => a.createdAt - b.createdAt)) {
      if (it.state === 'delivered' || it.state === 'failed') continue;
      it.state = 'sending'; it.error = undefined; notify();
      try { await deliver(it); it.state = 'delivered'; it.sent = it.size ?? it.sent; await put(it); notify(); setTimeout(() => { del(it.id); notify(); }, 6000); delay = 8000; }
      catch (e: any) {
        if (isNetwork(e) || e.status === 429 || e.status >= 500) { it.state = 'queued'; it.error = 'Waiting for the link'; await put(it); notify(); delay = Math.min(delay * 2, 120000); break; }
        it.state = 'failed'; it.error = e.message; await put(it); notify(); // the server refused it (too large, not allowed): do not retry forever
      }
    }
  } finally { running = false; }
}

/** Call once. Retries every few seconds, and the moment the browser says the link is back. */
export function startOutbox() {
  if (started || typeof window === 'undefined') return; started = true;
  load().then(flush);
  const tick = () => { flush(); setTimeout(tick, delay); };
  setTimeout(tick, delay);
  window.addEventListener('online', () => { delay = 8000; flush(); });
}

export async function enqueue(p: { target: Target; kind: OutItem['kind']; text?: string; blob?: Blob; seconds?: number; urgent?: boolean }): Promise<OutItem> {
  await load();
  const it: OutItem = { id: uid(), clientId: uid(), createdAt: Date.now(), target: p.target, kind: p.kind, text: p.text, seconds: p.seconds, urgent: p.urgent, mime: p.blob?.type.split(';')[0], blob: p.blob, size: p.blob?.size, sent: 0, state: 'queued' };
  await put(it); notify(); startOutbox(); delay = 8000; flush();
  return it;
}
export const retryFailed = async () => { for (const it of mem.values()) if (it.state === 'failed') { it.state = 'queued'; it.error = undefined; it.uploadId = undefined; await put(it); } notify(); flush(); };
export const discard = async (id: string) => { await del(id); notify(); };

export function useOutbox(match?: (t: Target) => boolean): OutItem[] {
  const [, set] = useState(0);
  useEffect(() => { load(); startOutbox(); const f = () => set(n => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return [...mem.values()].filter(i => !match || match(i.target)).sort((a, b) => a.createdAt - b.createdAt);
}
