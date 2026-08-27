// Read a Claude Code transcript jsonl and expose chat view + walk-back helpers.
import { readFileSync } from 'node:fs';

export function loadTranscript(path) {
  if (!path) return [];
  let raw; try { raw = readFileSync(path, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch {} }
  return out;
}
function textOf(e) {
  const c = e?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter(b => b?.type === 'text').map(b => b.text).join('\n');
  return '';
}
export function toChat(events) {
  const view = [];
  for (const e of events) {
    if ((e.type !== 'user' && e.type !== 'assistant') || e.isMeta) continue;
    const t = textOf(e); if (!t.trim()) continue;
    view.push({ role: e.message?.role || e.type, text: t, id: e.message?.id || e.uuid || null });
  }
  return view;
}
// Last assistant text with length >= minChars, optionally skipping a message id / marker.
export function lastSubstantialAssistant(events, { minChars = 200, skipId = null, skipContains = null } = {}) {
  const chat = toChat(events);
  for (let i = chat.length - 1; i >= 0; i--) {
    const m = chat[i]; if (m.role !== 'assistant') continue;
    if (skipId && m.id === skipId) continue;
    if (skipContains && m.text.includes(skipContains)) continue;
    if ((m.text || '').trim().length >= minChars) return { text: m.text, index: i, id: m.id };
  }
  // fallback: last assistant of any length (still skipping)
  for (let i = chat.length - 1; i >= 0; i--) {
    const m = chat[i]; if (m.role !== 'assistant') continue;
    if (skipContains && m.text.includes(skipContains)) continue;
    if ((m.text || '').trim()) return { text: m.text, index: i, id: m.id };
  }
  return null;
}
export function userQuestionBefore(events, index) {
  const chat = toChat(events);
  for (let i = Math.min(index, chat.length) - 1; i >= 0; i--) if (chat[i].role === 'user') return chat[i].text;
  return '';
}
