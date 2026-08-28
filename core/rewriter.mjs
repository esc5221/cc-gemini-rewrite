// Produce the re-explanation as a single string (block output — no live stream).
import { chat } from './provider.mjs';

function userMsg(ctx) {
  const ctxBlock = (ctx.chat || []).slice(-(ctx.maxTurns || 8))
    .map(m => `${m.role === 'assistant' ? 'Claude' : 'User'}: ${m.text}`).join('\n\n');
  const note = (ctx.note || '').trim();
  const extra = note ? `\n\nAdditional request from the user for this rewrite: ${note}` : '';
  return ctxBlock
    ? `Recent conversation for context:\n\n${ctxBlock}\n\n---\nRewrite the following Claude answer so it is understandable:\n\n${ctx.targetText}${extra}`
    : `Rewrite the following Claude answer so it is understandable:\n\n${ctx.targetText}${extra}`;
}
export async function rewriteText(ctx, cfg, signal) {
  return (await chat([
    { role: 'system', content: cfg.prompts.respondPrompt },
    { role: 'user', content: userMsg(ctx) },
  ], { model: cfg.provider.model, temperature: 0.4, reasoningEffort: cfg.provider.reasoningEffort, signal })).trim();
}
