**English** · [한국어](README.ko.md)

# cc-gemini-rewrite

**Claude Code's technical answers are often hard to read** — the conclusion buried, no clear next step.

![cc-gemini-rewrite — a slop answer, re-explained clearly below it](docs/demo-poster.png)

**cc-gemini-rewrite** adds a clearer rewrite right below the answer, on screen. It's a Claude Code plugin on the [`MessageDisplay`](https://code.claude.com/docs/en/hooks) hook, which only changes how a message is drawn — it can't alter the message, so it can't change what Claude does.

- **`/rewrite`** rewrites the previous answer on demand; an optional policy rewrites long answers automatically.
- The rewrite is shown, not saved — `verbose` and the transcript still show the original.
- Works with any OpenAI-compatible endpoint (Gemini, OpenAI, OpenRouter, a local model).

---

## Install

Requires macOS/Linux, **Node ≥ 18**, and a Claude Code build with `MessageDisplay` (2.1.x+).

```bash
git clone https://github.com/esc5221/cc-gemini-rewrite
cd cc-gemini-rewrite
./install.sh     # app + hook + commands
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
    "model": "gemini-3.5-flash-lite",
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
/rewrite-config policy lines    auto-rewrite answers of 8+ lines
/rewrite-config policy judge    let an LLM decide when to auto-rewrite
/rewrite-config policy off      no auto-rewrite; /rewrite only (default)
/rewrite-config off             turn the whole plugin off
/rewrite-config                 show current settings
/rewrite-doctor                 version · hook · provider key · reachability
```

## How it works

```
Claude finishes a message
        │  MessageDisplay hook fires (per chunk; the final one carries the whole message)
        ▼
  buffer the deltas → on final: policy decides → LLM rewrites the same content
        ▼
  displayContent = original + a re-explained block      (the transcript keeps the original)
```

For `/rewrite`, the rewrite is computed while the command's `Bash` step runs (it precomputes and caches it), so the block appears as soon as the answer prints. It comes all at once rather than streaming in, because the hook returns its output once.

<details>
<summary><strong>Config reference</strong></summary>

```
provider.baseUrl / model / apiKey / apiKeyEnv / apiKeyKeychain / headers / reasoningEffort
policy.name       off | always | lines | judge | hybrid
policy.alwaysLines (lines/hybrid threshold, default 8)   policy.judgeMinLines (default 5)
mode              append (original + block, default) | replace (block only)
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
core/                  provider · policy · transcript · rewriter · display · buffer · state · requests · config · paths
prompts/rewrite-ko.json · defaults/config.json
install.sh · uninstall.sh
```

</details>
