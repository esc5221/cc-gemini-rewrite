// Effective config = merge of, lowest→highest precedence:
//   package defaults  <  handler prompts  <  user config  <  user prompts  <  runtime state  <  env
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { P, PKG, HOME } from './paths.mjs';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; } };
const merge = (a, b) => { const o = { ...a }; for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k] || {}, b[k]) : b[k]; return o; };

// Resolve a handler module path: user handlers dir first, then package-relative, then absolute.
export function resolveHandlerPath(rel) {
  if (!rel) return null;
  if (isAbsolute(rel)) return rel;
  const userP = resolve(HOME, rel.startsWith('handlers/') ? rel : `handlers/${rel}`);
  try { readFileSync(userP); return userP; } catch {}
  return resolve(PKG, rel);
}

export function loadConfig() {
  const defaults = readJson(P.defaults);
  // handler prompts (from the selected handler's dir, package side)
  const handlerRel = defaults.handler?.module || '';
  const handlerDir = handlerRel ? resolve(PKG, handlerRel, '..') : null;
  const handlerPrompts = handlerDir ? readJson(resolve(handlerDir, 'prompts.json')) : {};

  let cfg = { ...defaults, prompts: { ...handlerPrompts } };
  cfg = merge(cfg, readJson(P.userConfig));
  cfg.prompts = merge(cfg.prompts, readJson(P.userPrompts));

  // runtime state: { policy: <name>, override: {...} }
  const state = readJson(P.state);
  if (state.policy) cfg.policy = { ...cfg.policy, name: state.policy };
  if (state.override) {
    // override may touch provider.model, policy thresholds, or prompts (flat keys from dashboard)
    const ov = state.override;
    if (ov.model) cfg.provider = { ...cfg.provider, model: ov.model };
    for (const k of ['alwaysLines','judgeMinLines']) if (ov[k] != null && ov[k] !== '') cfg.policy = { ...cfg.policy, [k]: Number(ov[k]) };
    for (const k of ['judgePrompt','respondPrompt','header','maxTurns']) if (ov[k]) cfg.prompts = { ...cfg.prompts, [k]: ov[k] };
  }

  // env overrides
  if (process.env.CC_LLM_BASE)  cfg.provider = { ...cfg.provider, baseUrl: process.env.CC_LLM_BASE };
  if (process.env.CC_LLM_MODEL) cfg.provider = { ...cfg.provider, model: process.env.CC_LLM_MODEL };
  if (process.env.CC_POLICY)    cfg.policy   = { ...cfg.policy, name: process.env.CC_POLICY };
  if (process.env.CC_PORT)      cfg.port     = Number(process.env.CC_PORT);

  return cfg;
}
