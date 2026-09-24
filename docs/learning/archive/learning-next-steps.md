# Learning: calibration, questions and native visuals

> Historical investigation: implementation descriptions and proposals below reflect an earlier snapshot and are not the current runtime contract. See the [current learning README](../../../learning/README.md) and [behavioral acceptance cases](../behavioral-acceptance.md). Research claims retain their stated dates and limitations.

Research synthesis, 18 September 2026. Five bounded investigations; no learning runtime, installed skill, provider setting or vault data changed during this round. The recommendations below are not yet implemented.

The later [integrated context and teaching design](learning-context-retrieval-design.md) supersedes this document's no-schema-change conclusion and summary-only response to limited retrieval. It also adds the assistant-focused lesson view and shared response-delivery rule. This document retains the earlier calibration, quiz and native-visual research context.

## Decisions

| Proposal | Smallest useful change | Keep out |
| --- | --- | --- |
| Understanding calibration | Replace the canonical skill's implicit calibration guidance with a proactive, task-bounded loop | Mandatory failure, exhaustive prerequisite surveys, routine plan approvals |
| Durable understanding evidence | Clarify how existing summary, gap, evidence and active fields are written | New schema, graph, mastery score, memory service |
| Pi questions and quizzes | One optional sequential tool plus explicit question/answer lesson mirroring | Two overlapping tools, cross-extension UI mutex, second grading model |
| Obsidian visuals | Brief native Mermaid guidance in the existing skill | Separate visual skill, PNG pipeline, renderer installation, routine maker agents |
| Provider integration | Keep the current canonical skill and live adapters | Copied provider policies, uploaded runtime releases, MCP server |

## Teaching behavior

At the start of substantive or new-topic teaching, use the current attempt and a short adaptive probe to establish the learner's relevant starting point. Saved evidence helps choose the probe; it is not proof of present mastery. Follow only prerequisites implicated by the requested task. Ask one question at a time and wait for its answer.

Proceed when there is a credible foundation and actionable gap, or sufficient demonstrated competence for the requested task. Do not escalate beyond that task merely to obtain an error. Direct-explanation requests and an explicit lack of prior knowledge should allow immediate teaching. Connect each explanation to the established foundation; check application where it changes the next teaching decision. A broad lesson may warrant a short agreed path; an exercise does not need a mandatory plan ceremony.

Replace conflicting existing wording rather than layering a second policy over it. The research supports distinguishing assistance, reasoning and delayed retention; this exact conversational loop is a design choice, not a validated universal tutoring protocol. See [calibration research](learning-calibration-research.md).

## Memory and context

Keep the dated, narrowly evidenced independent foundation in the topic summary; keep the current observed breakdown and uncertainty in its gap. Append meaningful observations, including actual assistance. Preserve the exact pending question and prior help in active work. A fresh tutor should recover that boundary without assuming full mastery or starting the assessment again.

This matters because routine retrieval returns only the latest three observations. Decisive older evidence must remain represented in the compact summary; retrieve full history only when reconciliation requires it. No schema or persistence change is justified. See [memory investigation](learning-calibration-memory.md).

## Pi interaction

Ordinary conversation remains sufficient for explanations and free reasoning. Offer the optional widget when selecting an answer improves the interaction. Use the installed Pi extension API and TUI mode checks; outside supported mode, use plain conversation. Native host question tools may have restrictions that make them unsuitable for assessment.

Publish the question into the Obsidian lesson before opening the input dialog, without exposing its answer key or feedback. Persist the actual displayed choices and the learner's response so resume and branch reconstruction reproduce what happened. Keep skipped, unknown, selected and free-text responses distinct. Stable choice IDs without randomisation are the simplest initial option.

Exact-choice checking can be deterministic. Whether the answer key is correct and what free reasoning demonstrates remain tutor judgments. The ordinary tutor turn records evidence through the existing helper; no separate grading agent or quiz-specific learning store is needed. Tool schemas and invocation/results still consume context, so a widget is an optional UX feature, not a demonstrated token optimisation. See [Pi quiz research](learning-pi-quiz-research.md).

## Visuals and subscription use

Use small native Mermaid blocks for relationships that benefit from a diagram, with equations in normal Markdown when that is clearer. The current Pi mirror already transports these blocks. Prefer plain diagram labels and basic syntax; inspect the conceptual claim of each relationship. Syntax validity alone does not establish truth.

No routine image export, renderer invocation or subagent pass is warranted. Generate assets only for exact geometry, plots or explicitly requested exports. Obsidian is the primary rendered reading surface; identical presentation in every provider is not required. See [visual research](learning-obsidian-visual-research.md).

Keep essential rules in the single learning skill. Add a conditional reference only after repeated use shows a need for examples. Preserve the live Claude locator and local skill links; normal canonical edits remain available without a new uploaded Claude package. Subscription savings are not quantified: the justified reductions are fewer compulsory stages, no extra grading/visual model calls, and no additional routine references. See [skill integration research](learning-skill-integration-research.md).

## Implementation order and verification

1. Revise calibration and evidence guidance together; include a short native Mermaid instruction. Check a new topic, an already-demonstrated task, an assisted correction, and a direct-explanation request. Confirm provider handoff retains the exact pending work and assistance.
2. Add the optional Pi question tool and its readable lesson events together. Verify tool activation, publish-before-dialog ordering, hidden answers, cancellation, free response and resume/branch reconstruction using temporary sessions.
3. Verify one ordinary Mermaid lesson in Obsidian. Add no asset pipeline or wider rendering suite without a concrete requirement.

Use existing storage tests; add focused tests only for new widget/mirror behavior. Keep model checks small and representative, and remove their synthetic data afterward. Real study records and source material are outside this research and test scope.
