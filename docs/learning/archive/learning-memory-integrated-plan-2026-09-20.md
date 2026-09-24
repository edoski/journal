# Learning memory: integrated assessment and implementation plan

20 September 2026. This plan reconciled the independent GPT-6 Pro audit with the earlier local [architecture assessment](learning-memory-architecture-assessment-2026-09-20.md) and [research comparison](learning-memory-research-refresh-2026-09-20.md), superseding their proposed implementation order. The approved repairs are now implemented; see the [implementation and rollout record](learning-memory-implementation-2026-09-20.md) and [native acceptance evidence](learning-acceptance-2026-09-20/README.md). The remaining text preserves the assessment and decisions made before implementation; its descriptions of current defects and outstanding work refer to that baseline.

## Decision

Keep canonical JSON records, the existing Python ownership boundaries, and thin native-client adapters. First repair evidence coverage and the completeness of decision context, then ensure known reading-surface failures leave teaching accessible. Validate these changes through ordinary study dialogue. Payload optimization follows as bounded measurement work.

The external audit adds two concrete defects to the previous plan: unfinished-task evidence can be absent from planning, and a known Obsidian-open failure leaves Pi teaching hidden. It also improves the assurance plan by distinguishing saved artifacts, actual delivery, semantic continuation, and educational outcomes. These are useful corrections to the original priority order.

## Evidence and reconciliation

The supplied audit is `/Users/edo/Downloads/journal_learning_audit_2026-09-20.md`, SHA-256 `1b35b8b872138e39667ebc7fc543296e4ad676ae59a2c0464683b0458c62e4fd`. Its recommendations were evaluated as proposals, not executed as instructions. Its referenced reproducibility bundle was not supplied with this file; its original executions were not independently inspected.

The audit names commit `4121e1106c3aa1e07101cf66999ac36f0c328fd0`; the local checkout is `e0ed30436feb9ba2ed0c4b5eb4d2fd1ce15c63c0`. Although the pinned commit is absent from the local object database, its public Git tree was retrievable. All **43 pinned files under `learning/` and `tests/learning/` matched local file bytes by Git blob hash**. Direct remote-byte comparisons also matched planning, assessments, and Pi. The findings therefore apply to the inspected code, rather than relying on similar-looking versions.

Three bounded independent reviews covered coverage/retrieval, Pi delivery/host boundaries, and research/UX. The coordinating review independently exercised planning through real CLI saves and reads. Only documentation and temporary synthetic artifacts were written; application code, tests, live learner records, installed configuration, Flow and shortcuts were unchanged.

| Finding | Reconciled verdict | Current evidence | Plan effect |
| --- | --- | --- | --- |
| External F1: reviewed coverage | Confirmed; matches the earlier local finding | Independent temporary-store reproduction plus source inspection | First correctness repair; explicit considered evidence |
| Earlier local finding: missing assessment support in retrieval | Retain separately; F1 does not repair it | Cross-topic support can be omitted while the selected query is complete | Include in the same evidence-contract work |
| External F2: planning omits task context | Confirmed and strengthened | Reproduced through actual schema-4 CLI publication and planning, without boundary doubles | Add bounded task-linked evidence/source assembly |
| External F3: Obsidian-open failure hides teaching | Confirmed and strengthened | Actual extension/Python publication with a stubbed opener; nonzero and signal failures | Add host-local fallback before optional efficiency work |
| External F4: client assurance | Accept as an evidence gap | Existing live report is bounded; current deterministic gate passes | Small natural-language acceptance set, durable sanitized traces |
| External F5: efficiency | Accept as conditional optimization | Duplicate payload exists; prior local timings do not show a storage bottleneck | Defer new retrieval modes/caches until matched measurements |

### Evidence coverage: revise the mechanism, preserve the objective

Current `assessments.stamp` assigns the maximum ID of every stored observation as `reviewed_through`. A partial read can therefore lead to `pending=false` even with unread same-topic contrary evidence. An independent reproduction added an unrelated third observation and obtained watermark 3 after reviewing only observation 1. Snapshot consistency does not establish review coverage.

Prefer a small explicit contract over the earlier assessment's possible coverage receipt:

- `observations` continues to identify support for the claim.
- A replacement assessment/review declares the exact `considered_observations`, including evidence reviewed but not supporting the final claim.
- Validate distinct existing handles and require support to be included in the declaration. Resolve local aliases before validation so a new attempt, correction, interpretation and checkpoint still fit one save.
- Define relevant evidence as the correction closure of all observations tagged with the assessed topic plus its explicitly cited supports. Do not import entire histories merely because a cross-topic support mentions another topic.
- Keep an interpretation pending when coverage is unknown, support is absent, or the relevant set is not covered. Partial interpretations may remain saved and explicitly pending.

Exact IDs catch holes that a largest-ID watermark cannot. This remains declared consideration, not proof of attention, understanding, or valid inference. No client read ledger, signed receipt, reflection service, or routine per-turn full read is required. Ordinary evidence/task saves and unchanged follow-ups remain unaffected. Assessments are refreshed only when a consequential decision needs them or meaningful new evidence justifies the update.

The audit's rename-only alternative is honest about mechanics but insufficient for the desired autonomous workflow: planning currently uses `pending=false` to omit broader topic history, and the skill uses pending as a reconciliation signal. Renaming the watermark without changing consumers leaves the same omitted-evidence path. Prefer the explicit declaration.

Historical considered evidence must remain unknown. Never infer it from old watermark values, support lists or the whole old snapshot. A necessary one-time representation conversion may preserve uncertainty; “do not migrate to invent certainty” is not a prohibition on an honest format conversion. Choose the schema change during implementation, keep one current runtime contract, and preserve old evidence and assessments. No migration belongs in this review turn.

### Context completeness: cover the claims and tasks actually presented

The earlier local support-delivery issue remains independently important. `retrieval.complete` describes completion of the selected observation query. It does not promise that every returned assessment has its support loaded. Preserve this distinction. For selected interpretations, return support and correction closure or exact unloaded-support handles that the agent must resolve before relying on the claim. Do not recursively import assessments from every incidental topic, and do not let evidence expansion activate unrelated preferences.

Planning has a parallel assembly omission. The real CLI probe created a valid task with direct evidence `o1`, frame evidence `o2`, current-step evidence `o3`, direct-prerequisite evidence `o4`, future-only evidence `o5`, assessment support `o6`, a correction `o7 → o1`, and a task reference to `worksheet`. All were published together through `python -m learning save`.

`python -m learning plan demo` returned the unfinished task and a non-pending assessment, but observations contained only `o6` and sources were empty. The missing task context is therefore not an artifact of the external audit's boundary doubles. The desired output additionally includes `o1,o2,o3,o4,o7` and the worksheet location; `o5` should not be added merely because it belongs to a future plan node.

Reuse `task_context.parts(active_only=True)`, explicit task links, shared correction traversal, and canonical source-link extraction. Preserve assessment/review support already assembled. This is a bounded repair inside existing owners, not another planner or generic graph query engine.

Planning also lacks the preferences-enriched context envelope. That is source-confirmed, but does not prove a tutor ignores preferences: it may already have them loaded. Test fresh planning with a relevant durable preference. Add only the minimal scope-correct enrichment if the existing workflow cannot reliably supply it; never activate every topic's style preference because a broad plan mentions that topic.

### Pi delivery: distinguish persistence from reading-surface availability

The independent adapter probe loaded the actual extension and published using the actual Python CLI in a temporary vault. Only `/usr/bin/open` was stubbed; no live GUI or authenticated model was launched.

After a simulated exit status 1, the lesson was saved and a warning appeared, but current and subsequent teaching remained hidden in the terminal. A signal-terminated opener (`exit(null, "SIGTERM")`) produced neither fallback nor a warning. The correction tool still returned “Correction saved and displayed.” Current tests disable opening, so their success does not cover these outcomes.

The audit's repair direction is right, but simply assigning the existing publication `lastError` in the opener callback would be incomplete. A later successful publication clears it. A changed transformer flag also does not prove already-hidden TUI messages repaint. An asynchronous error can arrive after more teaching or a session/branch change.

The narrow repair should keep publication success and display fallback separate; expose the already-hidden current teaching; preserve subsequent readability; handle spawn errors, nonzero exit and signal termination once; and scope callbacks to the active session/open attempt. Avoid automatic per-turn reopening, stale content replay, or a second correction append. A later normal session should restore normal behavior. Receipts should claim the lesson was saved, not that the learner saw it.

This needs adapter-level fault tests plus one actual Pi/Obsidian TUI acceptance check after implementation. Successful OS handoff still does not prove reading. No acknowledgment service or delivery framework is warranted.

## What the audit changes, and what it does not

The first implementation proposal now includes planning and delivery, rather than making a leaner context view the next priority after coverage. Diagnostic encoding remains important, but existing fields already support it; improve recording discipline and behavioral checks before forcing additional fields onto every event. Hierarchical navigation remains supported by current task/topic/observation relations.

Retain separate native history and portable state, explicit/inferred preferences, active-policy isolation, source identity, correction history, local revision/lock/atomic-publication safeguards, deterministic branch reconstruction, and the read-only Journal boundary. Do not implement a bespoke sandbox merely because a prompt rule is not a security boundary. Do not add automatic shared-state rollback on conversation branching: genuine learner evidence should persist, with explicit task intent reconciled on resumption.

A surviving lesson after compaction is not evidence that the tutor can resume the correct step. Likewise, source-version metadata does not detect changed file bytes, and assisted performance is not independent retention. These distinctions sharpen validation without requiring new state services.

The updated [research check](learning-external-audit-research-check-2026-09-20.md) verified the materially new benchmarks and two tutoring trials. They support testing downstream action, appropriate use/non-use of memory, and assistance-aware evidence. They do not establish a superior storage format or the learning efficacy of this system. EvoMemBench and LongMemEval-V2 include model/controller differences that prevent treating their results as a clean JSON-versus-vector experiment.

The previous local timings and byte measurements remain measurements of local processing and serialization, not model tokens or user-perceived latency. Keep JSON pending a demonstrated query or operational need. Remove known duplicated policy-topic output only after preference selection and consumer checks; compare actual tokens and complete useful turns. Do not add silent latest-N cutoffs, an incremental lesson cache, or a quiet wrapper for every command merely because they are possible. The exact-handle Pi descriptions are already implemented; do not repeat that historical recommendation as new work.

## Ordered implementation and acceptance

| Slice | Responsibility | Required behavior before proceeding |
| --- | --- | --- |
| **1. Evidence contract** | `assessments`, `records`, `retrieval`, shared record/retrieval instructions | Partial pages, holes, corrections, cross-topic supports and unknown historical coverage cannot earn full-review status; same-patch updates remain atomic; selected claims have bounded support access |
| **2. Planning context** | `planning` using existing task/source/correction helpers | Returned unfinished tasks include their explicitly linked active evidence and source locations; unrelated future history stays out; planning preferences receive a behavioral check |
| **3. Readable Pi delivery** | `pi.ts` and focused adapter tests | Saved teaching remains available on a known open failure, including delayed/signal errors; stale callbacks cannot affect another session; no false display receipt or duplicate publication/correction |
| **4. Natural-language acceptance** | Existing acceptance contract and small synthetic run artifacts | One connected study episode, one judgment/planning episode, and affected recovery boundaries work without asking for internal IDs or memory administration |
| **5. Optional efficiency** | Agent-facing projection and only demonstrated workflow friction | Equal correctness/continuity with fewer real tokens, avoidable tool rounds or delays; no infrastructure justified solely by benchmark popularity |

Each code slice receives focused tests and the appropriate existing gate. Client acceptance is selected by affected behavior, not postponed until every possible backend/provider has been exercised. A client that is unavailable or unauthenticated remains explicitly unverified rather than blocking all correctness repairs or triggering account/configuration changes.

Keep the acceptance set small:

1. **Study continuity:** unfamiliar exercise → assisted attempt → ordinary clarification → temporary then scoped durable preference → detour → fresh-host return → task closure. Preserve exact source/step, honest assistance, unrelated tasks and quiet no-op behavior.
2. **Honest judgment and planning:** favorable partial evidence plus an unread contradiction → “Can I skip this?” → correction of tutor/learner attribution → afternoon planning with a stalled task. Preferences influence explanation, not factual truth or credited mastery.
3. **Affected recovery:** actual compaction/restart, uncertain save, publication failure or open failure only where the change touches that boundary. Prepared teaching must not become claimed delivery or learning.

Use natural prompts, synthetic records, evaluator expectations kept outside the tutor's inputs, source digests, actual host/model versions, public tool traces, final-state assertions and durable sanitized artifacts. Host tool cards and real permissions are distinct from agent-authored bookkeeping. A brief substantive clarification is appropriate when evidence cannot identify the task; asking the learner for scope IDs, revisions or JSON repair is not.

Measure time to useful teaching, complete-turn latency, actual token usage when available, avoidable calls/writes, correctness and learner interruptions. Do not force a fixed call quota on a genuinely difficult judgment. No continuous evaluation platform or per-turn critic is needed.

## Verification performed in this reconciliation

The complete learning gate passed: Ruff lint/format, strict mypy for 17 modules, 10 import contracts, **122 Python tests and 13 Pi tests**. Temporary probes independently reproduced F1, omitted support, F2 through the real CLI, and F3 through the actual adapter with a stubbed opener. These are negative-path confirmations, not fixes or measurements of defect frequency.

No current authenticated teaching session, real TUI display, actual semantic continuation after compaction, cross-client benchmark, or educational outcome was tested in this reconciliation. The earlier bounded native runs remain useful historical evidence, not all-client certification. Proposed improvements remain to be implemented and evaluated.
