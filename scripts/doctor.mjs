#!/usr/bin/env node
// /rewrite-doctor — preflight checks.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig } from '../core/config.mjs';
import { chat } from '../core/provider.mjs';
import { P } from '../core/paths.mjs';

const ok = (b) => b ? '✓' : '✗';
async function main() {
  const cfg = loadConfig();
  console.log('cc-gemini-rewrite · doctor\n');

  let ver = '';
  try { ver = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(); } catch {}
  console.log(`${ok(!!ver)} claude CLI: ${ver || 'not found in PATH'}`);
  console.log(`${ok(true)} node: ${process.version}`);
  console.log(`${ok(existsSync(P.config))} user config: ${P.config}${existsSync(P.config) ? '' : ' (missing — using defaults)'}`);
  console.log(`  provider: ${cfg.provider?.baseUrl}  ${cfg.provider?.model}`);
  console.log(`  policy=${cfg.policy?.name}  mode=${cfg.mode}  enabled=${cfg.enabled !== false}`);

  // key presence (never print the value)
  let keySrc = 'none';
  if (process.env.CCR_KEY) keySrc = 'env CCR_KEY';
  else if (cfg.provider?.apiKey) keySrc = 'config.apiKey';
  else if (cfg.provider?.apiKeyEnv && process.env[cfg.provider.apiKeyEnv]) keySrc = `env ${cfg.provider.apiKeyEnv}`;
  else if (cfg.provider?.apiKeyKeychain) {
    try { execFileSync('security', ['find-generic-password', '-s', cfg.provider.apiKeyKeychain, '-w'], { encoding: 'utf8' }); keySrc = `keychain ${cfg.provider.apiKeyKeychain}`; } catch { keySrc = `keychain ${cfg.provider.apiKeyKeychain} (NOT FOUND)`; }
  }
  console.log(`${ok(keySrc !== 'none' && !keySrc.includes('NOT FOUND'))} api key: ${keySrc}`);

  process.stdout.write('  provider reachability: ');
  try { const r = await chat([{ role: 'user', content: 'reply with: ok' }], { reasoningEffort: 'low' }); console.log(`${ok(!!r.trim())} responded`); }
  catch (e) { console.log(`✗ ${String(e.message || e).slice(0, 80)}`); }
}
main();
