// Decide ONLY whether to re-explain. Runs on the FINAL, fully-buffered message.
import { chat } from './provider.mjs';
const lineCount = (s) => (s || '').split('\n').filter(l => l.trim()).length;

async function judge(ctx, cfg, signal) {
  const raw = await chat([
    { role: 'system', content: cfg.prompts.judgePrompt },
    { role: 'user', content: `[user question]\n${ctx.lastUser || '(none)'}\n\n[Claude answer]\n${ctx.targetText || ''}` },
  ], { model: cfg.provider.model, temperature: 0, reasoningEffort: cfg.provider.reasoningEffort, signal });
  try { const m = raw.match(/\{[\s\S]*\}/); const j = JSON.parse(m ? m[0] : raw); return { need: !!j.need, reason: j.reason || '' }; }
  catch { return { need: false, reason: 'parse-fail' }; }
}
export const POLICIES = {
  off:    async () => ({ fire: false, reason: 'off', kind: 'rule' }),
  always: async (ctx) => ({ fire: !!(ctx.targetText || '').trim(), reason: 'always', kind: 'rule' }),
  lines:  async (ctx, cfg) => { const n = lineCount(ctx.targetText), th = cfg.policy.alwaysLines ?? 8; return { fire: n >= th, reason: `${n} lines ${n>=th?'>=':'<'} ${th}`, kind: 'rule' }; },
  judge:  async (ctx, cfg, s) => { const n = lineCount(ctx.targetText), g = cfg.policy.judgeMinLines ?? 5; if (n < g) return { fire: false, reason: `${n} lines < ${g}`, kind: 'rule' }; return { ...(await judge(ctx, cfg, s)), kind: 'llm' }; },
  hybrid: async (ctx, cfg, s) => { const n = lineCount(ctx.targetText), a = cfg.policy.alwaysLines ?? 8, g = cfg.policy.judgeMinLines ?? 5; if (n >= a) return { fire: true, reason: `${n} lines >= ${a}`, kind: 'rule' }; if (n < g) return { fire: false, reason: `${n} lines < ${g}`, kind: 'rule' }; const j = await judge(ctx, cfg, s); return { fire: j.need, reason: j.reason, kind: 'llm' }; },
};
export async function decide(ctx, cfg, signal) {
  const name = cfg.policy?.name || 'off';
  const fn = POLICIES[name] || POLICIES.off;
  return { ...(await fn(ctx, cfg, signal)), policy: name };
}
