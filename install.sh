#!/bin/bash
# Install cc-gemini-rewrite: copy the app to a stable path, register the MessageDisplay
# hook in ~/.claude/settings.json (merged, non-destructive), and add the slash commands.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
APP="${CCR_APP:-$HOME/.local/share/cc-gemini-rewrite}"
CMD="$HOME/.claude/commands"
SET="$HOME/.claude/settings.json"

echo "→ copying app to $APP"
rm -rf "$APP"; mkdir -p "$APP"
cp -R "$SRC/core" "$SRC/scripts" "$SRC/prompts" "$SRC/defaults" "$APP/"

echo "→ registering MessageDisplay hook in $SET (merged)"
mkdir -p "$HOME/.claude"
[ -f "$SET" ] || echo '{}' > "$SET"
cp "$SET" "$SET.bak.ccr.$(date +%s)"
node -e '
const fs=require("fs"), p=process.argv[1], app=process.argv[2];
const s=JSON.parse(fs.readFileSync(p,"utf8")); s.hooks=s.hooks||{};
const cmd=`node ${app}/scripts/message-display.mjs`;
const md=s.hooks.MessageDisplay=s.hooks.MessageDisplay||[];
if(!JSON.stringify(md).includes("cc-gemini-rewrite/scripts/message-display"))
  md.push({matcher:"",hooks:[{type:"command",command:cmd,timeout:60}]});
fs.writeFileSync(p, JSON.stringify(s,null,2));
' "$SET" "$APP"

echo "→ installing /rewrite, /rewrite-config, /rewrite-doctor commands"
mkdir -p "$CMD"
cat > "$CMD/rewrite.md" <<CMDEOF
---
description: Re-explain the previous answer clearly, inline
allowed-tools: Bash(node:*)
---
Do exactly two things and nothing else:
1. Run: \`node $APP/scripts/rewrite.mjs \$ARGUMENTS\`
2. Then output this single line and STOP: ↻ re-explaining…
Do NOT rewrite or comment on the previous answer — it renders on its own. \$ARGUMENTS is an optional steering hint.
CMDEOF
cat > "$CMD/rewrite-config.md" <<CMDEOF
---
description: Show or change cc-gemini-rewrite settings
allowed-tools: Bash(node:*)
---
Run exactly this and show its output verbatim: \`node $APP/scripts/config-cli.mjs \$ARGUMENTS\`
CMDEOF
cat > "$CMD/rewrite-doctor.md" <<CMDEOF
---
description: Diagnose cc-gemini-rewrite
allowed-tools: Bash(node:*)
---
Run exactly this and show its output verbatim: \`node $APP/scripts/doctor.mjs\`
CMDEOF

mkdir -p "$HOME/.claude/cc-gemini-rewrite"
echo
echo "✓ installed."
echo "  1. set your provider in ~/.claude/cc-gemini-rewrite/config.json (see README)"
echo "  2. start a NEW claude session, then run /rewrite-doctor"
echo "  3. /rewrite to re-explain the last answer  ·  /rewrite-config policy lines for auto"
