// Runtime state (policy + override) + activity log, under the user home.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { P, ensureHome } from '../paths.mjs';
ensureHome();

const DEFAULT = { policy: 'off', override: {} };
const read = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

export function readState() { return { ...DEFAULT, ...(read(P.state) || {}) }; }
export function writeState(patch) {
  const cur = readState(); const next = { ...cur, ...patch };
  if (patch.override) next.override = { ...cur.override, ...patch.override };
  writeFileSync(P.state, JSON.stringify(next, null, 2)); return next;
}
export function logFire(rec) { try { appendFileSync(P.history, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n', { mode: 0o600 }); } catch {} }
export function readHistory(limit = 50) {
  try { return readFileSync(P.history, 'utf8').trim().split('\n').filter(Boolean).slice(-limit).reverse().map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
  catch { return []; }
}
