**English** · [한국어](README.ko.md)

# cc-gemini-rewrite

When a Claude Code answer is hard to read, an LLM (Gemini by default) rewrites the **same** answer clearly and it appears **right below the original**, on screen — while Claude's context and the JSONL transcript keep the untouched original.

It's a small **Claude Code plugin** built on the official [`MessageDisplay`](https://code.claude.com/docs/en/hooks) hook. No binary patching, no proxy — display-only, so it can never change what Claude sees or does.

```
❯ why is my SQL query slow?
⏺ Great question! …suboptimal performance at the data layer… industry-standard
  optimizations… meaningful improvements in throughput and latency! 🚀

  ────────────
  [re-explained by Gemini]
  Your query is slow because the DB reads unindexed data off disk, the planner
  picks a bad plan, or repeat reads skip the cache.
  Next: run EXPLAIN to see the plan and pin the bottleneck.
```

---

## How it works

```
Claude finishes a message
        │  MessageDisplay hook fires (per chunk; final carries the whole message)
        ▼
  buffer deltas → on final: policy decides → LLM rewrites the same content
        │                                      → fidelity check (keep code/paths/numbers)
        ▼
  displayContent = original + a re-explained block   (transcript keeps the original)
```

- **Display-only.** The rewrite is shown on screen; the transcript and Claude's next request are unchanged. `verbose` shows the original.
- **Block, not a live stream.** The hook returns once on the final chunk, so the rewrite appears as a block after a short pause (LLM latency), not token-by-token.
- **Fail-open.** Any error, timeout (60s hook cap), or fidelity failure → the original text is shown unchanged.

## Install

Requires macOS/Linux, **Node ≥ 18**, and a Claude Code build with `MessageDisplay` (2.1.x+). Check with `/rewrite-doctor` after setup.

Clone, then register the hook + commands. As a plugin:

```
git clone https://github.com/esc5221/cc-gemini-rewrite
/plugin marketplace add <path-or-repo>
/plugin install cc-gemini-rewrite
```

Or wire the hook by hand in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "MessageDisplay": [
      { "hooks": [ { "type": "command", "command": "node /abs/path/cc-gemini-rewrite/scripts/message-display.mjs", "timeout": 60 } ] }
    ]
  }
}
```

Then set your provider (see below) and run `/rewrite-doctor`.

## Configure the provider

Any **OpenAI-compatible** endpoint. Put it in `~/.claude/cc-gemini-rewrite/config.json`:

```json
{
  "provider": {
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
    "model": "gemini-2.5-flash",
    "apiKeyEnv": "GEMINI_API_KEY"
  }
}
```

Key resolution order: `apiKey` (inline) → `apiKeyEnv` (env var) → `apiKeyKeychain` (macOS keychain). Or override per-shell with `CCR_BASE` / `CCR_MODEL` / `CCR_KEY`.

## Usage

Default policy is **off** — nothing fires until you ask.

```
/rewrite               re-explain the previous answer, inline
/rewrite shorter       steer the rewrite (any hint: "in English", "like I'm five")
```

Turn on automatic re-explaining (optional safety net):

```
/rewrite-config policy lines    N+ line answers are always re-explained (no LLM gate)
/rewrite-config policy judge    an LLM decides if the answer is unclear
/rewrite-config policy off      back to manual-only (default)
/rewrite-config off             pause the plugin entirely
/rewrite-config                 show current settings
```

Diagnose:

```
/rewrite-doctor        version · hook · provider key · reachability
```

## Config reference

```
provider.baseUrl / model / apiKey / apiKeyEnv / apiKeyKeychain / headers / reasoningEffort
policy.name       off | always | lines | judge | hybrid
policy.alwaysLines (lines/hybrid threshold, default 8)   policy.judgeMinLines (default 5)
mode              append (original + block, default) | replace (block only)
minChars          skip auto-rewrite of answers shorter than this (default 200)
fidelity.check / fidelity.repair   preserve code/paths/numbers; one repair pass, else fail-open
```

## Structure

```
.claude-plugin/plugin.json   plugin manifest
hooks/hooks.json             registers the MessageDisplay hook
commands/                    /rewrite · /rewrite-config · /rewrite-doctor
scripts/message-display.mjs  the hook entry (buffer → decide → rewrite → display)
scripts/{arm-rewrite,config-cli,doctor}.mjs
core/                        provider · policy · fidelity · transcript · rewriter · display · buffer · state · requests · config · paths
prompts/rewrite-ko.json      rewrite + judge prompts
defaults/config.json         package defaults
```
