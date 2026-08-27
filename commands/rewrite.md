---
description: Re-explain the previous answer clearly (inline, via your configured LLM)
allowed-tools: Bash(node:*)
---
You are ONLY a trigger. Do exactly TWO things and nothing else:

1. Run this command:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/rewrite.mjs" $ARGUMENTS`
2. Then output this single line and STOP:
   ↻ re-explaining…

Do NOT rewrite, summarize, reproduce, or comment on the previous answer — it is re-explained automatically and rendered on its own. `$ARGUMENTS` is an optional steering hint for the rewrite (e.g. "shorter", "in English"), NOT a task for you.
