**English** · [한국어](README.ko.md)

# cc-gemini-rewrite

<img src="docs/demo-poster.png" alt="cc-gemini-rewrite — a slop answer re-explained cleanly by Gemini, inside Claude Code" width="820">

**Claude Code's technical answers are often hard to read** — the point buried under hedging and buzzwords.

**cc-gemini-rewrite** fixes that:

- **Rewrites at turn's end** — an LLM turns the same answer into something you can actually use.
- **Renders in place** — streamed straight into Claude Code's own screen, not routed back through the model.
- **Leaves no trace** — the conversation loop, transcript, and API history stay untouched.

**`/rewrite` — trigger a re-explanation inline, right where you are.** Watch the 20-second demo:

https://github.com/user-attachments/assets/5cf2a29c-c08a-4184-a771-2b9e0256774f

Built on **cc-turn-ext**, a turn-end hook engine for Claude Code. The rewrite is the default handler; bring your own.

---

## Install

macOS arm64 + [bun](https://bun.sh) + [Node](https://nodejs.org).

```bash
git clone https://github.com/esc5221/cc-gemini-rewrite ~/cc-gemini-rewrite
cd ~/cc-gemini-rewrite
./bin/ccturn setup            # wizard: provider + key check + policy + patch
ln -s "$PWD/bin/ccturn" ~/.local/bin/ccturn   # optional: put ccturn on PATH
```

The original `claude` is never touched. The patched copy lives in `~/.cc-turn-ext/cache/`, and the next run re-patches automatically after a Claude update (the anchor is a string literal, so it survives version bumps), falling back to the original if patching ever fails.

## Usage

Run the wrapper instead of `claude`:

```bash
ccturn                 # interactive (patches + starts sidecar + runs claude)
alias claude=ccturn    # recommended: use it as your `claude`
```

Type `/rewrite` when an answer is hard to follow. A clearer version streams inline without another Claude round-trip. Very long answers also trigger it automatically.

### `/rewrite` — the main way

Rewrite the previous substantial answer:

```
/rewrite
```

This one-shot command uses the same injection path as automatic rewrites, skips the slash turn’s own reply, and works when automatic policy is `off`.

Steer the result:

```
/rewrite shorter
/rewrite in English
/rewrite with a code example
/rewrite explain like I'm five
```

### Commands

```
ccturn setup           first-time wizard (provider, key check, policy, patch)
ccturn doctor          diagnose: version, arch, signature, patch, key, connectivity
ccturn repatch         re-patch after a Claude update (usually automatic)
ccturn uninstall       remove patched copies, restore backups
ccturn new-handler X   scaffold a custom handler into ~/.cc-turn-ext/handlers/
/ccturn                policy status (slash command inside Claude)
/ccturn lines|judge|hybrid|always|off
```

### Automatic trigger (optional safety net)

```
off      never auto (pure manual — /rewrite only)
always   rewrite every response
lines    N+ lines → always (rule-based, no LLM. default 15, conservative)   ← default
judge    LLM judges clarity (5-line gate)
hybrid   N+ lines → always, below that let the LLM decide
```

Switch with `/ccturn lines|judge|hybrid|always|off`.

### Dashboard — `http://127.0.0.1:61237/`

Policy buttons, recent activity (original preview · reason · rewrite · latency), and live model, threshold, and prompt overrides without editing files.

## Why

Claude Code answers can bury the conclusion, omit the reasoning, or leave the next action unclear. This adds an inline re-explanation without making you ask again.

## Why not a stop hook

A stop hook would add another Claude round-trip:

```
stop hook → LLM writes an explanation → that text is fed back to the Claude model
          → Claude reads it and parrots it back
          = one more round-trip + Claude reprocessing (slow, and filtered through Claude)
```

Instead, the tool hooks the binary where a turn ends and streams directly into Claude Code’s screen. The rewrite never enters the transcript or next request.

## How it works

```
                         your prompt
                            │
                   ┌────────▼────────┐
                   │   Claude Code   │   untouched. the conversation loop is not modified.
                   │  (turn / answer) │
                   └────────┬────────┘
                            │ turn ends (return completed)
        injected hook ┄┄┄┄┄▶│
                            ▼
                   ┌─────────────────┐   POST /turn-end (cwd)
                   │  sidecar :61237 │   loads the full current-session context
                   │  policy decides │   → rewrite or not?
                   └────────┬────────┘
                    fire?   │ yes                (no → stays silent)
                            ▼
                   ┌─────────────────┐
                   │  LLM (provider) │   rewrites the same content clearly
                   └────────┬────────┘   (conclusion first · concrete · why · next action)
                            │ SSE stream
         ┌──────────────────▼──────────────────┐
         │  streamed into Claude Code's screen  │   full markdown render.
         │  (stream_event → committed markdown) │   never written to jsonl / API.
         └─────────────────────────────────────┘
```

Deciding (policy) and rewriting (rewriter) are separate. The policy is one of five rules; the rewriter is a handler.

## Provider

Use any **OpenAI-compatible** endpoint. Configure `provider`:

```
baseUrl          the /chat/completions base (no trailing slash)
model            model id
apiKey           inline key            (1st, if non-empty)
apiKeyEnv        env var holding key   (2nd)
apiKeyKeychain   macOS keychain name   (3rd)
headers          extra headers, e.g. {"User-Agent":"curl/8.7.1"}
reasoningEffort  "low" = thinking off (fast); "medium" = better, ~2x slower
```

Key order: inline → env → keychain. Quick test: `CC_LLM_BASE` / `CC_LLM_MODEL` / `CC_LLM_KEY`.

Presets:

```jsonc
// Gemini (Google)
{ "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-2.5-flash", "apiKeyEnv": "GEMINI_API_KEY" }
// OpenAI
{ "baseUrl": "https://api.openai.com/v1", "model": "gpt-4o-mini", "apiKeyEnv": "OPENAI_API_KEY" }
// OpenRouter
{ "baseUrl": "https://openrouter.ai/api/v1", "model": "google/gemini-2.5-flash", "apiKeyEnv": "OPENROUTER_API_KEY" }
// Local (ollama / llama.cpp / vLLM)
{ "baseUrl": "http://127.0.0.1:11434/v1", "model": "llama3.1", "apiKey": "" }
```

<details>
<summary><strong>Config &amp; customization</strong> — user layer, precedence, handler contract</summary>

User settings live in **`~/.cc-turn-ext/`**, outside the package:

```
~/.cc-turn-ext/
├── config.json        provider / policy / handler overrides
├── prompts.json       your prompts (override the handler's defaults)
├── handlers/mine.mjs  your custom handler
├── state.json         dashboard live state (policy, override)
├── history.jsonl      activity log
└── cache/             patched binary (+ .orig backup)
```

Low→high precedence:

```
package defaults  <  handler prompts  <  ~/.cc-turn-ext/config.json  <  prompts.json  <  state.json (dashboard)  <  env
```

Customization:

```
Lv0  no files      dashboard: edit prompts / model / thresholds / policy live
Lv1  prompts       ~/.cc-turn-ext/prompts.json
Lv2  provider      ~/.cc-turn-ext/config.json (swap LLM / preset)
Lv3  logic         ccturn new-handler foo → handlers/foo.mjs   (kind: module)
                   or kind: command / http → any language, external process
```

Handlers yield Markdown chunks; yielding nothing does nothing:

```
ctx = { sessionId, cwd, sessionFile, events, chat, lastAssistant, lastUser }
kind: module (default) | command (stdin ctx JSON, stdout text) | http (POST → SSE)
```

</details>

## Internals (binary patch)

Claude Code is a code-signed Bun standalone (Mach-O). `core/patcher/patch.mjs`:

- finds the turn-end string anchor `continue}return{reason:"completed"}`,
- grows the `__BUN` segment by a page and injects a self-contained snippet, fixing offsets, module pointers, and Mach-O load commands,
- forces the injected JSC-bytecode module to fall back to source parsing,
- re-signs ad hoc with `codesign -f -s -`.

Because the anchor is a string literal, it survives minification and has re-patched cleanly across Claude versions.

<details>
<summary><strong>Structure</strong></summary>

```
cc-gemini-rewrite/            (package — never edit as a user)
├── core/                     ═ cc-turn-ext engine (provider-neutral) ═
│   ├── patcher/patch.mjs     binary patch (grow + fixup + re-sign)
│   ├── inject/snippet.js     injected snippet (stream_event + one commit)
│   ├── provider.mjs          OpenAI-compatible LLM client
│   ├── config.mjs            merged config loader
│   ├── paths.mjs             package + user-home paths
│   └── sidecar/              server · context · policies · resolve · scrub · state · dashboard
├── handlers/
│   ├── gemini-rewrite/       default handler: handler.mjs · rewriter.mjs · prompts.json
│   └── examples/             more handlers
├── defaults/config.json      package defaults
└── bin/ccturn                CLI: launch · setup · doctor · uninstall · new-handler · repatch
```

</details>
