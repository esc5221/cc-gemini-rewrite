// Pipe-table remover. The TUI renders our text through Claude Code's own markdown
// renderer, which does not draw GFM tables — it prints the pipes raw and soft-wraps
// them into garbage. Wrapping the table in ``` does not help either: a code block is
// never wrapped, so a wide table is cut off at the right edge instead.
//
// So we rewrite any pipe table into label lines, and drop the fence when the fenced
// block held nothing but that table (there is no alignment left to preserve).
//
// Streaming-safe: only a table block (and a fence opener we have not judged yet) is
// held back. Any other code block streams through as soon as its first line proves it
// is not a table.

const PIPE  = /^\s*\|.*\|\s*$/;
const SEP   = /^\s*\|?[\s:]*-{2,}[-\s:|]*\|?\s*$/;
const FENCE = /^\s*```/;

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());

/** Table rows -> label lines. Returns null when the block is not worth converting. */
function render(rows) {
  const body = rows.filter(l => !SEP.test(l) && l.trim());
  if (body.length < 2) return null;              // header + at least one row
  const out = [];
  for (const row of body.slice(1)) {             // first row is the header — drop it
    const c = cells(row).filter(Boolean);
    if (!c.length) continue;
    out.push(c[0]);
    if (c.length > 1) out.push('  ' + c.slice(1).join(' → '));
  }
  return out.length ? out : null;
}

/**
 * Line-level transform. `emit` receives finished lines.
 * Returns a `flush()` to call once the source is exhausted.
 */
function machine(emit) {
  let state = 'NORMAL';
  let held = [];       // fence opener (+ blanks) we have not judged yet
  let tbl = [];        // table rows being collected

  const emitAll = (...groups) => { for (const g of groups) for (const l of g) emit(l); };
  const flushTable = ({ fenced }) => {
    const converted = render(tbl);
    if (converted) emitAll(converted);           // fence intentionally dropped
    else emitAll(held, tbl);                     // not a real table — restore verbatim
    held = []; tbl = [];
    if (!converted && fenced) return 'FENCE_PASS';
    return 'NORMAL';
  };

  const push = (line) => {
    switch (state) {
      case 'NORMAL':
        if (FENCE.test(line)) { held = [line]; state = 'FENCE_JUDGE'; return; }
        if (PIPE.test(line))  { tbl = [line];  state = 'TABLE'; return; }
        emit(line); return;

      case 'FENCE_JUDGE':                        // opener held; is this block a pure table?
        if (!line.trim())     { held.push(line); return; }
        if (PIPE.test(line))  { tbl = [line]; state = 'FENCE_TABLE'; return; }
        emitAll(held, [line]); held = [];        // ordinary code block — let it stream
        state = FENCE.test(line) ? 'NORMAL' : 'FENCE_PASS';
        return;

      case 'FENCE_TABLE':
        if (PIPE.test(line) || SEP.test(line)) { tbl.push(line); return; }
        if (!line.trim())                      { tbl.push(line); return; }
        if (FENCE.test(line)) { state = flushTable({ fenced: true }); return; }
        emitAll(held, tbl, [line]); held = []; tbl = [];   // mixed content — bail out
        state = 'FENCE_PASS';
        return;

      case 'FENCE_PASS':
        emit(line);
        if (FENCE.test(line)) state = 'NORMAL';
        return;

      case 'TABLE':
        if (PIPE.test(line) || SEP.test(line)) { tbl.push(line); return; }
        state = flushTable({ fenced: false });
        push(line);                              // re-handle this line in NORMAL
        return;
    }
  };

  const flush = () => {
    if (state === 'FENCE_TABLE') { state = flushTable({ fenced: true }); if (held.length) emitAll(held); }
    else if (state === 'TABLE')  { state = flushTable({ fenced: false }); }
    else if (held.length)        { emitAll(held); held = []; }
  };

  return { push, flush };
}

/** Whole-string transform (tests, non-streaming callers). */
export function detable(text) {
  const out = [];
  const m = machine(l => out.push(l));
  for (const line of text.split('\n')) m.push(line);
  m.flush();
  return out.join('\n');
}

/** Wraps a chunk stream. Yields chunks with pipe tables already rewritten. */
export async function* detableStream(source) {
  let pending = '';
  const out = [];
  const m = machine(l => out.push(l));
  const drain = function* () { while (out.length) yield out.shift() + '\n'; };

  for await (const chunk of source) {
    if (!chunk) continue;
    pending += chunk;
    let i;
    while ((i = pending.indexOf('\n')) >= 0) {
      m.push(pending.slice(0, i));
      pending = pending.slice(i + 1);
      yield* drain();
    }
  }
  if (pending) m.push(pending);
  m.flush();
  // The source had no trailing newline — do not invent one on the last line.
  const tail = [];
  for (const l of out) tail.push(l);
  out.length = 0;
  if (tail.length) yield tail.join('\n') + (pending ? '' : '\n');
}
