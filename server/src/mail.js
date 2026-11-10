/**
 * Outbound email. Providers (first match wins; force one with MAIL_PROVIDER=resend|smtp|none):
 *   RESEND_API_KEY  -> Resend HTTP API (https://resend.com) — no extra dependency
 *   SMTP_URL        -> any SMTP server via nodemailer, e.g. smtps://user:pass@smtp.example.com:465
 * MAIL_FROM sets the sender, e.g. "Astra <no-reply@yourdomain.com>" (the domain must be verified with your provider).
 * Resend's shared sender (onboarding@resend.dev, the default here) only delivers to the Resend account owner's own address.
 */
let override = null;
/** Test hook: replace delivery with fn({from,to,subject,text,html}). Pass null to restore. */
export const setMailTransport = fn => { override = fn; };

export function mailProvider() {
  if (override) return 'custom';
  const forced = String(process.env.MAIL_PROVIDER || '').toLowerCase();
  if (['resend', 'smtp', 'none'].includes(forced)) return forced;
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_URL) return 'smtp';
  return 'none';
}
export const mailConfigured = () => mailProvider() !== 'none';

export async function sendMail({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || 'Astra <onboarding@resend.dev>';
  const p = mailProvider();
  if (p === 'custom') return override({ from, to, subject, text, html });
  if (p === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Resend rejected the message (${r.status}): ${(await r.text()).slice(0, 200)}`);
    return;
  }
  if (p === 'smtp') {
    const { default: nodemailer } = await import('nodemailer');
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from, to, subject, text, html });
    return;
  }
  throw new Error('No mail provider configured.');
}

export function verificationEmail(code, purpose, minutes = 10) {
  const what = purpose === 'login' ? 'log in to' : 'finish creating your account on';
  return {
    subject: `Your Astra verification code: ${code}`,
    text: `Your Astra code is ${code}\n\nEnter it to ${what} Astra. It expires in ${minutes} minutes and works once.\n\nIf you did not ask for this, ignore this email — nobody can use the code without access to this inbox. Astra will never ask you for it by phone or chat.`,
    html: `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:420px;margin:auto;color:#2B1E18">
<p style="font-size:13px;letter-spacing:.12em;color:#B8693F;font-weight:600">ASTRA</p>
<p style="font-size:15px">Enter this code to ${what} Astra:</p>
<p style="font-size:34px;letter-spacing:.35em;font-weight:700;margin:18px 0">${code}</p>
<p style="font-size:13px;color:#6E5A50">It expires in ${minutes} minutes and works once. If you did not ask for it, ignore this email — nobody can use the code without access to this inbox. Astra will never ask for it by phone or chat.</p></div>`,
  };
}

export function noticeEmail(kind) {
  return kind === 'exists'
    ? { subject: 'Astra: you already have an account', text: 'Someone (hopefully you) tried to create an Astra account with this email, but one already exists. Use "Log in" in the app instead. If this was not you, no action is needed.' }
    : { subject: 'Astra sign-in attempt', text: 'Someone asked to log in to Astra with this email, but no account exists for it. If it was you, use "Get started" to create one. If not, you can ignore this email.' };
}
