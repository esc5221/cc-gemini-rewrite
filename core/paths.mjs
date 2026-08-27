// Plugin root + user runtime home (~/.claude/cc-gemini-rewrite), overridable.
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

export const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = process.env.CCR_HOME || join(homedir(), '.claude', 'cc-gemini-rewrite');

export const P = {
  pkg: PKG, home: HOME,
  defaults: join(PKG, 'defaults', 'config.json'),
  prompts:  join(PKG, 'prompts', 'rewrite-ko.json'),
  config:   join(HOME, 'config.json'),
  state:    join(HOME, 'state.json'),
  requests: join(HOME, 'requests'),
  buffers:  join(HOME, 'buffers'),
  history:  join(HOME, 'history.jsonl'),
  log:      join(HOME, 'hook.log'),
};
export function ensureHome() {
  for (const d of [P.home, P.requests, P.buffers]) { try { mkdirSync(d, { recursive: true, mode: 0o700 }); } catch {} }
}
