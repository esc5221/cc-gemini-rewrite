// Runtime toggles (policy / mode / enabled) in state.json. Atomic writes.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { P, ensureHome } from './paths.mjs';

const DEFAULT = { policy: null, mode: null, enabled: null, override: {} };
export function readState() { try { return { ...DEFAULT, ...JSON.parse(readFileSync(P.state, 'utf8')) }; } catch { return { ...DEFAULT }; } }
export function writeState(patch) {
  ensureHome();
  const next = { ...readState(), ...patch };
  const tmp = P.state + '.tmp';
  writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  renameSync(tmp, P.state);
  return next;
}
