// Compose the on-screen displayContent for MessageDisplay, and the JSON envelope.
export function emit(displayContent) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'MessageDisplay', displayContent },
  }));
}
export function passthrough(delta) { emit(delta ?? ''); }

const SEP = '\n\n────────────\n';
// append mode: original final delta already carries the tail of the answer; add the block after it.
export function appendBlock(finalDelta, header, rewrite) {
  emit(`${finalDelta ?? ''}${SEP}${header}\n\n${rewrite}\n`);
}
// replace / manual: show only the block (original suppressed on earlier deltas).
export function onlyBlock(header, rewrite) {
  emit(`${header}\n\n${rewrite}\n`);
}
