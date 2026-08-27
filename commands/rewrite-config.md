---
description: Show or change cc-gemini-rewrite settings (policy / mode / on-off)
allowed-tools: Bash(node:*)
---
Run exactly this and show the user its output verbatim, nothing else:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/config-cli.mjs" $ARGUMENTS`

Examples the user may pass as $ARGUMENTS: (blank)=status, `on`, `off`, `policy lines`, `policy judge`, `policy off`, `mode append`, `mode replace`.
