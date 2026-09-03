// One-shot manual /rewrite request, keyed by Claude session id, short TTL, atomic claim.
//
// Keying by cwd crossed the wires when two sessions ran in the same folder. The session id
// is available exactly on both sides: rewrite.mjs runs as a Bash child and inherits
// CLAUDE_CODE_SESSION_ID, and the MessageDisplay hook input carries session_id.
import { writeFileSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { P, ensureHome } from './paths.mjs';

const TTL = 30000;
const safe = (sid) => String(sid || 'none').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
const file = (sid) => join(P.requests, safe(sid) + '.json');

export function armRequest(sessionId, note = '', rewrite = null) {
  ensureHome();
  const f = file(sessionId), tmp = f + '.tmp';
  writeFileSync(tmp, JSON.stringify({ ts: Date.now(), note, rewrite, sessionId }), { mode: 0o600 });
  renameSync(tmp, f);
  return f;
}
// peek: don't consume (used on non-final deltas). Otherwise claim+delete (final).
export function takeRequest(sessionId, { peek = false } = {}) {
  const f = file(sessionId);
  let r; try { r = JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
  if (Date.now() - (r.ts || 0) > TTL) { try { rmSync(f, { force: true }); } catch {} return null; }
  if (!peek) { try { rmSync(f, { force: true }); } catch {} }
  return { note: r.note || '', rewrite: r.rewrite || null };
}
