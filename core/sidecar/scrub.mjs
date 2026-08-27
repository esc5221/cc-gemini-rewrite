// Remove the injected message that got persisted into the session jsonl (keep records clean).
// claude's appendEntryToFile opens/appends/closes per call, so it never holds the file →
// after a short delay, rewrite the file dropping model==="cc-turn-ext" lines.
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const MODEL = 'cc-turn-ext';

export function scheduleScrub(file, { delay = 1500, retries = 4 } = {}) {
  if (!file) return;
  let n = 0;
  const tick = () => {
    n++;
    try {
      const raw = readFileSync(file, 'utf8');
      const lines = raw.split('\n');
      let removed = 0;
      const kept = lines.filter(l => {
        if (!l) return true; // keep blank line (trailing newline)
        if (l.includes(`"model":"${MODEL}"`)) { removed++; return false; }
        return true;
      });
      if (removed > 0) {
        writeFileSync(file, kept.join('\n'), { mode: 0o600 });
        console.error(`[scrub] removed ${removed} ephemeral line(s) from ${file}`);
        return; // done
      }
    } catch (e) { /* file not there yet / race → retry */ }
    if (n < retries) setTimeout(tick, delay);
  };
  setTimeout(tick, delay);
}
