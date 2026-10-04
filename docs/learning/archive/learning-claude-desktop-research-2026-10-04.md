# Studying in the Claude desktop app: research, 2026-10-04

Three parallel investigations of what concentrating the study experience in the
Claude desktop app (instead of Pi and the Obsidian lesson mirror) would imply:
the app's current capabilities, the architecture and cleanup it would allow, and
study opportunities and risks. Claims were checked against support.claude.com,
claude.com/docs, code.claude.com and modelcontextprotocol.io on this date; the
product changes quickly, so re-verify before building. Nothing here is decided.

## Product facts that shape the decision

- Chat and Cowork merged into one experience (2026-09-16, rolling out to Pro and
  Max). From 2026-10-06 new Cowork tasks on Pro and Max run in Anthropic's cloud;
  local folders and local MCP servers are reached through the open desktop app
  only, and some pages state that local MCP servers do not run in cloud sessions.
  The Code tab (Claude Code) is the only fully local agent in the app.
- Uploaded skills run their bundled scripts in the cloud code-execution sandbox,
  not on the Mac. The current Claude client route (mounting the repo and running
  `scripts/learn`) may therefore act on cloud copies and miss the real lock,
  registry and Journal data. Test one session before and after 2026-10-06.
- Local MCP servers (`claude_desktop_config.json`, or `.mcpb` desktop extensions)
  run on the Mac; tool results are sent to Anthropic as conversation content.
  Per-tool permissions: read-only tools can run without prompting, others ask
  until "Always allow", destructive ones always ask. Results ≤ ~150k characters,
  240 s timeout; no sampling or resource subscriptions.
- MCP Apps (interactive HTML rendered in the chat, able to call server tools and
  post messages) work on web, desktop and mobile; mobile requires a remote
  connector. Custom inline visuals are web and desktop only and are not saved.
- Projects give per-course knowledge files (30 MB each, retrieval beyond the
  context window), instructions and separate memory; Claude never writes back to
  project knowledge.
- Claude's built-in memory is on by default for Pro, updates itself during chats,
  has no documented API and competes with the engine's record of the learner.
- Voice mode (Italian since 2026-07-23, beta) uses the chat models and tools;
  Cowork and Code get dictation only.
- Claude Docs (beta) are cloud documents with comments and export but no version
  history; their guide restricts formulas to display LaTeX blocks.
- Scheduled tasks created in the cloud cannot reach local folders or local
  connectors; Code-tab scheduled tasks run locally while the app is open.

## Architecture if Pi is dropped

The recommended shape is one small local MCP server (`learning/mcp.py`,
stdlib-only JSON-RPC over stdio, ~300 lines plus tests) in front of the unchanged
v6 engine, registered in Claude Desktop, Claude Code and Codex alike:

- Tools: read-only `resume`, `show`, `search`, `plan`, `list_sources`
  (`readOnlyHint`), `save` and `add_sources` (non-destructive writes, idempotent
  observations), `forget` (`destructiveHint`, always confirmed); an optional
  `course` argument resolved through the workspace registry, since Desktop has no
  working directory.
- Prompts: `study` (playbook plus a fresh `resume` — the only guaranteed preload),
  `review`, `mock_exam`, `plan_week`. Resources: courses and per-course
  orientation. Server `instructions`: a short router (Codex and Claude Code read
  them; Desktop unverified).
- The real `learn` skill uploaded to the account names MCP tools instead of
  `scripts/learn`; one Project per course binds the course and notation.
- Notes: nothing automatic by default; a `write_note` tool writes requested
  summaries into `.study/lessons/` for Obsidian.

What disappears (about 2,100 lines plus ~700 shrinking): `pi.ts` and its 972-line
suite, `runtime.py`, the lesson-session ownership and region machinery,
`correct_lesson`, the quiz widget, Pi conversations, private launches and the
no-save environment toggle (replaced by blocking write tools and incognito chats),
the Codex instructions block, Node in the quality gate. The engine, Journal
integration, preferences, sources and registry stay.

What is lost or gets worse: turn termination on save (one extra short model call
per saving turn), hidden bookkeeping (tool calls show as collapsible blocks),
deterministic preload and re-orientation unless the `study` prompt is used,
automatic note mirroring, provider choice inside Desktop (Codex still drives the
same server), offline use, and phone access without a remote connector.

## Study opportunities, ranked

1. The MCP server itself: one record reachable from chat, voice, artifacts and
   MCP Apps; a remote deployment would add phone and scheduled-task reach at the
   cost of exposing study data behind an endpoint.
2. Oral-exam practice in voice mode (Italian, push-to-talk), graded afterwards in
   text with observations saved there.
3. Paper-first practice: photographed handwritten work, transcribed to numbered
   LaTeX and confirmed by the learner before diagnosis; locations cited by photo
   and line.
4. One Project per course grounded in official solutions and past exams (hints
   anchored to verified steps, as in Kestin et al. 2025).
5. Retrieval artifacts with idea-unit self-scoring feeding a narrow
   `record_review` tool (desktop and web only).
6. Due reviews delivered outside the chat: Journal notifications or Reminders
   placed in study windows; Code-tab local scheduled tasks; cloud tasks only with
   a remote connector.
7. Predict-then-manipulate interactive visuals for linear maps and distributions.
8. Code-tab Remote Control as a phone bridge until a remote connector exists.
9. An MCP App review deck that renders on mobile.
10. Timed, interleaved mock exams from past papers, answered on paper.

## Risks

Two memories drifting (pick a policy: memory off for study chats, or the engine
declared the only learner record and Memory > Topics checked); drift toward
answer-giving in a general chat app (always load the skill; avoid stacking the
Learning style); product churn (keep the engine host-independent and adapters
thin); privacy (uploads, voice transcripts and tool results are processed by
Anthropic; disable training opt-in); usage limits shared across chat, Code and
voice; no offline mode.

## Suggested first steps

Verify the current Claude Desktop route before and after 2026-10-06; set up one
course Project and a memory policy; try a ten-minute voice oral on due topics;
add the photo transcription-check protocol to the skill; if Desktop becomes the
primary surface, build the MCP server first and delete Pi only after the
Desktop acceptance cases pass.
