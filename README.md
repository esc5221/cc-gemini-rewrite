**English** · [한국어](README.ko.md)

# cc-gemini-rewrite

When a Claude Code answer is hard to follow, **the moment the turn ends an LLM rewrites the same content so you actually get it, and streams it straight into Claude Code's own screen.** The conversation loop, transcript, and API history are left untouched.

```
you:    why is this slow? what's the cause?
Claude: several layers are intertwined and it can vary by situation, caching may
        be involved so behavior differs case by case. many factors combine, so
        it's hard to say definitively. …

        [cc-turn-ext] re-explained by Gemini        ← appended automatically at turn end
        The cause is a cache miss. Requests bypass the cache and fall all the way
        through to the lower layers, which is what makes it slow.
        Check: cache hit rate first. Next: per-layer latency logs to pin the bottleneck.
```

**`/rewrite` — trigger a re-explanation inline, right where you are:**

<a href="docs/demo.gif"><img src="docs/demo-poster.png" alt="cc-turn-ext — a sloppy answer re-explained cleanly by Gemini, inside Claude Code" width="820"></a>

▶ **[Play the demo](docs/demo.gif)** — 20s: a deliberately sloppy answer, re-explained clean by Gemini, right inside Claude Code.

<!-- The poster above is the demo's final frame. Clicking it opens the animated GIF.
     For a sharper INLINE video player: upload docs/demo.mp4 (gitignored) to any GitHub
     issue/PR comment or a Release, copy the resulting
     https://github.com/user-attachments/assets/... URL, then either
       - point both hrefs above to that URL, or
       - replace this whole block with a bare:  <video src="THAT_URL" controls muted></video>
     The MP4 then streams from GitHub's CDN and never lives in the repo. -->

Built on **cc-turn-ext**, a turn-end hook engine for Claude Code. The rewrite is the default handler; bring your own.

---

## Why

Claude Code's technical explanations are often hard to read. The conclusion is buried, they're vague, there's no *why*, and it's unclear what to do next. Every time, you re-ask — "what's the point", "say it simpler" — and the round-trips pile up.

This kills the re-asking. **When an answer is hard, the LLM fixes it up before you have to ask.** You pick the trigger: always rewrite when it's long (8+ lines), or let the LLM judge clarity.

## Why not a stop hook

Claude Code already has a stop hook. But building "re-explain" on it:

```
stop hook → LLM writes an explanation → that text is fed back to the Claude model
          → Claude reads it and parrots it back
          = one more round-trip + Claude reprocessing (slow, and filtered through Claude)
```

So it doesn't use the stop hook. It **hooks the exact code point where a turn ends, in the binary**, and streams the rewrite **directly into Claude Code's screen without going through the Claude model**. Nothing lands in the transcript or the next request.

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

## Install

macOS arm64 + [bun](https://bun.sh) + [Node](https://nodejs.org).

```bash
git clone <repo> ~/claude-work/cc-turn-ext
cd ~/claude-work/cc-turn-ext
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

**Whenever an answer is hard to follow, type `/rewrite`** — a clearer version streams in right below it, rendered inside Claude Code (not routed back through Claude). It also fires automatically on very long answers; that's a light safety net, `/rewrite` is the main way.

### `/rewrite` — the main way

Re-explain the previous answer on demand. It renders through the **same injection path** as the automatic one (streamed inline, no Claude round-trip):

```
/rewrite
```

The slash command sets a one-shot flag; the binary injection fires at that turn's end and force-rewrites the last substantial answer (skipping the slash turn's own reply). Works even when the automatic policy is `off`.

Steer it — append a request and the rewrite follows it:

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

Since `/rewrite` is the main way, the automatic policy is conservative by default — it only fires on very long answers.

```
off      never auto (pure manual — /rewrite only)
always   rewrite every response
lines    N+ lines → always (rule-based, no LLM. default 15, conservative)   ← default
judge    LLM judges clarity (5-line gate)
hybrid   N+ lines → always, below that let the LLM decide
```

Switch with `/ccturn lines|judge|hybrid|always|off`.

### Dashboard — `http://127.0.0.1:61237/`

Policy buttons · recent activity (original preview · reason · rewrite · latency) · live override (model, thresholds, prompts) without editing files.

## Provider

Any **OpenAI-compatible** endpoint. Set in config `provider`:

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

## Config & customization

Your settings live in **`~/.cc-turn-ext/`** — never edit the package, so updates never clobber your changes.

```
~/.cc-turn-ext/
├── config.json        provider / policy / handler overrides
├── prompts.json       your prompts (override the handler's defaults)
├── handlers/mine.mjs  your custom handler
├── state.json         dashboard live state (policy, override)
├── history.jsonl      activity log
└── cache/             patched binary (+ .orig backup)
```

Effective config = merge, low→high precedence:

```
package defaults  <  handler prompts  <  ~/.cc-turn-ext/config.json  <  prompts.json  <  state.json (dashboard)  <  env
```

Customization ladder:

```
Lv0  no files      dashboard: edit prompts / model / thresholds / policy live
Lv1  prompts       ~/.cc-turn-ext/prompts.json
Lv2  provider      ~/.cc-turn-ext/config.json (swap LLM / preset)
Lv3  logic         ccturn new-handler foo → handlers/foo.mjs   (kind: module)
                   or kind: command / http → any language, external process
```

Handler contract — yield markdown chunks; yield nothing = do nothing:

```
ctx = { sessionId, cwd, sessionFile, events, chat, lastAssistant, lastUser }
kind: module (default) | command (stdin ctx JSON, stdout text) | http (POST → SSE)
```

## Internals (binary patch)

Claude Code is a code-signed Bun standalone (Mach-O). `core/patcher/patch.mjs`:

- finds the string anchor `continue}return{reason:"completed"}` (the turn-end point),
- grows the `__BUN` segment by a page to inject a self-contained snippet (fixing Offsets, module pointers, Mach-O load commands),
- forces the injected module to fall back to source parsing (it's JSC bytecode),
- re-signs ad-hoc with `codesign -f -s -`.

The anchor is a string literal, so it survives minification — verified re-patching cleanly across Claude versions.

## Structure

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
