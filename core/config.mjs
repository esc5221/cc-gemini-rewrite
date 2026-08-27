// Merged config: defaults/config.json < ~/.claude/cc-gemini-rewrite/config.json
//   < state.json (runtime toggles) < env (CCR_*). Prompts from prompts/rewrite-ko.json.
import { readFileSync } from 'node:fs';
import { P } from './paths.mjs';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; } };
function deepMerge(a, b) {
  const o = { ...a };
  for (const k of Object.keys(b || {})) {
    o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? deepMerge(a?.[k] || {}, b[k]) : b[k];
  }
  return o;
}

export function loadConfig() {
  let cfg = deepMerge(readJson(P.defaults), readJson(P.config));
  const st = readJson(P.state);
  if (st.policy) cfg.policy = { ...cfg.policy, name: st.policy };
  if (st.mode) cfg.mode = st.mode;
  if (typeof st.enabled === 'boolean') cfg.enabled = st.enabled;
  if (st.override) cfg = deepMerge(cfg, st.override);

  const pr = cfg.provider || (cfg.provider = {});
  if (process.env.CCR_BASE) pr.baseUrl = process.env.CCR_BASE;
  if (process.env.CCR_MODEL) pr.model = process.env.CCR_MODEL;
  if (process.env.CCR_KEY) pr.apiKey = process.env.CCR_KEY;
  if (process.env.CCR_KEY_ENV) pr.apiKeyEnv = process.env.CCR_KEY_ENV;
  if (process.env.CCR_KEY_KEYCHAIN) pr.apiKeyKeychain = process.env.CCR_KEY_KEYCHAIN;
  if (process.env.CCR_POLICY) cfg.policy = { ...cfg.policy, name: process.env.CCR_POLICY };
  if (process.env.CCR_MODE) cfg.mode = process.env.CCR_MODE;
  if (process.env.CCR_ENABLED) cfg.enabled = process.env.CCR_ENABLED !== '0';

  cfg.prompts = readJson(P.prompts);
  return cfg;
}
