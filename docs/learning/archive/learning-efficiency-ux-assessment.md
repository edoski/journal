# Fluid study and retrieval efficiency

Design assessment, 18 September 2026. Reviewed the [integrated design](learning-context-retrieval-design.md), [query workflow](learning-retrieval-query-design.md), [current preferences](learning-current-preferences-design.md), [scope acceptance](learning-preference-scope-evaluation.md), [lesson experience](learning-lesson-experience-design.md) and [shared skill](learning-teaching-skill-design.md). No model runs, implementation or vault access. Call profiles below are design targets, not measured latency, model guarantees or hard limits.

## Verdict

Retain the shared skill, recoverable evidence, precise source identity, sparse contextual preferences, one authored response and assistant-focused lesson. Change how the workflow is expressed: resolve what is missing, teach, and save meaningful changes. The numbered retrieval process must not become a mandatory sequence of discovery, indexing, history reads, policy resolution and calibration on every turn.

A normal follow-up should feel like another step of the same conversation. The tutor already knows the exercise, applicable guidance, prior assistance and current reasoning. It should use them. Additional retrieval earns its delay when it resolves a material uncertainty, restores missing context or supports a genuinely new problem; minimal tool use is not a reason to guess.

| Retain | Change before implementation | Defer |
| --- | --- | --- |
| Exact task/source lookup, complete relevant evidence, visible pagination and correction links | Make catalog/index/source discovery conditional; permit direct focused reads when IDs are already known | FTS, embeddings, rerankers, prerequisite crawls and background indexing until observed failures |
| Sparse typed preference selectors and current values | Return global and applicable policy with normal discovery/context; reuse resolved guidance while the task stays stable | Shared term registry, full taxonomy, preference classifier, per-turn policy reflection |
| Revision checks, locks, atomic state writes | Save one coherent scope patch for the meaningful evidence/active changes; separate policy write only when policy changes | Answer journals, delivery outboxes, cross-file transactions and periodic maintenance models |
| Continuous teaching and deterministic lesson projection | Load the shared skill once when needed; never load these design reports during routine teaching | Mandatory lesson templates, rewritten summaries, routine graphics export and automatic review rituals |

## Typical paths

Count agent-facing operations rather than hiding several reads inside one shell invocation. Independent file reads can be batched for latency, but still count as reads and consume context. Pi's event projection is deterministic host work, not another model tool call; its publication latency still matters. If the canonical skill is not already loaded, add its one initial read to the profiles below.

| Situation | Practical operation target | Why more work may be justified |
| --- | --- | --- |
| Ordinary clarification within the same step | Zero retrieval; zero or one scope save | Save when new assistance, evidence or the next resumable step meaningfully changes. A source claim not already supported requires a read. |
| Learner attempts the pending exercise | Zero retrieval; one scope patch combining the new observation, interpretation and active work | Read again for an actual contradiction, a new concept, a save conflict or missing task context. Do not reappend prior evidence. |
| Fresh session, known course/task | One focused context read containing evidence, active work and applicable preferences; zero to two necessary source reads; usually zero or one save | The source statement may already be provided verbatim. Missing figures, code dependencies or large histories legitimately add reads. No mandatory catalog or index prelude. |
| Fresh session, ambiguous course/exercise | One discovery operation, one focused context read, roughly one to three scoped source operations; zero or one save | Distinct editions or worksheets may require a natural clarification. This is identification work, not normal steady-state overhead. |
| Topic/activity switch within a course | Zero or one targeted context/policy refresh plus zero to two new source reads; zero or one save | Already loaded topic evidence and policy may suffice. Re-evaluate actual activity on a proof-to-programming switch; do not re-open the full course. |
| Context lost through compaction or provider handoff | One focused recovery read and the source excerpts actually missing; usually zero or one save | Exact source statements, assistance or governing instructions may need restoration. Compaction alone does not require repeating intact context or recreating assessment. |
| Deep problem, disputed assessment or broad planning | No defensible small fixed count; follow necessary dependencies and history pages | Completeness follows the claim. A whole-course progress conclusion needs broader evidence than the next algebraic step; useful extensive retrieval is allowed. |
| Durable style correction during study | Usually one policy save; add one scope save only if its active override/evidence changes | An explicit “everywhere” correction may need a dimension-focused policy read to remove conflicting scoped values. A one-answer request needs no durable policy operation. |

These ranges expose the intended cost shape: cheap warm turns and more expensive context establishment. They must not become quotas, failure thresholds, arbitrary observation limits or a reason to omit relevant evidence. A single giant response that needs rereading after transport truncation can be slower and less reliable than several well-chosen pages.

## Changes that protect the ordinary path

**Treat retrieval as filling gaps.** When course, topic and task identities are established, call focused context directly. Catalogs and indexes are navigation options, not compulsory stages. Include active work, relevant source locators, evidence/corrections and applicable preferences together when the helper already owns those records. This is a read convenience, not a new transactional or orchestration subsystem.

**Do not split preference loading into ritual calls.** “Read global policy before course resolution” need not mean a separate operation: include globals in discovery, or globals plus matched selectors in focused context. If the activity is established only after reading a source, one targeted policy expansion can be appropriate. Existing context may already contain all required rules. Do not transmit all unrelated preferences merely to avoid a possible later call.

**Reuse facts and guidance.** Keep the selected task, loaded evidence, source excerpts and current effective guidance in native conversation context. No additional cache file, session manager or freshness-polling loop is needed. Refresh when a task/source actually changes, the user signals an external edit, a revision conflict occurs, loaded material is missing, or an intended claim needs further evidence. Before reusing a saved locator in a new session, verify its current target. Checking every source hash or preference revision before every sentence is unjustified.

**Do not turn selectors into extra reasoning work.** Interpret a small applicable policy once for the current task and continue. Most instructions combine naturally. Reconcile a meaningful new overlap or correction; do not reconsider every possible domain/course/topic/activity conflict at every answer. Stable defaults and sparse exceptions should reduce deliberation, not create a hidden policy interview.

**Retrieve enough for the next teaching decision.** Load complete selected histories when manageable; use exact relevant handles, explicit searches and pages when the record is genuinely large. Do not demand exhaustive historical reconciliation before explaining a local step whose premise is already grounded. Conversely, a claim that the learner has never solved something independently requires checking beyond a convenient recent page. Full retrieval and selective retrieval serve different claims.

**Calibrate without restarting.** A new substantive learning goal may need a short probe; the learner's existing attempt may already supply it. Stop once there is a useful foundation and gap, or sufficient task competence. Follow-up clarification and direct-explanation requests should not trigger a fresh assessment ladder. No mandatory quiz after each explanation.

## Persistence and presentation

Use meaningful transitions as checkpoints: a new learner attempt, a changed assistance/understanding assessment, a substantive new unfinished step, a durable preference correction, or an imminent handoff. Combine related scope changes in one patch; do not separately save topic evidence, summary, focus, active work and review state. Write reviews only when their rationale or schedule changes, not merely because the topic was mentioned.

A resumed question and material help must not disappear because the tutor deferred all persistence until the end of an unpredictable session. Save those meaningful changes promptly, normally in the current turn. Routine rephrasing with no new state need not produce a write. A known shutdown/compaction opportunity is a useful checkpoint, not a lifecycle guarantee; ordinary meaningful saves supply continuity when that hook is unavailable.

Prepare one response and its necessary state update, complete the local write, then deliver the teaching once. Do not output the explanation before a save and repeat it afterward. A planned question remains distinct from demonstrated learner exposure. If an operational error does not prevent a grounded answer, continue with a concise, accurate limitation when continuity is affected rather than silently claiming persistence succeeded. No save-success narration on the ordinary path.

Pi should project completed teaching events directly, retaining native identity, queued writes and branch reconstruction. The current adapter rebuilds the branch and spawns Python on user/assistant message completion and agent settlement, even when the resulting lesson is unchanged. With assistant-only projection, remove ordinary user-event publication and skip known unchanged duplicate lifecycle work; include explicit public quiz events only when needed. Preserve complete reconstruction for session/branch changes. These are concrete local redundancies, not model tool rounds. Measure their cost separately before considering incremental caching or another storage layer; a new answer store is unnecessary.

## Minimal later measurement

Use three small synthetic sequences after implementation: a fresh known exercise followed by ordinary clarifications/attempts; a proof-to-programming switch with one durable preference correction; and a fresh-host continuation whose decisive evidence is old and whose required source has changed. Include one interruption/retry at an actual persistence or Pi projection boundary. These cases reuse the existing acceptance set rather than create a benchmark suite.

Record time to useful teaching, agent operations and their purpose, duplicate source/context reads, context bytes, meaningful state writes and visible duplicate/bookkeeping text. Also record failures: wrong exercise, missed old evidence, stale source, false independence or lost pending work. Host model reasoning time and tool time should remain distinguishable where instrumentation permits; do not infer token savings from fewer calls alone.

A successful assessment shows that warm turns avoid repeated setup while difficult turns obtain necessary evidence. One native run supplies an observed example, not a latency guarantee or learning-outcome result. Investigate concrete misses or delay before adding machinery. The design has no demonstrated universal optimality, and its flexibility should remain visible in the acceptance criteria.
