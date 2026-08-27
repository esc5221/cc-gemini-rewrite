#!/usr/bin/env node
// /rewrite-config — show or change runtime toggles (policy / mode / enabled).
import { readState, writeState } from '../core/state.mjs';
import { loadConfig } from '../core/config.mjs';

const args = process.argv.slice(2).map(s => s.toLowerCase());
const POLICIES = ['off', 'always', 'lines', 'judge', 'hybrid'];
const MODES = ['append', 'replace'];

function status() {
  const cfg = loadConfig(); const st = readState();
  console.log('cc-gemini-rewrite');
  console.log(`  enabled : ${cfg.enabled === false ? 'no' : 'yes'}`);
  console.log(`  policy  : ${cfg.policy?.name || 'off'}   (off | always | lines | judge | hybrid)`);
  console.log(`  mode    : ${cfg.mode || 'append'}   (append | replace)`);
  console.log(`  provider: ${cfg.provider?.baseUrl || '(unset)'}  ${cfg.provider?.model || ''}`);
}
if (!args.length) { status(); process.exit(0); }
const [a, b] = args;
if (a === 'on') writeState({ enabled: true });
else if (a === 'off') writeState({ enabled: false });
else if (a === 'policy' && POLICIES.includes(b)) writeState({ policy: b });
else if (a === 'mode' && MODES.includes(b)) writeState({ mode: b });
else if (POLICIES.includes(a)) writeState({ policy: a });
else { console.log(`unknown: ${args.join(' ')}`); status(); process.exit(1); }
console.log('updated.');
status();
