# Learning subsystem: core architecture assessment

19 September 2026. Research window: 1 January–19 September 2026. Seven focused investigations cover lab research, encoding, retrieval, host interfaces, pedagogy, persistence, and evaluation. This is an assessment, not an implementation change. Runtime code, installed skills, preferences, and learner records were not changed. Synthetic probes used temporary directories.

## Verdict

The architecture follows several strong contemporary practices: application-owned durable records, distinct evidence and task state, recoverable corrections, scoped preferences, selective context, and validated atomic publication. It is a reasonable foundation for this personal tutor. Its state-of-the-art effectiveness is unproven, and important semantic invariants still depend on the tutor remembering instructions rather than the core enforcing or exposing them.

The highest-value direction is to make current learner assessments traceable and freshness-aware, keep the current teaching task distinct from retrieved background evidence, and protect explicit preferences. These changes improve the existing small design; they do not require replacing JSON, adding a vector database, or scheduling autonomous reflection.

This repository implements external memory and context assembly. It does not train model weights or expose a model's latent internal knowledge representation. We can assess the records, selection logic, instructions and interfaces here, not audit OpenAI/Anthropic/Google models' private internal representations.

## Evidence and scope

The coordinating investigation read the current code and canonical skill, ran all learning Python and Pi adapter tests, and reproduced selected semantic failures in isolated records. Specialists examined the remaining boundaries and researched primary sources. This is broad coverage, not proof that every possible failure has been eliminated.

The live store was inspected only for aggregate structure: one approximately 15 KB scope, six topics, thirteen observations, one unfinished task and four session notes. All thirteen observations carry source references and assistance fields; ten carry dates. No topic has explicit observation-support links. These counts establish scale and traceability gaps, not that a real assessment is incorrect.

**Verification:** 91 Python tests and 11 Pi adapter tests passed. No paid/model-driven cross-provider evaluation, longitudinal student-outcome study, or production fault injection was performed. Local tests prove mechanics; they do not establish truthful evidence extraction or correct teaching decisions.

## Comparison with 2026 primary evidence

These are research results and engineering practices, not one shared certification standard. Undated documentation is separately qualified. A 2026 conference or revision does not turn a 2025 paper into new 2026 research.

| Primary source | Relevant principle | Current alignment and gap |
| --- | --- | --- |
| [OpenAI, Dreaming](https://openai.com/index/chatgpt-memory-dreaming/), 4 June 2026 | Evaluate useful continuity, preference adherence, and temporal correctness. | Continuity and preferences have explicit stores. Current assessments lack mechanically visible evidence freshness; downstream behavior is unmeasured. |
| [OpenAI, in-house data agent](https://openai.com/index/inside-our-in-house-data-agent/), 29 January 2026 | Scoped, editable correction memory, multiple knowledge sources, live validation of stale information. | Sources, preferences and observations are separate. Source versions and assessment derivations remain weakly specified. |
| [Anthropic, context-engineering cookbook](https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools), 20 March 2026; [Managed Agents engineering](https://www.anthropic.com/engineering/managed-agents), 8 April 2026 | Durable memory, active context and compaction have different jobs; original evidence must remain recoverable. | Good separation between records, checkpoints, native conversations and lesson projections. Shared observations still depend on tutor-authored extraction from host histories. |
| [Anthropic, agent evaluations](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), 9 January 2026 | Inspect outcomes and full trajectories, use representative cases and repeated trials where needed. | Deterministic coverage is substantial; actual agent write/retrieve/use behavior is not evaluated. |
| [SKILL.state](https://arxiv.org/html/2608.26263v3), first submitted 26 August 2026, Google LLC/Purdue-affiliated research | Validated explicit execution state helps bounded procedural tasks, with limitations when historical relevance is unknown. | Task checkpoints and validated updates fit this pattern. The paper is not a DeepMind standard and does not justify deleting educational history. |
| [DeepMind researchers, AI Agent Traps](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6372438), March 2026; [Anthropic containment](https://www.anthropic.com/engineering/how-we-contain-claude), 25 May 2026 | External content and summaries can poison durable memory; summarizing content must not increase its authority. | Preference origin exists, but origin is agent-declared and normal source reading shares a powerful writable agent environment. No local exploit was demonstrated. |

The [source audit](learning-agent-memory-2026-sources.md) records dates, affiliations, limitations and exclusions. In particular, ReasoningBank and Evo-Memory began in 2025 and are excluded from new-2026 research claims. Independent 2026 research on [evolving state](https://arxiv.org/html/2608.19652v1) additionally motivates distinguishing retrieval from state maintenance: even retrieved facts can be used incorrectly when supersession and dependent conclusions are stale. This supports investigating the local defect; it does not validate a particular tutoring schema or justify copying an expensive research pipeline.

## Improvements worth making

### 1. Connect current assessments to evidence and corrections

**Highest-value architectural change.** Observations are append-only and corrections are explicitly linked. Topic `summary`, `gap`, `status` and `review` remain mutable interpretations with no required support or evidence watermark. Planning projects summaries without observation evidence. See [memory.py](../../../learning/memory.py), especially normalization and save, and [planning.py](../../../learning/planning.py), topic projection at line 69.

An isolated probe saved “can solve independently,” then appended a correction that the tutor had supplied the solution. Retrieval correctly returned both events, but retained the original assessment without a stale flag. That is a permitted inconsistent state, not proof it occurred in the real store. A review date based on the assessment can likewise survive.

Give the current assessment explicit supporting observations and the evidence position it considered. Expose a pending-reassessment state when relevant evidence changes or support is corrected. Planning should include that status and compact supporting evidence, including assistance and event time when known. The core should identify a stale interpretation; the tutor should decide the new interpretation. Do not infer a numerical mastery probability without a calibrated model.

Allow observations and their revised assessment in one atomic patch. New helper-assigned handles need a deliberate same-patch referencing contract. Avoid fixing this with repeated rereads or compulsory second writes.

### 2. Separate active teaching context from retrieved background

**Reproduced policy-selection ambiguity.** The CLI derives preference topics from every topic returned in an evidence packet. That packet may expand across topics to preserve a correction or prerequisite. Consequently, background evidence can activate another topic's teaching preference; changing the observation page can change the selected policy for the same activity. A prerequisite's preference may sometimes be useful, so the finding is not that every extra rule is wrong. The missing distinction is why that topic is present and whether it belongs to the current teaching activity.

There is also a snapshot inconsistency: scope context is read, then preference selection rereads the scope to derive concept/domain labels. A concurrent edit can combine evidence from revision R with policy applicability based on revision R+1. See [__main__.py](../../../learning/__main__.py), lines 128–159, and [preferences.py](../../../learning/preferences.py), lines 134–146.

Carry two explicit selections: current task/topic/activity identities and evidence identities. Expand evidence freely where correctness requires it; derive applicable preferences from the active teaching context. Use the already-read scope snapshot for labels. A separate preference revision is reasonable; a hidden second version of the same scope is unnecessary.

### 3. Enforce explicit preference authority and identity lifecycle

**Two reproduced deterministic defects.** An inferred update can replace an explicit preference at the same selector and dimension, destroying the explicit value. The skill forbids this, but [preferences.py](../../../learning/preferences.py), lines 185–189, accepts it. Reject that exact authority downgrade. Preserve semantic conflict resolution between different applicable rules as a tutor responsibility. This guard cannot prove whether an agent truthfully labeled an origin.

Deleting a topic can leave a preference referring to it. Later unrelated preference writes fail because the surviving policy is validated against the missing topic. Reproduced independently by the coordinator and persistence investigator. Define retirement/deletion semantics across both stores: reject referenced deletion with a useful repair path, or deliberately support dormant identities. Do not silently discard the user's explicit preference. Coordinate locks for the rare lifecycle operation if claiming the invariant under concurrent local writers.

### 4. Add a small temporal and provenance contract

Observation IDs establish ingestion order, not when an attempt happened. Whole-scope `updated_at` cannot supply per-event time. Introduce helper-owned `recorded_at` for new observations and preserve a separate event date/time when known. Historical event time must remain unknown when not supplied; never backfill it with today's date.

Where the distinction affects teaching, preserve whether a statement came from a direct attempt, learner self-report, tutor inference or external assessment, together with decisive wording and assistance. Validate the types of these canonical fields. Keep diagnostic detail as prose rather than an exhaustive ontology.

Source paths are mutable: rebinding a source handle can make an old attempt appear grounded in a different edition. Distinguish a path move from changed source content, using a version identity or relevant excerpt when necessary. Blanket hashing and permanent full transcript collection are not prerequisites.

### 5. Verify the complete learning loop with a few real host cases

Current tests already exercise useful invariants, so wholesale test expansion is unnecessary. The missing evidence concerns actual agents: what they extract, omit, retrieve and act on. A compact acceptance exercise should cover assisted success, corrected tutor error, changed preference, cross-topic retrieval, resumed unfinished work and an interrupted save. Inspect both the saved records and subsequent teaching. Include a case where no new memory or quiz is warranted.

Start from real failures and use temporary records. Compare corrected code/skill behavior with the current baseline. Repeat cases only when model variability affects the conclusion. Measure unsupported mastery claims, correct continuation, preference adherence, source use and time to useful teaching. Good answers and JSON validity are not direct measures of delayed retention or independent transfer; those require an actual later learner attempt.

Existing project decisions explicitly preferred real study feedback over building a benchmark pipeline. That remains reasonable. The proposed checks can be a bounded acceptance activity, not a new service, dashboard or continual paid evaluation workload.

Educational research reinforces the distinction: [OpenAI's Learning Outcomes Measurement Suite announcement](https://openai.com/index/understanding-ai-and-learning-outcomes/), 4 March 2026, separates model behavior, learner responses and longitudinal outcomes, with validation still underway. The [Google LearnLM/Fab AI technical report](https://storage.googleapis.com/deepmind-media/LearnLM/learnLM_sierraleone_may26.pdf), 15 May 2026, evaluates classroom learning outcomes for an intervention package, not a memory architecture. These sources support measuring learning separately; neither validates this system's review intervals or inferred mastery.

### 6. Preserve trust boundaries through memory extraction

An exercise, retrieved web page or another agent's summary is evidence, not authority to change user preferences. Make this invariant part of the always-loaded contract and retain attribution during extraction. Evaluate it using synthetic untrusted source text in a fake vault.

Pi retains general shell/file tools for calculations, plots and material processing; dedicated memory tools do not technically prevent direct file edits. Stronger tool permissions or sandboxing are conditional on the actual untrusted-input workflow and observed failures. The audit establishes an exposed boundary, not a successful injection or a need for an enterprise security redesign.

## What to retain or defer

Retain the local files, one shared canonical skill, explicit task checkpoints, correction chains, source locators, sparse current preferences, atomic revision-checked publication, and separation between generated lessons and canonical learning evidence. A task-local dependency graph is useful; it is not a validated global model of the student's knowledge.

Defer vector retrieval, a graph database, global concept taxonomy, background “dreaming,” multiple curation agents and probabilistic mastery scores. At the measured scale, none addresses the strongest observed defects. Add a richer retrieval method only after real paraphrase/relationship queries fail and a comparison shows improvement.

Observation-count pagination is not a byte or token budget: correction closure can expand one selected event into many events. This is documented and preserves correctness, so treat bounded progressive expansion as a future scaling concern rather than silently truncating corrections now. Interrupted saves are conflict-safe but rely on reconciliation rather than operation-ID replay; add explicit idempotency only if interrupted recovery proves troublesome. Local locks do not guarantee multi-machine iCloud serialization; the README already states that boundary honestly.

Some older design/research notes describe removed behavior, including a latest-three observation limit. Canonical code, the current skill and README take precedence. Mark superseded design notes clearly if agents use them for maintenance. Quality-gate instructions also need reconciliation with the actual configuration before claiming the learning subsystem participates in every documented static check.

The interface audit additionally reproduced a bounded Pi presentation defect: moving to an empty branch leaves the previous lesson note displayed because projection returns early when there is no teaching (`pi.ts:264`). Correcting empty-branch projection is worthwhile ordinary maintenance, separate from redesigning knowledge representation. See the interface report for the isolated reproduction and appropriate ownership/no-empty-start constraints.

## Suggested order

Fix the bounded preference authority, preference applicability/snapshot and topic lifecycle defects first. Then introduce evidence-backed current assessments with reliable event metadata, preserving atomic patches. Validate those changes through a few cross-session and cross-provider continuations. Consider more elaborate memory machinery only against a remaining demonstrated failure.

## Investigation reports

- [2026 primary lab sources](learning-agent-memory-2026-sources.md)
- [Memory encoding](learning-audit-memory-encoding-2026.md)
- [Retrieval and context](learning-audit-retrieval-2026.md)
- [Agent and host interfaces](learning-audit-interfaces-2026.md)
- [Pedagogy and learner modeling](learning-audit-pedagogy-2026.md)
- [Persistence and lifecycle](learning-audit-persistence-2026.md)
- [Evaluation and assurance](learning-audit-evaluation-2026.md)
