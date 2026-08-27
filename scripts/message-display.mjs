#!/usr/bin/env node
// MessageDisplay hook. Non-final: buffer + passthrough. Final: policy-gate the whole
// message, rewrite via provider, fidelity-check, and append the block. Fail-open.
import { loadConfig } from '../core/config.mjs';
import { ensureHome, P } from '../core/paths.mjs';
import { appendDelta, readBuffer, clearBuffer, sweep } from '../core/buffer.mjs';
import { loadTranscript, toChat, lastSubstantialAssistant, userQuestionBefore } from '../core/transcript.mjs';
import { decide } from '../core/policy.mjs';
import { rewriteText, repairText } from '../core/rewriter.mjs';
import { checkFidelity } from '../core/fidelity.mjs';
import { emit, passthrough, appendBlock, onlyBlock } from '../core/display.mjs';
import { takeRequest } from '../core/requests.mjs';
import { appendFileSync } from 'node:fs';

const MARKER = '↻ re-explaining';  // carrier marker Claude prints for /rewrite

function log(o) { try { appendFileSync(P.log, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n'); } catch {} }

async function main() {
  ensureHome();
  let input = '';
  for await (const c of process.stdin) input += c;
  let ev = {};
  try { ev = JSON.parse(input || '{}'); } catch {}
  const session = ev.session_id || 'none';
  const message = ev.message_id || ev.turn_id || 'msg';
  const delta = ev.delta ?? '';
  const final = !!ev.final;

  try {
    appendDelta(session, message, delta);
    // A pending manual /rewrite for this cwd? (carrier turn) — suppress its text.
    const req = takeRequest(ev.cwd, { peek: !final });
    if (!final) { req ? emit('') : passthrough(delta); return; }

    // ---------- final ----------
    const full = readBuffer(session, message);
    const cfg = loadConfig();
    const events = loadTranscript(ev.transcript_path);
    sweep();

    // ===== manual /rewrite =====
    if (req) {
      // rewrite.mjs already computed it (blocking) → render instantly.
      if (req.rewrite) { onlyBlock(cfg.prompts.header, req.rewrite); log({ mode: 'manual', cached: true }); clearBuffer(session, message); return; }
      // fallback: compute now (arm couldn't reach the answer, or failed open)
      const target = lastSubstantialAssistant(events, {
        minChars: cfg.manual?.minChars ?? 120, skipId: message, skipContains: MARKER,
      });
      if (!target) { onlyBlock('', '(no previous answer to re-explain)'); clearBuffer(session, message); return; }
      const chat = toChat(events);
      const ctx = { targetText: target.text, chat, lastUser: userQuestionBefore(events, target.index), note: req.note, maxTurns: cfg.prompts.maxTurns };
      const rw = await produce(ctx, cfg);
      onlyBlock(cfg.prompts.header, rw.text || '(re-explain unavailable — original stands)');
      log({ mode: 'manual', fired: true, fidelity: rw.fidelity, len: target.text.length });
      clearBuffer(session, message); return;
    }

    // ===== auto policy =====
    if (cfg.enabled === false) { passthrough(delta); clearBuffer(session, message); return; }
    if (full.includes(MARKER)) { passthrough(delta); clearBuffer(session, message); return; }
    if ((full || '').trim().length < (cfg.minChars ?? 200)) { passthrough(delta); clearBuffer(session, message); return; }

    const chat = toChat(events);
    const lastUser = [...chat].reverse().find(m => m.role === 'user')?.text || '';
    const ctx = { targetText: full, chat, lastUser, maxTurns: cfg.prompts.maxTurns };
    const d = await decide(ctx, cfg);
    if (!d.fire) { passthrough(delta); log({ mode: 'auto', fired: false, reason: d.reason, policy: d.policy }); clearBuffer(session, message); return; }

    const rw = await produce(ctx, cfg);
    if (!rw.text) { passthrough(delta); clearBuffer(session, message); return; }
    appendBlock(delta, cfg.prompts.header, rw.text);
    log({ mode: 'auto', fired: true, reason: d.reason, policy: d.policy, fidelity: rw.fidelity });
    clearBuffer(session, message);
  } catch (e) {
    log({ error: String(e && e.message || e) });
    passthrough(delta);       // fail-open: original text
    try { clearBuffer(session, message); } catch {}
  }
}

async function produce(ctx, cfg) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), cfg.timeoutMs || 45000);
  try {
    let text = await rewriteText(ctx, cfg, ctrl.signal);
    let fidelity = 'skipped';
    if (cfg.fidelity?.check && ctx.targetText) {
      let { ok, missing } = checkFidelity(ctx.targetText, text);
      if (!ok && cfg.fidelity?.repair) {
        const fixed = await repairText(ctx, cfg, missing.slice(0, 12), ctrl.signal);
        const re = checkFidelity(ctx.targetText, fixed);
        if (re.ok || re.missing.length < missing.length) { text = fixed; ({ ok, missing } = re); }
      }
      fidelity = ok ? 'ok' : `missing:${missing.length}`;
      if (!ok) return { text: '', fidelity };   // fail-open when still broken
    }
    return { text, fidelity };
  } finally { clearTimeout(to); }
}
main();
