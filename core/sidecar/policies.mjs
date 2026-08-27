// Trigger registry — decides ONLY whether to re-explain. Rewrite lives in the handler.
// Named/selectable like CPU scheduling policies; cfg.policy.name picks one.
// policy.decide(ctx, cfg, {signal}) -> { fire, reason, kind:'rule'|'llm' }
import { chat } from '../provider.mjs';

const lineCount = (s) => (s || '').split('\n').filter(l => l.trim()).length;

async function geminiJudge(ctx, cfg, signal) {
  const raw = await chat([
    { role: 'system', content: cfg.prompts.judgePrompt },
    { role: 'user', content: `[user question]\n${ctx.lastUser || '(none)'}\n\n[Claude answer]\n${ctx.lastAssistant || ''}` },
  ], { model: cfg.provider.model, temperature: 0, reasoningEffort: cfg.provider.reasoningEffort, signal });
  try { const m = raw.match(/\{[\s\S]*\}/); const j = JSON.parse(m ? m[0] : raw); return { need: !!j.need, reason: j.reason || '' }; }
  catch { return { need: false, reason: 'parse-fail' }; }
}

export const POLICIES = {
  off:    { id:'off',    name:'Off',          desc:'never re-explain',                          async decide(){ return { fire:false, reason:'off', kind:'rule' }; } },
  always: { id:'always', name:'Always',       desc:'re-explain every response',                 async decide(ctx){ return { fire:!!(ctx.lastAssistant||'').trim(), reason:'always', kind:'rule' }; } },
  lines:  { id:'lines',  name:'Line rule',    desc:'N+ lines always (rule-based, no LLM)',      async decide(ctx,cfg){ const n=lineCount(ctx.lastAssistant), th=cfg.policy.alwaysLines??8; return { fire:n>=th, reason:`${n} lines ${n>=th?'≥':'<'} ${th}`, kind:'rule' }; } },
  judge:  { id:'judge',  name:'Gemini judge', desc:'LLM decides if unclear (min-lines gate)',   async decide(ctx,cfg,{signal}={}){ const n=lineCount(ctx.lastAssistant), g=cfg.policy.judgeMinLines??5; if(n<g) return { fire:false, reason:`${n} lines < ${g} (gate)`, kind:'rule' }; const j=await geminiJudge(ctx,cfg,signal); return { fire:j.need, reason:j.reason, kind:'llm' }; } },
  hybrid: { id:'hybrid', name:'Hybrid',       desc:'N+ lines always, below that Gemini decides',async decide(ctx,cfg,{signal}={}){ const n=lineCount(ctx.lastAssistant), a=cfg.policy.alwaysLines??8, g=cfg.policy.judgeMinLines??5; if(n>=a) return { fire:true, reason:`${n} lines ≥ ${a} (rule)`, kind:'rule' }; if(n<g) return { fire:false, reason:`${n} lines < ${g} (gate)`, kind:'rule' }; const j=await geminiJudge(ctx,cfg,signal); return { fire:j.need, reason:j.reason, kind:'llm' }; } },
};
export const POLICY_LIST = Object.values(POLICIES).map(p => ({ id:p.id, name:p.name, desc:p.desc }));
export function getPolicy(id) { return POLICIES[id] || POLICIES.lines; }
