/**
 * Messages for a link that is too slow for a conversation ("store and forward", like real deep-space networks).
 * Far from Earth the signal needs minutes to cross (Mars 4 to 24 min one way), so a live call is pointless. People send text,
 * a short voice message or a short compressed video; it is held, sent when the link is up and played whenever the other side likes.
 * Messages live 7 days at most and vanish when removed. LINK_DELAY_SIM=on makes the server really hold each message for the
 * astronaut's signal time (to rehearse the delay); off by default so demos stay fast.
 *
 *   POST   /api/voicemail            { to: 'doctors' | <astronaut id>, kind: 'text'|'voice'|'video', text?, media?: 'data:...;base64,...', seconds?, urgent? }
 *   GET    /api/voicemail            inbox (astronaut: for me; doctor: sent to the doctors) + outbox with "in transit"
 *   GET    /api/voicemail/:id/media  the recording (marks it as heard by the recipient)
 *   DELETE /api/voicemail/:id
 */
import { db } from './db.js';
import { requireAuth, rateLimit } from './auth.js';
import { isAdmin } from './roles.js';
import { delayMinFor } from './linkdelay.js';
import { parseMedia, parseUploaded } from './media.js';
import { takeUpload } from './uploads.js';

db.exec(`CREATE TABLE IF NOT EXISTS voicemails (
  id INTEGER PRIMARY KEY, from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, to_user INTEGER REFERENCES users(id) ON DELETE CASCADE,
  seconds INTEGER NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), played_at TEXT
);`);
for (const col of ["kind TEXT NOT NULL DEFAULT 'voice'", 'body TEXT', 'deliver_at TEXT', 'urgent INTEGER NOT NULL DEFAULT 0', 'client_id TEXT']) { try { db.exec(`ALTER TABLE voicemails ADD COLUMN ${col}`); } catch { /* already there */ } }

const bad = (res, m, c = 400) => res.status(c).json({ error: m });
const sim = () => process.env.LINK_DELAY_SIM === 'on';
const sqlAt = t => new Date(t).toISOString().slice(0, 19).replace('T', ' ');

export function mountVoicemail(app) {
  app.post('/api/voicemail', requireAuth, (req, res) => {
    if (!rateLimit(`vm:${req.user.id}`, 40, 3600e3)) return bad(res, 'Too many messages this hour.', 429);
    const admin = isAdmin(req.user);
    if (req.body?.clientId && db.prepare('SELECT 1 FROM voicemails WHERE from_user = ? AND client_id = ?').get(req.user.id, String(req.body.clientId).slice(0, 60))) return res.json({ ok: true, duplicate: true }); // a retry never makes a second copy
    const parsed = req.body?.uploadId ? parseUploaded(req.body, takeUpload(`u:${req.user.id}`, req.body.uploadId)) : parseMedia(req.body);
    if (parsed.error) return bad(res, parsed.error, parsed.status ?? 400);
    const { kind, text: body, mime, data, seconds } = parsed;
    let to = null;
    if (req.body?.to === 'doctors') { if (admin) return bad(res, 'Doctors write to a named astronaut.'); }
    else {
      if (!admin) return bad(res, 'You can write to the doctors.', 403);
      to = Number(req.body?.to);
      if (!db.prepare("SELECT 1 FROM users WHERE id = ? AND role IN ('astronaut','analog')").get(to)) return bad(res, 'Astronaut not found.', 404);
    }
    const astro = db.prepare('SELECT environment, mission_goal FROM users WHERE id = ?').get(admin ? to : req.user.id);
    const when = sim() ? Date.now() + delayMinFor(astro) * 60e3 : Date.now();
    const id = db.prepare('INSERT INTO voicemails (from_user, to_user, seconds, mime, data, kind, body, deliver_at, urgent, client_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(req.user.id, to, seconds, mime, data, kind, body, sqlAt(when), req.body?.urgent ? 1 : 0, req.body?.clientId ? String(req.body.clientId).slice(0, 60) : null).lastInsertRowid;
    res.json({ ok: true, id: Number(id), arrivesAt: sqlAt(when), inTransit: when > Date.now() + 1000 });
  });

  const view = r => ({ id: r.id, kind: r.kind, text: r.body, seconds: r.seconds, urgent: !!r.urgent, at: r.created_at, arrivesAt: r.deliver_at, playedAt: r.played_at, fromName: r.fromName, fromId: r.from_user, toName: r.toName ?? null });
  app.get('/api/voicemail', requireAuth, (req, res) => {
    const admin = isAdmin(req.user);
    const cols = 'v.id, v.kind, v.body, v.seconds, v.urgent, v.created_at, v.deliver_at, v.played_at, v.from_user, u.name AS fromName, t.name AS toName';
    const join = 'FROM voicemails v JOIN users u ON u.id = v.from_user LEFT JOIN users t ON t.id = v.to_user';
    const inbox = admin
      ? db.prepare(`SELECT ${cols} ${join} WHERE v.to_user IS NULL AND v.deliver_at <= datetime('now') ORDER BY v.urgent DESC, v.id DESC LIMIT 60`).all()
      : db.prepare(`SELECT ${cols} ${join} WHERE v.to_user = ? AND v.deliver_at <= datetime('now') ORDER BY v.urgent DESC, v.id DESC LIMIT 60`).all(req.user.id);
    const outbox = db.prepare(`SELECT ${cols} ${join} WHERE v.from_user = ? ORDER BY v.id DESC LIMIT 15`).all(req.user.id).map(view).map(m => ({ ...m, inTransit: Date.parse(m.arrivesAt.replace(' ', 'T') + 'Z') > Date.now() }));
    res.json({ messages: inbox.map(view), unheard: inbox.filter(r => !r.played_at).length, outbox });
  });

  const media = (req, res) => {
    const v = db.prepare('SELECT * FROM voicemails WHERE id = ?').get(Number(req.params.id));
    if (!v || v.kind === 'text') return bad(res, 'Not found.', 404);
    const admin = isAdmin(req.user);
    const recipient = v.to_user === req.user.id || (v.to_user == null && admin);
    if (!recipient && v.from_user !== req.user.id) return bad(res, 'Not found.', 404);
    if (recipient && v.deliver_at > sqlAt(Date.now())) return bad(res, 'Still in transit.', 425);
    if (recipient && !v.played_at) db.prepare("UPDATE voicemails SET played_at = datetime('now') WHERE id = ?").run(v.id);
    res.set({ 'Content-Type': v.mime, 'Cache-Control': 'no-store' }).send(Buffer.from(v.data));
  };
  app.get('/api/voicemail/:id/media', requireAuth, media);
  app.get('/api/voicemail/:id/audio', requireAuth, media); // older name

  app.post('/api/voicemail/:id/heard', requireAuth, (req, res) => { // text messages are "heard" when opened
    const v = db.prepare('SELECT * FROM voicemails WHERE id = ?').get(Number(req.params.id));
    if (v && (v.to_user === req.user.id || (v.to_user == null && isAdmin(req.user))) && !v.played_at) db.prepare("UPDATE voicemails SET played_at = datetime('now') WHERE id = ?").run(v.id);
    res.json({ ok: true });
  });

  app.delete('/api/voicemail/:id', requireAuth, (req, res) => {
    const v = db.prepare('SELECT * FROM voicemails WHERE id = ?').get(Number(req.params.id));
    if (!v) return res.json({ ok: true });
    if (v.from_user !== req.user.id && v.to_user !== req.user.id && !(v.to_user == null && isAdmin(req.user))) return bad(res, 'Not found.', 404);
    db.prepare('DELETE FROM voicemails WHERE id = ?').run(v.id);
    res.json({ ok: true });
  });

  const sweep = () => db.prepare("DELETE FROM voicemails WHERE created_at < datetime('now','-7 days')").run();
  sweep(); setInterval(sweep, 3600e3).unref?.();
}
