// Resolves package root and the single user home (~/.cc-turn-ext), with overrides.
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

export const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');  // repo root

// User home: $CC_TURN_EXT_HOME > $XDG_CONFIG_HOME/cc-turn-ext > ~/.cc-turn-ext
export const HOME = process.env.CC_TURN_EXT_HOME
  || (process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, 'cc-turn-ext') : join(homedir(), '.cc-turn-ext'));

export const P = {
  pkg: PKG,
  home: HOME,
  defaults:     join(PKG, 'defaults', 'config.json'),
  userConfig:   join(HOME, 'config.json'),
  userPrompts:  join(HOME, 'prompts.json'),
  userHandlers: join(HOME, 'handlers'),
  state:        join(HOME, 'state.json'),
  history:      join(HOME, 'history.jsonl'),
  cache:        join(HOME, 'cache'),
  sidecarLog:   join(HOME, 'sidecar.log'),
};

export function ensureHome() { try { mkdirSync(P.cache, { recursive: true }); mkdirSync(P.userHandlers, { recursive: true }); } catch {} }
