/**
 * Health assistant (the "AI" tab): answers questions from the crew member's own data, through Gemini (GEMINI_API_KEY) or Claude
 * (ANTHROPIC_API_KEY). Without a key the endpoint answers 503 and the app uses its offline answers.
 */
import Anthropic from '@anthropic-ai/sdk';
import { geminiOn, geminiCall } from './llm.js';

// Opus 5.5 is the default; set COMPANION_MODEL=claude-haiku-5-5 for a faster, cheaper companion.
const MODEL = process.env.COMPANION_MODEL || 'claude-opus-5-5';
let client;
export const companionConfigured = () => geminiOn() || !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const getClient = () => (client ??= new Anthropic());

const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
export const CRISIS = /(kill myself|suicid|end my life|want to die|don'?t want to (live|be here)|hurt myself|self[- ]harm|no reason to live|disappear forever|better off without me|can'?t go on)/i;

const toMessages = history => {
  const m = (Array.isArray(history) ? history : []).slice(-20)
    .map(x => ({ role: x?.role === 'assistant' ? 'assistant' : 'user', content: clip(x?.text, 1200) }))
    .filter(x => x.content);
  while (m.length && m[0].role !== 'user') m.shift();
  return m;
};

async function call(system, messages, maxTokens) {
  if (geminiOn()) return geminiCall({ system, messages, maxTokens }); // Gemini when its key is set, otherwise Claude below
  const body = { model: MODEL, max_tokens: maxTokens, system, messages, output_config: { effort: 'low' } };
  const run = extra => getClient().beta.messages.create({ ...body, ...extra });
  let r;
  try { r = await run({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }); }
  catch (e) { if (e instanceof Anthropic.BadRequestError) r = await run({}); else throw e; } // fallbacks unsupported here → plain call
  if (r.stop_reason === 'refusal') return { refused: true, text: '' };
  return { refused: false, text: r.content.filter(b => b.type === 'text').map(b => b.text).join('').trim() };
}

// ------------------------------------------------------------------ health assistant (the "AI" tab)
const CARE = 'I am really glad you said that. It sounds heavy, and you deserve real support now, not only an app. Please contact your flight surgeon or behavioral health team right away and follow your mission\'s emergency procedure. If someone is with you, tell them how you feel.';

export function assistantPrompt(context = {}, background = '') {
  const data = JSON.stringify(context, (_k, v) => (typeof v === 'string' ? v.slice(0, 200) : v)).slice(0, 2500);
  return `You are the HMSC health assistant (Health Monitoring System Cometa) for an astronaut crew member on a long mission.

RULES
- Use ONLY the data below. If a value is missing or null, say it is missing. Never invent numbers, results or diagnoses.
- Be concise: at most 6 short sentences, plain language. Explain what the numbers mean for this person, and give one safe next step (rest, hydrate, repeat the measurement, log a symptom, adjust training, or queue a medical handoff).
- You are not a doctor. Never diagnose or prescribe. For red flags (chest pain, shortness of breath, fainting, vision changes, severe headache, thoughts of self-harm) tell them to contact the flight surgeon and follow the emergency procedure now.
- Crews train on ARED, CEVIS and the T2 treadmill, not with push-ups or pull-ups. HMSC is not integrated with that hardware yet.
- Answer in the language the crew member writes in.

DATA (current values from the app; null means no data)
<data>${data}</data>
${background ? `\nPRIVATE BACKGROUND (use it to be relevant; never quote it back)\n<background>\n${clip(background, 1500)}\n</background>\n` : ''}`;
}

/** One assistant turn. Returns { reply, escalate, refused }. */
export async function assistantReply({ messages, context, background }) {
  const msgs = toMessages((Array.isArray(messages) ? messages : []).map(m => ({ role: m?.role === 'user' ? 'user' : 'assistant', text: m?.text })));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw Object.assign(new Error('Send a message first'), { status: 400 });
  if (CRISIS.test(msgs[msgs.length - 1].content)) return { reply: CARE, escalate: true, refused: false };
  const out = await call(assistantPrompt(context, background), msgs, 600);
  return { reply: out.text, escalate: false, refused: out.refused };
}
