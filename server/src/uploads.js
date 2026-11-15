/**
 * Resumable uploads for the long-distance link. A slow, interrupted link (Mars: minutes of delay, hours of silence) cannot carry one big
 * request, so a video is cut into small chunks. The server remembers how many bytes arrived; after a break the sender asks
 * "how much do you have?" and carries on from there. The message is created only when the file is complete, with a client id so a
 * retry can never create a duplicate.
 *
 *   POST /api/upload                 { size, mime, kind }          -> { id, chunk }
 *   GET  /api/upload/:id                                           -> { received, size }
 *   PUT  /api/upload/:id?offset=N    raw bytes (<= 1 MB)           -> { received, done }
 * The owner is a signed-in account, or a family member's private link ("X-Family-Token").
 */
import express from 'express';
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { sessionUser, rateLimit } from './auth.js';
import { MAX_BYTES, validateMime } from './media.js';

db.exec(`
CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, owner TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS upload_chunks (upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE, offset INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (upload_id, offset));
`);
const CHUNK = 512 * 1024;
const bad = (res, m, c = 400) => res.status(c).json({ error: m });

export function ownerOf(req) {
  const s = sessionUser(req); if (s) return `u:${s.user.id}`;
  const t = String(req.get('x-family-token') || '');
  if (/^[A-Za-z0-9_-]{20,64}$/.test(t)) { const f = db.prepare('SELECT id FROM family_contacts WHERE token = ?').get(t); if (f) return `f:${f.id}`; }
  return null;
}

/** Takes a finished upload (and deletes it). Returns { mime, data } or null. */
export function takeUpload(owner, id) {
  const u = db.prepare('SELECT * FROM uploads WHERE id = ? AND owner = ?').get(String(id), owner);
  if (!u || u.received !== u.size) return null;
  const data = Buffer.concat(db.prepare('SELECT data FROM upload_chunks WHERE upload_id = ? ORDER BY offset').all(u.id).map(r => Buffer.from(r.data)));
  db.prepare('DELETE FROM uploads WHERE id = ?').run(u.id);
  return data.length === u.size ? { mime: u.mime, data } : null;
}

export function mountUploads(app) {
  app.use('/api/upload', express.raw({ type: 'application/octet-stream', limit: '2mb' }));
  app.post('/api/upload', (req, res) => {
    const owner = ownerOf(req); if (!owner) return bad(res, 'Sign in, or use your private link.', 401);
    if (!rateLimit(`upi:${owner}`, 60, 3600e3)) return bad(res, 'Too many uploads. Try again later.', 429);
    const size = Math.round(Number(req.body?.size)), mime = String(req.body?.mime || ''), kind = String(req.body?.kind || '');
    if (!(size > 0 && size <= MAX_BYTES)) return bad(res, 'That file is too large (about 9 MB at most).', 413);
    if (!validateMime(kind, mime)) return bad(res, 'That kind of file is not allowed.');
    if (db.prepare('SELECT COUNT(*) n FROM uploads WHERE owner = ?').get(owner).n >= 6) return bad(res, 'Too many unfinished uploads.', 409);
    const id = randomBytes(12).toString('base64url');
    db.prepare('INSERT INTO uploads (id, owner, mime, size) VALUES (?,?,?,?)').run(id, owner, mime.split(';')[0], size);
    res.json({ id, chunk: CHUNK });
  });
  app.get('/api/upload/:id', (req, res) => {
    const owner = ownerOf(req); const u = owner && db.prepare('SELECT received, size FROM uploads WHERE id = ? AND owner = ?').get(req.params.id, owner);
    if (!u) return bad(res, 'Not found.', 404);
    res.json(u);
  });
  app.put('/api/upload/:id', (req, res) => {
    const owner = ownerOf(req); const u = owner && db.prepare('SELECT * FROM uploads WHERE id = ? AND owner = ?').get(req.params.id, owner);
    if (!u) return bad(res, 'Not found.', 404);
    const offset = Number(req.query.offset), chunk = req.body;
    if (!Buffer.isBuffer(chunk) || !chunk.length || chunk.length > 1024 * 1024) return bad(res, 'Send a chunk of up to 1 MB.');
    if (offset !== u.received) return res.status(409).json({ error: 'Out of order.', received: u.received }); // the sender resumes from here
    if (u.received + chunk.length > u.size) return bad(res, 'More bytes than announced.');
    db.prepare('INSERT INTO upload_chunks (upload_id, offset, data) VALUES (?,?,?)').run(u.id, offset, chunk);
    const received = u.received + chunk.length;
    db.prepare('UPDATE uploads SET received = ? WHERE id = ?').run(received, u.id);
    res.json({ received, done: received === u.size });
  });
  setInterval(() => db.prepare("DELETE FROM uploads WHERE created_at < datetime('now','-1 day')").run(), 3600e3).unref?.();
}
