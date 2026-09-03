#!/usr/bin/env node
// Manual /rewrite trigger. BLOCKS here: finds the previous substantial answer, computes
// the rewrite now, and caches it in the request. The MessageDisplay hook then renders it
// instantly (no second gap) — the wait happens during this Bash call's spinner instead.
//
// The session is never guessed. This runs as a Bash child of claude, so it inherits
// CLAUDE_CODE_SESSION_ID; that pins the transcript and keys the request.
import { armRequest } from '../core/requests.mjs';
import { loadConfig } from '../core/config.mjs';
import { sessionFileById, loadTranscript, toChat, lastSubstantialAssistant, userQuestionBefore } from '../core/transcript.mjs';
import { rewriteText } from '../core/rewriter.mjs';

const MARKER = '↻ re-explaining';
const note = process.argv.slice(2).join(' ').trim();
const sid = process.env.CLAUDE_CODE_SESSION_ID || '';

(async () => {
  if (!sid) {
    // Do not fall back to guessing — doing nothing beats re-explaining the wrong session.
    process.stdout.write('↻ rewrite unavailable (CLAUDE_CODE_SESSION_ID missing)');
    return;
  }

  const cfg = loadConfig();
  const file = sessionFileById(sid);
  const events = file ? loadTranscript(file) : [];
  const target = lastSubstantialAssistant(events, { skipContains: MARKER });

  if (!target) {
    armRequest(sid, note);   // arm anyway; hook will report "no previous answer"
    process.stdout.write('↻ re-explaining… (no previous answer found)');
    return;
  }

  const ctx = {
    targetText: target.text, chat: toChat(events),
    lastUser: userQuestionBefore(events, target.index), note, maxTurns: cfg.prompts.maxTurns,
  };

  let rewrite = '';
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), cfg.timeoutMs || 45000);
  try {
    rewrite = await rewriteText(ctx, cfg, ctrl.signal);
  } catch { rewrite = ''; }
  finally { clearTimeout(to); }

  armRequest(sid, note, rewrite || null);   // cache the precomputed rewrite
  process.stdout.write(rewrite ? '↻ re-explained ✓' : '↻ rewrite unavailable (showing original)');
})();
