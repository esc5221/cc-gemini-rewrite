// Per-message delta buffers on disk: buffers/<session>/<message>.txt
import { appendFileSync, readFileSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { P, ensureHome } from './paths.mjs';

const safe = (s) => String(s || 'none').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
function dir(session) { const d = join(P.buffers, safe(session)); try { mkdirSync(d, { recursive: true, mode: 0o700 }); } catch {} return d; }
function file(session, message) { return join(dir(session), safe(message) + '.txt'); }

export function appendDelta(session, message, delta) { ensureHome(); try { appendFileSync(file(session, message), delta ?? ''); } catch {} }
export function readBuffer(session, message) { try { return readFileSync(file(session, message), 'utf8'); } catch { return ''; } }
export function clearBuffer(session, message) { try { rmSync(file(session, message), { force: true }); } catch {} }

// opportunistic cleanup of buffers older than ttlMs
export function sweep(ttlMs = 10 * 60 * 1000) {
  const now = Date.now();
  try {
    for (const s of readdirSync(P.buffers)) {
      const sd = join(P.buffers, s);
      try { for (const f of readdirSync(sd)) { const fp = join(sd, f); try { if (now - statSync(fp).mtimeMs > ttlMs) rmSync(fp, { force: true }); } catch {} } } catch {}
    }
  } catch {}
}
