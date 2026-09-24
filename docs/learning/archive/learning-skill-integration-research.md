# Learning skill integration research

Verified 2026-09-18. Research only; no host settings, learning records, or runtime code changed.

## Verdict

Keep one canonical learning skill and the current live-source host adapters. Reconcile its teaching paragraph to support understanding-boundary calibration, then add optional native presentation; neither calibration nor Mermaid requires another service, skill, or memory format.

## Findings

1. **Progressive disclosure is supported; splitting everything is not required.** Codex loads skill metadata before the selected body and explicitly supports symlinked skill folders. Agent Skills specifies conditional resources and direct, relative references. Anthropic recommends concise bodies, conditional detail, and one-level reference links. These support keeping essential calibration rules in the body and moving only uncommon examples out. They do not establish a universally optimal word count. [OpenAI](https://learn.chatgpt.com/docs/build-skills), [Agent Skills](https://agentskills.io/specification), [Anthropic](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

2. **The existing integration already matches that design.** [Canonical skill](../../../learning/skills/learn/SKILL.md) measures 502 words. The live `~/.agents/skills/learn` symlink resolves to it. [Codex instructions](../../../learning/clients/codex/instructions.md) already allow necessary learner questions while suppressing operational narration; the same override is installed in `~/.codex/config.toml`. [Claude adapter](../../../learning/clients/claude/teach/SKILL.md) locates the repository and vault, reads the canonical file, and uses mounted paths. Ordinary canonical edits therefore need no updated uploaded package, provided live source access succeeds. This is a code-derived consequence, not a new claim about Claude folder permissions.

3. **Pi supports optional questions without MCP.** Installed `@earendil-works/pi-coding-agent` is **0.85.1**. Its extension API provides selection, input, editor, and custom UI; `ctx.hasUI` includes RPC, whereas `ctx.mode === "tui"` is the correct guard for terminal-only custom widgets. The installed `examples/extensions/question.ts` demonstrates free text and cancellation, but is an example rather than an automatically available built-in question tool. [Installed Pi extension documentation](/Users/edo/.nvm/versions/node/v24.19.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md:960).

4. **Mermaid already has a native Pi path.** Installed Pi documents `markdown.mermaid` modes `off`, `final`, and `streaming`, with `streaming` the default. No renderer package is justified for small diagrams. This verifies documented support, not rendering of every Mermaid construct or the current user's effective setting. [Installed Pi settings](/Users/edo/.nvm/versions/node/v24.19.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/settings.md:269).

## Minimal proposed structure

```text
learning/skills/learn/
  SKILL.md                 # essential teaching, calibration, continuity rules
  scripts/learn            # existing shared persistence interface
  references/teaching.md   # optional; only if concrete edge-case examples warrant it
learning/pi.ts             # existing host extension; optional question presentation
learning/clients/claude/teach/SKILL.md  # existing live-source locator
learning/clients/codex/instructions.md # existing communication override
```

**Proposal:** start with no new reference. Keep the body near its current size by replacing conflicting language, not appending another policy. If examples become necessary, use one direct conditional reference: “For ambiguous calibration or assistance evidence, read `references/teaching.md`.” Do not make every lesson read it. Keep Pi implementation instructions in runtime code/docs, outside the teaching skill.

Replace the restrictive current-question and no-assessment wording with a coherent rule such as:

> At the start of substantive or new-topic teaching, actively locate the learner's relevant understanding boundary. Use saved evidence to aim short probes, not assume present mastery. Ask for one explanation, prediction, or attempt at a time; use the response to check linked prerequisites until a credible foundation and next gap are clear, or the requested competence is demonstrated. Current attempts can supply this evidence. Stay within the task; never escalate beyond it merely to obtain a wrong answer. Teach from that boundary and adapt as new evidence appears. Explain directly when requested.

This wording follows the [calibration research recommendation](learning-calibration-research.md); it is a design choice, not a validated fixed-budget protocol. Preserve the existing evidence, assistance, uncertainty, and active-question rules. A declined question supplies no evidence of failure; do not turn it into an incorrect answer. Existing scope/topic records can express these observations without provider-specific fields.

## Host behavior and overhead

**All hosts:** ordinary natural-language questions remain the baseline. Use an available native question tool only when it improves the interaction and its actual tool instructions permit assessment. A host's preference/clarification tool must not automatically become a quiz tool. Prefer free response when assessing explanation or reasoning; label a selected option as recognition evidence, not demonstrated independent recall. Keep optional visuals to a small diagram that clarifies the current concept; otherwise use prose or a table.

**Pi:** one optional, sequential question tool, active only in TUI, can use existing dialog primitives. Use custom UI only if built-in selection/input cannot support the intended interaction. Preserve cancellation and free-text answers; in unsupported modes, ask in normal chat without repeatedly retrying the widget. The existing launcher restricts tools explicitly, so verify activation within that restriction during implementation. No dynamic tool-search layer is justified for one tool.

**Persistence seam:** [pi.ts](../../../learning/pi.ts) currently mirrors only user/assistant text. Answers returned as tool results would otherwise be absent from the Obsidian lesson. If widgets are added, normalize only their question, learner answer, and relevant assistance into the same lesson projection, including branch changes; do not copy arbitrary tool output or create a second learning store. Save learning evidence through the existing canonical interface.

**Codex and Claude:** preserve existing adapters and response instructions. The shared skill can request native Mermaid where the active host supports it; support should not be presumed across every client. Do not duplicate calibration into global overrides or the Claude locator. No bundled Claude releases, provider bridges, MCP server, or required subagent fanout.

**Tradeoff:** plain chat adds no tool schema or UI round trip. A Pi question tool adds a schema, invocation/result messages, UI state, and transcript handling; it may reduce selection friction but is not proven cheaper or educationally better. Conditional references avoid loading unused detail, but a tiny reference read on every lesson would merely add another file read. Native Mermaid avoids a render call while still consuming diagram tokens. These are structural inferences; no latency or token benchmark was run.

## Confidence

High for inspected wiring, the 502-word baseline, official progressive-disclosure guidance, and Pi 0.85.1's documented APIs. The proposed calibration language and minimal structure are reasoned design choices. Nothing here claims measured learning improvement, exact token savings, or universal cross-host rendering.

## Gaps

Implementation should verify one question/answer, cancellation, plain-chat fallback, and branch-safe lesson mirroring. Validate a small Mermaid example in Obsidian as the primary lesson surface; check other hosts only when claiming specific rendering behavior. This does not require a universal UI parity suite. Live model behavior, tool activation, and effective rendering settings were not tested. Folder attachment behavior is deliberately unchanged and was not re-investigated.
