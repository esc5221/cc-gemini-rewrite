// Cheap, deterministic invariant check between original and rewrite.
// A re-explanation condenses, and the original is always kept in the transcript — so this
// is a loose guard against off-topic / hallucinated rewrites, NOT exact preservation.
// Returns { ok, missing, total }.
const RX = {
  fence:   /```[\s\S]*?```/g,
  inline:  /`[^`\n]+`/g,
  path:    /(?:[.~]?\/)?[\w.-]+\/[\w./-]+/g,
  flag:    /(?<![\w-])--?[A-Za-z][\w-]*/g,
  url:     /https?:\/\/[^\s)]+/g,
  version: /\bv?\d+\.\d+(?:\.\d+)?\b/g,
  port:    /:\d{2,5}\b/g,
};
const norm = (s) => (s || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');
function tokens(text, kinds) {
  const t = norm(text); const set = new Set();
  for (const k of kinds) { const m = t.match(RX[k]); if (m) for (const x of m) set.add(x.trim()); }
  return set;
}
export function checkFidelity(original, rewrite, opts = {}) {
  const kinds = opts.kinds || ['fence', 'inline', 'path', 'flag', 'url', 'version', 'port'];
  const orig = [...tokens(original, kinds)].filter(t => t.length >= 2);
  const rw = norm(rewrite);
  const missing = orig.filter(tok => !rw.includes(norm(tok)));
  const total = orig.length;
  // Reject only when a large fraction of critical tokens is gone (rewrite went off the rails).
  const ratio = opts.ratio ?? 0.5;
  const allow = Math.max(opts.tolerance ?? 2, Math.floor(total * ratio));
  return { ok: missing.length <= allow, missing, total };
}
