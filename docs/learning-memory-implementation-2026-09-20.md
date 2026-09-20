# Learning memory implementation — 20 September 2026

The approved [integrated plan](learning-memory-integrated-plan-2026-09-20.md) is implemented in commit `59435c3bba485032a3021851f354066a097a3f12`, from baseline `e0ed30436feb9ba2ed0c4b5eb4d2fd1ce15c63c0`. The live learning store now uses schema 5. Natural-language study remains the interface; agents own retrieval, evidence attribution, continuation and saving.

## Delivered behavior

Assessments and reviews now distinguish supporting observations from the exact `considered_observations`. Partial consideration, missing support, historical unknown coverage and uncovered relevant corrections keep an interpretation pending. Same-patch aliases work for considered evidence, so an attempt, correction and revised interpretation still fit one atomic save. Historical coverage is never inferred from the previous watermark. The declaration records what the agent claims to have considered; it cannot establish attention or sound judgment.

Retrieval returns support and correction closure for the interpretations it presents without recursively importing interpretations from incidental topics. Query completeness still describes the selected observation page. Active policy selection remains separate; duplicate `policy_topics` data is removed only from the final CLI payload, after preferences are resolved.

Planning retains assessment/review evidence and adds explicit unfinished-task links, frame, current-step and direct-prerequisite evidence, corrections and source locations. Future-only history stays out. A fresh native planning run obtained the applicable preferences through ordinary context retrieval, so no second preference envelope was added.

Pi now distinguishes lesson publication from known display failure. Spawn errors, nonzero exit, signal termination and delayed opener failures expose the current teaching and keep subsequent teaching readable. Session/branch guards reject stale callbacks. Explicit reload permits a fresh opener attempt; ordinary turns do not repeatedly reopen Obsidian. Correction receipts claim saving, never verified display.

The canonical teaching instructions now make exact diagnostic evidence, assistance attribution, considered evidence and meaningful-change-only saving explicit. Existing task hierarchy, source identities, correction history, local locks, revisions and atomic publication remain the owners of continuity. JSON remains canonical. No vector service, additional state model, per-turn reflection or generic retrieval framework was introduced: neither the research review nor these measurements established a need for one.

## Validation and rollout

The full repository gate passed on the final production implementation: **730 Python tests, 22 Pi adapter tests, Ruff lint/format, strict mypy across 136 modules, all 10 import contracts and unchanged rendering fixtures**. Independent Standards and Spec reviews of the fixed implementation range each reported **zero actionable findings**. The adapter tests cover the changed failure paths; native evidence and its limits are recorded separately below.

The schema-4 to schema-5 conversion was applied to the live `smm` scope, revision 16 → 17. Exact pre-conversion bytes and a checksum manifest were verified in `learn/backups/schema4-to5-20260920T100038Z-a4f0792d` under the configured learning vault. All **13 observations, six topics and one task** were preserved. Preferences and all **six lesson files** were byte-identical. Only schema/revision metadata and the replacement of old coverage watermarks with unknown considered evidence changed. Six historical assessments and two reviews remain pending until naturally reconsidered. Repeating migration was a no-op. Personal state and backups are outside this repository.

The installed Codex/Claude skill links resolve to the canonical repository skill. The installed launcher points to this repository runtime. Reading `smm` through the installed skill returned schema 5, revision 17 successfully; no configuration reinstall was needed.

## Native evidence and remaining limits

The [sanitized acceptance bundle](learning-acceptance-2026-09-20/README.md) contains synthetic fixtures, natural learner prompts, public tool traces, saved state, source digests, host versions and executable assertions. Six actual authenticated Codex/Pi teaching turns exercised evidence correction, readiness/planning, scoped preferences, quiet clarification, task closure, process restart and native compaction; **29 state/session/artifact assertions passed**. After compaction, Pi resumed an unfinished exercise using the native summary plus explicit portable-task retrieval, preserved its original purpose/source/step, and added no invented learner performance. The report distinguishes this from clarification of the already completed exercise. Compaction used a documented setting confined to the temporary project; this is not a claim about arbitrary long sessions or every provider's context limit.

The matched payload-only experiment measured **1,562 → 1,417 input tokens**, a saving of **145 tokens (9.3%)**, for one synthetic context after removing duplicate policy topics. Both controlled requests returned `OK`; this establishes serialization cost, not teaching equivalence. Single timing samples do not establish a latency improvement.

Native runs also exposed two recovered tool errors (a guessed scope key and unavailable bare `python`) and one connected-prose preference inconsistency. These remain documented observations; the learner was never asked to repair JSON, supply internal handles or administer memory. They do not justify a new service or broad wrapper on this evidence.

Actual Pi/Obsidian GUI acceptance remains unverified: computer use rejected access to Ghostty for safety reasons, and that restriction was not bypassed. Claude was unauthenticated and was not exercised. Initial Pi launch overlapped the final adapter edit; later restarted processes used the exact committed source. The native report preserves that provenance limitation. Neither deterministic checks nor these bounded dialogues prove educational efficacy, calibrated mastery, universal preference adherence or end-to-end display delivery.
