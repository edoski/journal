# Sessions, compaction and caching

How a lesson's conversation with Claude is kept, compacted and cached since lessons moved onto the Claude Agent SDK (14 Nov 2026, SDK 0.3.319 on Claude Code 2.1.319).

## Two stores, one owner each

The lesson record, `data/chats/<id>.json`, stays what every page reads: the transcript as `LhMessage`s, the plan tree, the usage logs. `src/store/chats.ts` is its only writer.

The model's memory is the lesson's Claude Code session. Claude Code owns it: the real multi-turn conversation with the model's own tool calls and thinking, its prompt cache and its compaction. The record maps to it with `session: { id, synced, anchor?, cut? }` (`src/core/sdk-session.ts`). `synced` is the last record message the session holds, so a turn sends the model only what came after it, as one user message: the learner's words and photos, marker texts, and each answer tagged with the question call it answers (`<answer tool=… call=…>`). A question call itself returns a placeholder that ends the turn (`claude/endTurn`).

## One turn

`src/agent/sdk/agent.ts` runs one `query()` per turn: it resumes the session, owes it the record's new inputs, runs the app's tools in-process (`src/agent/sdk/tool-server.ts`), and emits the same agent events the turn runner and the views always read. A clean question, problem pose or mode handoff ends the turn once every such call of the reply resolved cleanly; a malformed one is retried within the turn. Tool results wait for the end of the reply that called them, since Claude Code starts a tool while the reply still streams. A steer (a helper's result, a composer message) is pushed into the running turn and joins the record only when Claude Code reports reading it; one still unread when a question ends the turn goes back to its queue.

A turn that fails or is stopped marks the session `cut`; the next turn resumes at `anchor`, the session's last entry before the failure, so the dropped attempt never reaches the model, and re-sends the input.

## Where the session lives, and when it is gone

Claude Code keeps a session as `<config dir>/projects/<working folder>/<id>.jsonl`, per account, and deletes transcripts older than 30 days. After every turn the app copies the file beside the record (`<id>.session.jsonl`, `src/agent/sdk/session-files.ts`) and puts it back before a resume that would not find it, including after an account switch. The copy is opaque: the app never parses it. A lesson that has no session to resume (one that predates sessions, or whose session is gone from both places) gets one seeded from its record on its next turn (`sessionSeed` in `src/core/sdk-session.ts`, `seedSession` in `session-files.ts`): the conversation as the session would hold it had the lesson run on the SDK from its start, his messages and answers as user turns, the tutor's replies and tool calls with their results as assistant turns, cut where the record's own compaction cut it, written in Claude Code's transcript format, which the SDK does not document. The seed is resumed like any session from then on. Only when seeding fails does the turn fail with a message to pick the topic up again from its topic page.

## Compaction

Claude Code compacts a lesson's session itself, at its own point: its automatic compaction, on by default, fires inside a turn once the conversation nears the window Claude Code resolves for the model (980k tokens for Opus 5.5's 1M window on 2.1.319), and Claude Code may precompute the summary in the background. The app has no trigger, threshold or `/compact` of its own (Edo, 15 Nov 2026). It gives the summary the lesson's instructions (`compactionInstructions`: the learner's understanding, the teaching arc, the plan tree as it stands then, the current moment) through Claude Code's PreCompact hook, whose `systemMessage` Claude Code appends to the compaction's instructions (`src/agent/sdk/agent.ts`). Each compaction lands in the record as a compaction marker holding the summary its PostCompact hook reports (`compact_summary`, without the analysis the model drafts before it). The summary message Claude Code adds to the session is not read: its shape differs between a manual and an automatic compaction, and it wraps the summary in Claude Code's own framing. For a check that must reach a compaction in a short lesson, Claude Code's own `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (a percentage of that window) lowers its point.

## Caching

Claude Code places the cache over the real conversation, with the one-hour lifetime a subscription gets. Each turn's usage, cache reads and writes included, lands in the record's `turns` log.
