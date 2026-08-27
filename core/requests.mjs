// One-shot manual /rewrite request, keyed by cwd, short TTL, atomic claim.
import { writeFileSync, readFileSync, rmSync, renameSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { P, ensureHome } from './paths.mjs';

const TTL = 30000;
const norm = (cwd) => { try { return realpathSync(String(cwd || 'nocwd')); } catch { return String(cwd || 'nocwd'); } };
const key = (cwd) => createHash('sha1').update(norm(cwd)).digest('hex').slice(0, 16);
const file = (cwd) => join(P.requests, key(cwd) + '.json');

export function armRequest(cwd, note = '') {
  ensureHome();
  const f = file(cwd), tmp = f + '.tmp';
  writeFileSync(tmp, JSON.stringify({ ts: Date.now(), note, cwd }), { mode: 0o600 });
  renameSync(tmp, f);
  return f;
}
// peek: don't consume (used on non-final deltas). Otherwise claim+delete (final).
export function takeRequest(cwd, { peek = false } = {}) {
  const f = file(cwd);
  let r; try { r = JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
  if (Date.now() - (r.ts || 0) > TTL) { try { rmSync(f, { force: true }); } catch {} return null; }
  if (!peek) { try { rmSync(f, { force: true }); } catch {} }
  return { note: r.note || '' };
}
