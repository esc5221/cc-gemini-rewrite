// Session context loader — parses the current session jsonl into an LLM-ready shape.
// Exposes the full transcript so a real LLM can consume all of it later.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

// cwd -> claude project hash dir name (e.g. /Users/you/project -> -Users-you-project)
export function projectDirForCwd(cwd) {
  return cwd.replace(/[/.]/g, '-');
}

// Resolve the session file: prefer sessionId, else newest jsonl in the cwd project.
function newestJsonlIn(dir) {
  let best = null, bestM = -1;
  let files;
  try { files = readdirSync(dir); } catch { return null; }
  for (const f of files) {
    if (!f.endsWith('.jsonl') || f.startsWith('agent-')) continue;
    const fp = join(dir, f);
    try { const m = statSync(fp).mtimeMs; if (m > bestM) { bestM = m; best = fp; } } catch {}
  }
  return best;
}

export function findSessionFile({ sessionFile, sessionId, cwd } = {}) {
  if (sessionFile) return sessionFile;
  // If sessionId is given, use it (cwd project first).
  if (sessionId) {
    const cand = [];
    if (cwd) cand.push(join(PROJECTS_DIR, projectDirForCwd(cwd), `${sessionId}.jsonl`));
    try { for (const d of readdirSync(PROJECTS_DIR)) cand.push(join(PROJECTS_DIR, d, `${sessionId}.jsonl`)); } catch {}
    for (const p of cand) { try { statSync(p); return p; } catch {} }
  }
  // With a cwd, pick the newest session in that project that has assistant text
  // (turn-end fires right after an answer, so skip freshly-opened empty sessions).
  if (cwd) {
    // The active session is the one being written right now = newest mtime.
    // Don't skip a session whose LAST assistant message is empty: on a manual
    // /rewrite turn the current session's last message is the short slash-ack, and
    // skipping it would wrongly jump to an older session in the same folder. The
    // server looks back within this file for the last substantive answer.
    const active = newestJsonlIn(join(PROJECTS_DIR, projectDirForCwd(cwd)));
    if (active) return active;
  }
  // Global newest only when there is no cwd or the cwd dir is empty.
  let best = null, bestM = -1;
  try {
    for (const d of readdirSync(PROJECTS_DIR)) {
      const fp = newestJsonlIn(join(PROJECTS_DIR, d));
      if (!fp) continue;
      try { const m = statSync(fp).mtimeMs; if (m > bestM) { bestM = m; best = fp; } } catch {}
    }
  } catch {}
  return best;
}

// jsonl -> event array (full context). Skips unparseable lines.
export function loadTranscript(file) {
  if (!file) return [];
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

// Text-only chat view for LLM input. role/text only.
export function toChatView(events) {
  const view = [];
  for (const e of events) {
    if (e.type !== 'user' && e.type !== 'assistant') continue;
    if (e.isMeta) continue;
    const msg = e.message;
    if (!msg) continue;
    let text = '';
    if (typeof msg.content === 'string') text = msg.content;
    else if (Array.isArray(msg.content))
      text = msg.content.filter(b => b?.type === 'text').map(b => b.text).join('\n');
    if (!text.trim()) continue;
    view.push({ role: msg.role || e.type, text });
  }
  return view;
}

// Last assistant text (used by the trigger).
export function lastAssistantText(events) {
  const chat = toChatView(events);
  for (let i = chat.length - 1; i >= 0; i--)
    if (chat[i].role === 'assistant') return chat[i].text;
  return '';
}

// Standard context object passed to the handler.
export function buildContext(payload = {}) {
  const file = findSessionFile(payload);
  const events = loadTranscript(file);
  const chat = toChatView(events);
  const lastAssistant = (() => { for (let i=chat.length-1;i>=0;i--) if (chat[i].role==='assistant') return chat[i].text; return ''; })();
  const lastUser = (() => { for (let i=chat.length-1;i>=0;i--) if (chat[i].role==='user') return chat[i].text; return ''; })();
  return { sessionId: payload.sessionId || null, cwd: payload.cwd || '', sessionFile: file, events, chat, lastAssistant, lastUser };
}
