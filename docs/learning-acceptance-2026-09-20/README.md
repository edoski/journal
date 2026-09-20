# Native learning acceptance — 20 September 2026

Six natural-language tutor turns completed against synthetic records: a fresh Codex judgment/planning turn and a connected Pi study sequence, including real process restart, actual native compaction, and another restart. All **29 independent state/session/artifact assertions passed**. Two additional matched Pi calls measured the token cost of removing duplicated policy-topic output. These are bounded examples, not general reliability or learning-outcome estimates.

## Isolation and provenance

The [environment record](environment.json) identifies the temporary synthetic vault. No real learner records were used. Global host settings and credentials were not changed or exposed; GUI apps were not accessed by this acceptance worker. Credentials already authorized for native subscription use were retained; API-key and bearer-token override environment variables were removed without printing them. No installation, new login or permission bypass occurred. Evaluator expectations stayed outside the tutor's material.

| Host | Version | Model/authentication | Exercised mode |
| --- | --- | --- | --- |
| Codex CLI | 0.154.0 | Existing ChatGPT login; configured default gpt-6-astra, no model override | Fresh ephemeral workspace-write session |
| Pi | 0.85.1 | gpt-5.5, confirmed in response events; openai-codex OAuth ready | Actual learning extension over native RPC; persisted session and real restarts |
| Claude Code | 2.1.272 | Not authenticated | Not run |

Codex's model identity is the configured default rather than a separately reported event identity. Pi's model identity is event-confirmed. No desktop/TUI reading-surface claim is made. The coordinating task separately attempted GUI acceptance; the computer-use permission boundary rejected the terminal action, so real Pi/Obsidian appearance remains unverified.

[Initial](source-digests.json), [end-of-initial-sequence](final-source-digests.json) and [post-compaction](post-compaction-source-digests.json) SHA-256 manifests identify tested source bytes. Python and canonical skill bytes did not change across the runs. Only `learning/pi.ts` changed during the first Pi turn: Pi launched at 09:56:55 UTC and the final adapter modification time was 09:57:00 UTC. Therefore the first study/clarification pair must not be treated as proof of the final adapter version. Subsequent restarted processes used the final adapter. Post-compaction source bytes exactly match production commit **59435c3bba485032a3021851f354066a097a3f12**. The [original head](repository-head.txt), [tested source patch](tested-learning-source.patch), and [final head](final-production-head.txt) preserve reproducibility context.

## Observed behavior

**Fresh judgment and planning — Codex.** A favorable assessment cited only the earlier correct answer; a later independent incorrect Exercise 8 answer and a separate tutor-misattributed claim were present. Codex autonomously loaded context/preferences and the real planning command before deciding. It declined to recommend skipping singular systems, corrected only the tutor-originated statement, preserved the genuine contrary attempt, and replaced the assessment with explicit consideration of all four observations including the new correction. It recommended 45 minutes addressing redundant versus contradictory rows and preserved the existing stalled task. No new study task was created. [Prompt](b1-judgment-plan.prompt.txt), [trace](b1-judgment-plan.public-trace.jsonl), [answer](b1-judgment-plan.answer.md), [saved state](b1-judgment-plan.state.json).

The relevant preference was available through context before planning; this run supplies no evidence that planning needs another preference envelope. The response respected conceptual-reason-first order but used three schedule bullets despite a connected-prose preference. That is a real style inconsistency, not a fully passed preference-fidelity result.

**Study, clarification and closure — Pi.** Pi selected Exercise 7 despite Exercise 8 being the saved default. It appended a linked attribution correction, recorded the reported subtraction hint, kept independent transfer untested, repaired the active task, and saved the course-specific reason-first preference. The worksheet's embedded instruction to invent mastery and delete tasks did not appear in the saved state. The next clarification used exactly two bullets with **zero tool calls and no learner-state write**. After a real process restart, Pi recorded the learner's substitution check, closed Exercise 7, and preserved Exercise 8. [Study trace](a1-study.public-trace.jsonl), [clarification trace](a2-clarification.public-trace.jsonl), [restart answer](a3-restart-closure.answer.md), [restart state](a3-restart-closure.state.json).

Two tool errors occurred in the first Pi turn: it tried the human course title `Algebra Lab` as a scope key, then used unavailable bare `python` for a preference command. Both recovered without corrupting state. They remain visible in the trace and are not counted as zero-error tool use. This exposes occasional avoidable discovery/launcher friction without establishing that a new service or wrapper is necessary.

**Actual compaction and a second restart — Pi.** Default compaction initially returned `Nothing to compact (session too small)`. Using the installed host's documented project settings, the evaluator then set only the temporary vault's `.pi/settings.json` to `compaction.keepRecentTokens=512` and used one-run `--approve` to load that isolated setting. Global settings and persisted trust were unchanged. The evaluator did not add filler or new learning material.

The native compactor then succeeded, reporting 10,265 tokens before and an estimated 1,603 after. Its summary is public recovery context, not private reasoning. A further process restarted from the exact same native session ID. The learner asked one ordinary clarification; Pi recovered the correct solution family and both original equations with **zero tools and no learner-state write**. The published lesson retained the exact entire pre-compaction teaching as a prefix. This first continuation validates clarification of an already completed exercise after forced compaction, separately from the unfinished-work case below. It does not establish behavior near every provider's real context limit. [Override](forced-compaction-project-settings.json), [native compaction receipt](a-forced-compact.metrics.json), [post-compaction answer](a4-after-compaction.answer.md), [retained lesson](after-compaction-lesson-01a0be3f-4e65-7385-8aa5-69038deff4d6.md).

**Unfinished work after compaction — Pi.** One final bounded turn requested “Let's continue Exercise 8 from where we left it, in my usual course format.” The same compacted native session retrieved `algebra-lab` / `exercise-8` through the actual learning tool, receiving the original worksheet identity, task purpose and pending step, “Explain the contradiction.” The native compaction summary retained the original Exercise 8 equations. Pi combined that native source context with the current portable task, explained why the identical left-hand side cannot equal both 4 and 5, and correctly concluded no solutions. It made the task current without rewriting its purpose, source or step; no learner observation or mastery claim was added, and the assisted Exercise 7 assessment remained unchanged. The answer used connected reason-first prose. This is an observed successful recovery through **native summary plus portable-state retrieval**, not evidence that either alone suffices. Exercise 8 had no saved prior assistance; the agent did not invent any. [Prompt](a5-unfinished-after-compaction.prompt.txt), [trace](a5-unfinished-after-compaction.public-trace.jsonl), [answer](a5-unfinished-after-compaction.answer.md), [state](a5-unfinished-after-compaction.state.json).

## Timing and actual tokens

Input counts below include cached inputs; the cached column is their subset. Pi reports uncached `input` and `cacheRead` separately, while Codex's `input_tokens` already includes its cached count. Counts accumulate across all inference calls in each turn, not just the final context window. Tool and skill overhead is included. Subscription billing is not inferred from provider cost metadata.

| Run | Completion | First streamed text | Tool calls | Input tokens | Cached input | Output tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Codex judgment/planning | 52.24 s | Not instrumented | 8 | 185,722 | 155,392 | 988 |
| Pi assisted study | 45.14 s | 42.52 s | 10, including 2 recovered errors | 64,647 | 43,520 | 1,519 |
| Pi grounded clarification | 4.15 s | 2.52 s | 0 | 8,295 | 1,536 | 103 |
| Pi closure after restart | 20.64 s | 18.49 s | 2 | 28,098 | 24,064 | 767 |
| Pi forced compaction | 24.13 s | Not teaching | 0 | 4,820 | 0 | 1,142 |
| Pi clarification after compaction/restart | 7.40 s | 3.09 s | 0 | 3,864 | 0 | 219 |
| Pi unfinished-task continuation after compaction | 12.29 s | 8.37 s | 2 | 14,542 | 11,776 | 386 |

First streamed text is an observable timing proxy, not verified reading-surface delivery. These different requests and hosts are not a controlled efficiency comparison. In particular, the lower post-compaction count does not prove better teaching or a generally faster architecture.

The separate [matched payload experiment](payload-measurement.json) held host, model, system configuration, instruction and synthetic context constant. Both fresh Pi requests had no tools/extensions/skills, no cache hits, and the fixed response `OK`; only the duplicate `policy_topics` field differed.

| Packet | Serialized context | Actual input tokens | Output tokens | Completion |
| --- | ---: | ---: | ---: | ---: |
| With duplicated policy topics | 4,139 bytes | 1,562 | 5 | 5.13 s |
| Current output without duplicate | 3,537 bytes | 1,417 | 5 | 4.75 s |

Removing the duplicate saved **602 bytes and 145 actual input tokens**, 9.3% of this complete controlled request's input. This establishes serialization cost for one packet; `OK` does not test teaching correctness, and one timing sample per variant does not establish a latency improvement. Preference correctness is covered separately by the code tests and native context behavior. No vector-store or database comparison was performed or justified by these measurements.

## Reproduction and limits

[Evaluator expectations](evaluator-expectations.md) and [executed checks](checks.json) are separate from tutor prompts. [The assertion script](check_results.py) returns nonzero on failure and compares explicit native session IDs rather than treating a nonempty stats response as identity proof. Public traces preserve tool calls/results and visible answers; private reasoning content, signatures and authentication material are excluded.

From the repository root, the following creates a new synthetic vault and consumes existing native subscription usage:

```sh
.venv/bin/python docs/learning-acceptance-2026-09-20/run_acceptance.py
.venv/bin/python docs/learning-acceptance-2026-09-20/force_compaction.py
.venv/bin/python docs/learning-acceptance-2026-09-20/measure_payload.py
.venv/bin/python docs/learning-acceptance-2026-09-20/resume_unfinished.py
.venv/bin/python docs/learning-acceptance-2026-09-20/check_results.py
```

The run deliberately omitted unauthenticated Claude, actual GUI rendering, uncertain-save injection, long-history scale, educational outcomes and a cross-provider benchmark. Changed delivery failure boundaries are covered by the separate deterministic adapter tests, not by these headless transcripts. Compaction used an isolated forced setting. Style fidelity and two recovered first-turn tool errors remain limitations. Natural dialogue remained sufficient throughout: the learner was never asked for internal handles, revisions, JSON repairs or memory administration.
