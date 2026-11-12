/**
 * Which AI provider the server uses, and a small Gemini client (plain HTTPS, no SDK).
 *  - GEMINI_API_KEY    -> Google Gemini      (GEMINI_MODEL, default "gemini-flash-latest")
 *  - ANTHROPIC_API_KEY -> Anthropic Claude   (ASTRA_AI_MODEL)
 *  - AI_PROVIDER=gemini|anthropic picks one when both keys are set; otherwise Gemini wins if its key exists.
 * The key travels in the x-goog-api-key header (never in the URL, so it cannot end up in logs). It is never sent to the browser.
 * Only readings or one photo are sent; never a name, e-mail or id.
 */
export const PROVIDER_LABEL = { gemini: 'Google Gemini', anthropic: 'Anthropic Claude' };

export function llmProvider() {
  const want = process.env.AI_PROVIDER;
  if (want === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (want === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';

/**
 * messages: [{ role: 'user'|'assistant', content }]. image: { mediaType, data(base64) } is attached to the first user message.
 * Returns { text, blocked }. Throws on network or API errors (status carried on the error for the caller to map).
 */
export async function geminiGenerate({ system, messages, image, json = false, maxTokens = 1200 }) {
  const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
  if (image) contents.find(c => c.role === 'user')?.parts.unshift({ inline_data: { mime_type: image.mediaType, data: image.data } });
  const body = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3, ...(json ? { responseMimeType: 'application/json' } : {}) },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };
  const r = await fetch(`${BASE}/${encodeURIComponent(geminiModel())}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 200).replace(process.env.GEMINI_API_KEY || '\u0000', '[key]');
    throw Object.assign(new Error(`Gemini ${r.status}: ${detail}`), { status: r.status });
  }
  const j = await r.json();
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map(p => p.text ?? '').join('').trim();
  const blocked = !!j.promptFeedback?.blockReason || cand?.finishReason === 'SAFETY' || !text;
  return { text, blocked };
}
