**English** · [한국어](README.ko.md)

# cc-gemini-rewrite

When a Claude Code answer is hard to read, an LLM re-explains the **same** answer clearly, right below it — while the transcript and Claude's context keep the original untouched.

![cc-gemini-rewrite — a slop answer, re-explained clearly below it](docs/demo-poster.png)

A small **Claude Code plugin** on the official [`MessageDisplay`](https://code.claude.com/docs/en/hooks) hook. No binary patching, no proxy — display-only, so it can never change what Claude sees or does.

- **`/rewrite`** re-explains the previous answer on demand (or turn on auto for long answers).
- **Transcript stays clean** — the rewrite is screen-only; `verbose` shows the original.
- **Provider-agnostic** — any OpenAI-compatible endpoint (Gemini, OpenAI, OpenRouter, local).

---

## Install

Requires macOS/Linux, **Node ≥ 18**, and a Claude Code build with `MessageDisplay` (2.1.x+).

```bash
git clone https://github.com/esc5221/cc-gemini-rewrite
cd cc-gemini-rewrite
./install.sh     # copies the app, merges the hook into ~/.claude/settings.json, adds the commands
```

Or as a plugin:

```
/plugin marketplace add esc5221/cc-gemini-rewrite
/plugin install cc-gemini-rewrite@cc-gemini-rewrite
```

Then set your provider (below), **start a new claude session**, and run `/rewrite-doctor`. Remove any time with `./uninstall.sh`.

## Configure the provider

Any **OpenAI-compatible** endpoint, in `~/.claude/cc-gemini-rewrite/config.json`:

```json
{
  "provider": {
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
    "model": "gemini-2.5-flash",
    "apiKeyEnv": "GEMINI_API_KEY"
  }
}
```

Key order: `apiKey` (inline) → `apiKeyEnv` (env var) → `apiKeyKeychain` (macOS keychain). Per-shell override: `CCR_BASE` / `CCR_MODEL` / `CCR_KEY`.

## Usage

Default policy is **off** — nothing fires until you ask.

```
/rewrite               re-explain the previous answer, inline
/rewrite shorter       steer it (any hint: "in English", "like I'm five")
```

Turn on automatic re-explaining (optional):

```
/rewrite-config policy lines    N+ line answers are always re-explained (rule-based)
/rewrite-config policy judge     an LLM decides if the answer is unclear
/rewrite-config policy off       manual-only (default)   ·   /rewrite-config off   pause entirely
/rewrite-config                  show current settings
/rewrite-doctor                  version · hook · provider key · reachability
```

## How it works

```
Claude finishes a message
        │  MessageDisplay hook fires (per chunk; the final one carries the whole message)
        ▼
  buffer the deltas → on final: policy decides → LLM rewrites the same content
        │                                         → fidelity check (keep code/paths/numbers)
        ▼
  displayContent = original + a re-explained block      (the transcript keeps the original)
```

A deterministic fidelity check keeps every command, path, number, and code token; if it can't, it fails open to the original. For `/rewrite`, the work runs **while the command's `Bash` step spins** (it precomputes and caches the rewrite), so the block then appears at once — no post-answer freeze. The rewrite is delivered as a block, not a live token stream: that's the one cost of using the official hook.

### Migrating from the binary-patch version

The old version patched the Claude Code binary; this one doesn't — it's the official hook (preserved on the `binary-patch` branch). To switch: run the old `ccturn uninstall`, delete any `alias claude=ccturn` from your shell rc, then `./install.sh`.

<details>
<summary><strong>Config reference</strong></summary>

```
provider.baseUrl / model / apiKey / apiKeyEnv / apiKeyKeychain / headers / reasoningEffort
policy.name       off | always | lines | judge | hybrid
policy.alwaysLines (lines/hybrid threshold, default 8)   policy.judgeMinLines (default 5)
mode              append (original + block, default) | replace (block only)
minChars          skip auto-rewrite of answers shorter than this (default 200)
fidelity.check / fidelity.repair   preserve code/paths/numbers; one repair pass, else fail-open
```

</details>

<details>
<summary><strong>Structure</strong></summary>

```
.claude-plugin/        plugin.json · marketplace.json
hooks/hooks.json       registers the MessageDisplay hook
commands/              /rewrite · /rewrite-config · /rewrite-doctor
scripts/message-display.mjs   the hook (buffer → decide → rewrite → display)
scripts/{rewrite,config-cli,doctor}.mjs
core/                  provider · policy · fidelity · transcript · rewriter · display · buffer · state · requests · config · paths
prompts/rewrite-ko.json · defaults/config.json
install.sh · uninstall.sh
```

</details>
