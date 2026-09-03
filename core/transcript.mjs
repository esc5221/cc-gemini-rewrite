// Read a Claude Code transcript jsonl and expose chat view + walk-back helpers.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Resolve the transcript by session id. Session ids are globally unique, so nothing is guessed.
// (The old path picked the newest-mtime jsonl in the cwd project folder; with several sessions
//  in one folder it grabbed another session's transcript — 90 measured misses. Now dropped.)
export function sessionFileById(sessionId) {
  if (!sessionId) return null;
  const root = join(homedir(), '.claude', 'projects');
  let dirs; try { dirs = readdirSync(root); } catch { return null; }
  for (const d of dirs) {
    const p = join(root, d, `${sessionId}.jsonl`);
    try { if (statSync(p).isFile()) return p; } catch {}
  }
  return null;
}

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
// Pick what to re-explain.
//
// A fixed length threshold does not work. The answers wrongly picked in practice were
// 22/43/71/78/132 chars while the real ones were 2,904-13,568 — and a legitimate 180-char
// answer sits between them. Any fixed line gets one side wrong. So choose by ratio against
// the longest candidate in the recent window: in a session where every answer is short the
// ratios are all near 1, so the most recent one wins on its own.
const MIN_ABS = 40;      // below this there is nothing to re-explain
const MIN_RATIO = 0.25;  // under a quarter of the window's longest = an aside, not the answer

export function lastSubstantialAssistant(events, { skipId = null, skipContains = null, maxLookback = 8 } = {}) {
  const chat = toChat(events);
  const skip = (m) => (skipId && m.id === skipId) || (skipContains && m.text.includes(skipContains));

  const window = [];
  for (let i = chat.length - 1; i >= 0 && window.length < maxLookback; i--) {
    const m = chat[i];
    if (m.role !== 'assistant' || skip(m) || !(m.text || '').trim()) continue;
    window.push({ text: m.text, index: i, id: m.id, len: m.text.trim().length });
  }
  if (!window.length) return null;

  const max = Math.max(...window.map((w) => w.len));
  const floor = Math.max(MIN_ABS, max * MIN_RATIO);
  for (const w of window) if (w.len >= floor) return { text: w.text, index: w.index, id: w.id };
  return { text: window[0].text, index: window[0].index, id: window[0].id };   // unreachable: the longest always passes
}
export function userQuestionBefore(events, index) {
  const chat = toChat(events);
  for (let i = Math.min(index, chat.length) - 1; i >= 0; i--) if (chat[i].role === 'user') return chat[i].text;
  return '';
}
