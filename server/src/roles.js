import { requireAuth } from './auth.js';

/** Admin = flight surgeon role, or an email listed in ADMIN_EMAILS (comma separated). */
const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export const isAdmin = u => u.role === 'surgeon' || adminEmails().includes(String(u.email).toLowerCase());
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => (isAdmin(req.user) ? next() : res.status(403).json({ error: 'Flight surgeon access only.' })));
}
