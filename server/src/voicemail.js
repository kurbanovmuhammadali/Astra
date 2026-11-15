/**
 * Delay-tolerant voice messages ("store and forward"), the way real deep-space links work.
 * A live call needs a round trip of a few seconds at most. On a link where the signal needs minutes to cross (Mars: 4 to 24 min
 * one way) people record a short message, it is held and delivered when the other side is reachable, and played when they like.
 * Messages live for 7 days at most and are deleted as soon as the person removes them.
 *
 *   POST   /api/voicemail            { to: 'doctors' | <astronaut id>, audio: 'data:audio/...;base64,...', seconds }
 *   GET    /api/voicemail            inbox (astronaut: messages for me; doctor: messages sent to the doctors)
 *   GET    /api/voicemail/:id/audio  the recording (marks it as heard by the recipient)
 *   DELETE /api/voicemail/:id
 */
import { db } from './db.js';
import { requireAuth, rateLimit } from './auth.js';
import { isAdmin } from './roles.js';

db.exec(`CREATE TABLE IF NOT EXISTS voicemails (
  id INTEGER PRIMARY KEY, from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, to_user INTEGER REFERENCES users(id) ON DELETE CASCADE,
  seconds INTEGER NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), played_at TEXT
);`);
const bad = (res, m, c = 400) => res.status(c).json({ error: m });
const MAX_B64 = 680_000; // about 500 KB of audio: 60 to 90 s of speech at low bitrate
const MIME = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;.*)?$/i;

export function mountVoicemail(app) {
  app.post('/api/voicemail', requireAuth, (req, res) => {
    if (!rateLimit(`vm:${req.user.id}`, 30, 3600e3)) return bad(res, 'Too many messages this hour.', 429);
    const admin = isAdmin(req.user);
    const m = /^data:([^;,]+(?:;[^;,]+)*);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.audio ?? ''));
    if (!m || !MIME.test(m[1])) return bad(res, 'Send an audio recording.');
    if (m[2].length > MAX_B64) return bad(res, 'That message is too long (90 seconds at most).', 413);
    const seconds = Math.max(1, Math.min(90, Math.round(Number(req.body?.seconds) || 1)));
    let to = null;
    if (req.body?.to === 'doctors') { if (admin) return bad(res, 'Doctors write to a named astronaut.'); }
    else {
      if (!admin) return bad(res, 'You can leave a message for the doctors.', 403);
      to = Number(req.body?.to);
      if (!db.prepare("SELECT 1 FROM users WHERE id = ? AND role IN ('astronaut','analog')").get(to)) return bad(res, 'Astronaut not found.', 404);
    }
    const id = db.prepare('INSERT INTO voicemails (from_user, to_user, seconds, mime, data) VALUES (?,?,?,?,?)').run(req.user.id, to, seconds, m[1], Buffer.from(m[2], 'base64')).lastInsertRowid;
    res.json({ ok: true, id: Number(id) });
  });

  app.get('/api/voicemail', requireAuth, (req, res) => {
    const admin = isAdmin(req.user);
    const rows = admin
      ? db.prepare("SELECT v.id, v.seconds, v.created_at AS at, v.played_at AS playedAt, u.name AS fromName, v.from_user AS fromId FROM voicemails v JOIN users u ON u.id = v.from_user WHERE v.to_user IS NULL ORDER BY v.id DESC LIMIT 50").all()
      : db.prepare("SELECT v.id, v.seconds, v.created_at AS at, v.played_at AS playedAt, u.name AS fromName, v.from_user AS fromId FROM voicemails v JOIN users u ON u.id = v.from_user WHERE v.to_user = ? ORDER BY v.id DESC LIMIT 50").all(req.user.id);
    res.json({ messages: rows, unheard: rows.filter(r => !r.playedAt).length });
  });

  app.get('/api/voicemail/:id/audio', requireAuth, (req, res) => {
    const v = db.prepare('SELECT * FROM voicemails WHERE id = ?').get(Number(req.params.id));
    if (!v) return bad(res, 'Not found.', 404);
    const admin = isAdmin(req.user);
    const recipient = v.to_user === req.user.id || (v.to_user == null && admin);
    if (!recipient && v.from_user !== req.user.id) return bad(res, 'Not found.', 404);
    if (recipient && !v.played_at) db.prepare("UPDATE voicemails SET played_at = datetime('now') WHERE id = ?").run(v.id);
    res.set({ 'Content-Type': v.mime, 'Cache-Control': 'no-store' }).send(Buffer.from(v.data));
  });

  app.delete('/api/voicemail/:id', requireAuth, (req, res) => {
    const v = db.prepare('SELECT * FROM voicemails WHERE id = ?').get(Number(req.params.id));
    if (!v) return res.json({ ok: true });
    const admin = isAdmin(req.user);
    if (v.from_user !== req.user.id && v.to_user !== req.user.id && !(v.to_user == null && admin)) return bad(res, 'Not found.', 404);
    db.prepare('DELETE FROM voicemails WHERE id = ?').run(v.id);
    res.json({ ok: true });
  });

  const sweep = () => db.prepare("DELETE FROM voicemails WHERE created_at < datetime('now','-7 days')").run();
  sweep(); setInterval(sweep, 3600e3).unref?.();
}
