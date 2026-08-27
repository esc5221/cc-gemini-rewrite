// Default handler: decision (policy) → rewrite. Both provider-driven via merged config.
import { loadConfig } from '../../core/config.mjs';
import { getPolicy } from '../../core/sidecar/policies.mjs';
import { rewrite } from './rewriter.mjs';

export default async function* handler(ctx, { signal } = {}) {
  if (!ctx.chat.length) return;
  const cfg = loadConfig();
  if (!ctx.force) {                       // manual trigger sets ctx.force to skip the policy
    const policy = getPolicy(cfg.policy.name || 'lines');
    const d = await policy.decide(ctx, cfg, { signal });
    ctx._need = { need: d.fire, reason: d.reason, kind: d.kind, policy: policy.id };
    if (!d.fire) return;
  } else {
    ctx._need = { need: true, reason: 'manual', kind: 'manual', policy: 'manual' };
  }
  yield* rewrite(ctx, cfg, { signal });
}
