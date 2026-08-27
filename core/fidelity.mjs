// Cheap, deterministic invariant preservation check between original and rewrite.
// Not a semantic proof — a high-signal guard. Returns { ok, missing }.
const RX = {
  fence:   /```[\s\S]*?```/g,
  inline:  /`[^`\n]+`/g,
  path:    /(?:[.~]?\/)?[\w.-]+\/[\w./-]+/g,
  flag:    /(?<![\w-])--?[A-Za-z][\w-]*/g,
  url:     /https?:\/\/[^\s)]+/g,
  version: /\bv?\d+\.\d+(?:\.\d+)?\b/g,
  num:     /\b\d[\d,]*(?:\.\d+)?\s?(?:ms|s|kb|mb|gb|%|px|x)?\b/gi,
  ident:   /\b[A-Z][A-Z0-9_]{3,}\b|\b[a-z]+(?:[A-Z][a-z0-9]+){1,}\b/g,
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
  const orig = tokens(original, kinds);
  const rw = norm(rewrite);
  const missing = [];
  for (const tok of orig) {
    if (tok.length < 2) continue;
    if (!rw.includes(norm(tok))) missing.push(tok);
  }
  // allow a small tolerance for very token-dense originals
  const tol = opts.tolerance ?? 0;
  return { ok: missing.length <= tol, missing };
}
