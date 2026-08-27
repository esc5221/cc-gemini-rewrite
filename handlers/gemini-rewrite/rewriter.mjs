// Rewriter — only "rewrite so it is understandable". Separate from the decision.
import { streamChat } from '../../core/provider.mjs';

export async function* rewrite(ctx, cfg, { signal } = {}) {
  if (cfg.prompts.header) yield cfg.prompts.header + '\n\n';
  const recent = ctx.chat.slice(-(cfg.prompts.maxTurns || 8));
  const context = recent.map(m => `${m.role === 'assistant' ? 'Claude' : 'User'}: ${m.text}`).join('\n\n');
  // ctx.targetText overrides which answer to rewrite (manual trigger; may include the
  // previous answer when the last one is short). Otherwise: the last Claude answer.
  const note = (ctx.note||'').trim();
  const extra = note ? `\n\nAdditional request from the user for this rewrite: ${note}` : '';
  const userMsg = ctx.targetText
    ? `Recent conversation for context:\n\n${context}\n\n---\nRewrite the following Claude answer so it is understandable:\n\n${ctx.targetText}${extra}`
    : `Here is the conversation so far. Rewrite the last Claude answer so it is understandable.\n\n${context}${extra}`;
  yield* streamChat([
    { role: 'system', content: cfg.prompts.respondPrompt },
    { role: 'user', content: userMsg },
  ], { model: cfg.provider.model, temperature: 0.4, reasoningEffort: cfg.provider.reasoningEffort, signal });
}
