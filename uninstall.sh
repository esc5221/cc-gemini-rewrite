#!/bin/bash
# Remove cc-gemini-rewrite: drop the MessageDisplay hook, commands, and app. Config kept.
set -uo pipefail
APP="${CCR_APP:-$HOME/.local/share/cc-gemini-rewrite}"
SET="$HOME/.claude/settings.json"
[ -f "$SET" ] && { cp "$SET" "$SET.bak.ccr.uninstall"; node -e '
const fs=require("fs"),p=process.argv[1];const s=JSON.parse(fs.readFileSync(p,"utf8"));
if(s.hooks&&s.hooks.MessageDisplay){s.hooks.MessageDisplay=s.hooks.MessageDisplay.filter(e=>!JSON.stringify(e).includes("cc-gemini-rewrite/scripts/message-display"));if(!s.hooks.MessageDisplay.length)delete s.hooks.MessageDisplay;}
fs.writeFileSync(p,JSON.stringify(s,null,2));' "$SET"; }
rm -f "$HOME/.claude/commands/rewrite.md" "$HOME/.claude/commands/rewrite-config.md" "$HOME/.claude/commands/rewrite-doctor.md"
rm -rf "$APP"
echo "✓ uninstalled (config at ~/.claude/cc-gemini-rewrite kept; remove manually if desired)"
