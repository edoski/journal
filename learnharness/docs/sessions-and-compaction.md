# Sessions, compaction and caching

Why LearnHarness keeps its own lesson records and its own compaction instead of Claude Code's sessions, and what moving to native sessions would take. Written 13 Nov 2026, Claude Code 2.1.319.

## How a lesson is stored today

Each lesson is one JSON file, `data/chats/<id>.json` (under `LH_DATA_DIR`; in the desktop app, Electron's `userData/data`). `src/store/chats.ts` is its only writer and writes it atomically. The file holds the transcript as pi-agent-core messages (`LhMessage`: user, assistant, tool results, plus the app's markers for questions, plans, mode handoffs and compaction), the plan tree, and two usage logs (`turns`, `extractions`). Opening a lesson reads that file; every page (the lesson, the topic page, the sidebar, the calendar) derives its view from it.

This is the app's own format, not Claude Code's. Claude Code writes `~/.claude/projects/<project>/<session>.jsonl`, and its docs call that format "internal to Claude Code and changes between versions, so scripts that parse these files directly can break on any release" (code.claude.com/docs/en/sessions). The Agent SDK reads the same files through `listSessions` and `getSessionMessages`. Neither stores the app's questions, plans or attempts, and neither covers the ChatGPT path. Keep the app's record as the one source of truth.

## How a Claude reply runs today

Each model call spawns `claude -p --no-session-persistence` (`src/agent/claude-cli.ts`) and replays the whole transcript as one user message (`claudeTranscriptBlocks`, `src/agent/claude-stream.ts`). The app's tools are declared to Claude Code as MCP tools that never answer: the app kills the CLI at the first `tool_use` and runs the tool in pi's agent loop, then replays again. `DISABLE_AUTO_COMPACT=1` is set, so Claude Code never compacts; the app's compaction (`src/server/compaction.ts`, `src/core/compaction.ts`) summarizes old turns into a marker once the transcript passes min(150k tokens, the model's window less a 16k reserve).

Caching: Claude Code caches automatically, with a one-hour lifetime for `-p` runs on a subscription within plan usage (code.claude.com/docs/en/prompt-caching, "Which TTL each request gets"). The system prompt and tool list are identical across calls. The replayed transcript only grows at its end, so each call's prompt extends the last one's; whether that hits the cache inside the single user message is not documented. The app records `cache_read_input_tokens` per call in each lesson's `turns` log, so one real lesson answers it (no lesson exists in the journal checkout's data yet).

## Could Claude Code's own sessions and compaction replace this?

Possible, not clean. What the CLI offers: `--session-id`, `--resume <id>`, `--fork-session`; auto-compact in `-p` and the SDK with a `compact_boundary` event; the same one-hour cache. What moving would mean:

1. **Tools.** A resumed session would end on the `tool_use` the app killed. The app would have to stop killing the CLI and answer tool calls through the MCP server (or stream-json input) instead of pi's loop: a rewrite of `claude-stream.ts` and of how every tool runs.
2. **Two transcripts.** The app's record still drives every page and the ChatGPT path, so the lesson would live twice, and Claude Code's compaction summary would be invisible to the app's views.
3. **Edit and retry.** The app rewrites history (retry a failed turn, recover a malformed question, dismiss a problem). The CLI has no resume-at-message; only the SDK's `resumeSessionAt` and `forkSession(upToMessageId)` can rewind, so each edit would fork a new session.
4. **Model and prompt changes.** A resumed session keeps its system prompt until it compacts, and a model switch re-reads the whole history uncached (prompt-caching, "Switching models").
5. **Usage.** `--resume` re-sends the full history each turn just as replay does (prompt-caching, "How the cache is organized"); only the cache match could differ.

Verdict: keep the architecture. The setting is gone; the threshold now follows the model's window in code. Revisit only if a measured lesson shows replay missing the cache: the first step then is `--session-id` plus `--resume` as a cache optimization over the app's own record, with replay as the fallback, not a move of the record into Claude Code.
