# Learning memory: architectural assessment

Checked 20 September 2026 against the current working tree, live-store aggregate counts, temporary synthetic records, and primary research. Application code and live learner records were not changed. This assessment complements the [research refresh](learning-memory-research-refresh-2026-09-20.md); recommendations below are engineering judgments, not a research standard or evidence of improved learning outcomes.

Subsequent reconciliation with the independent GPT-6 Pro audit produced the [integrated assessment and plan](learning-memory-integrated-plan-2026-09-20.md). That document is the current implementation recommendation: it adds verified planning-context and Pi-delivery defects, narrows the coverage mechanism, and moves optional payload work behind correctness and delivery.

## Judgment

The core decomposition is appropriate: durable observations, evidence-backed interpretations, current preferences, unfinished tasks, source references, and disposable retrieved context have distinct owners. The important remaining work concerns evidence coverage, recoverability, and context selection. A new memory service, universal graph, or background reflection agent is not presently justified.

Live inspection found one scope, six topics, thirteen observations, and one task. Its default retrieval returned ten observations in 12,871 UTF-8 JSON bytes before CLI paths/preferences; the complete normalized record was 16,517 bytes. These are byte measurements, not tokenizer measurements. A small learner store does not establish that the separate course-material corpus is small.

## Findings and priorities

### 1. Assessment freshness overclaims reviewed evidence — fix first

`learning/assessments.py:79-114` stamps every replacement assessment/review with the largest observation ID in the entire stored record. Freshness checks then consider only relevant observations or corrections newer than that watermark. The save revision establishes snapshot consistency; it cannot establish which evidence an agent retrieved or considered.

Reproduced in a temporary store:

1. Save two observations for one topic: an independent success and a later failed transfer attempt.
2. Retrieve that topic with `limit=1`: only `o1` is returned, with `complete=false`, `total=2`.
3. Save an assessment citing only `o1` at the returned revision.
4. The stored assessment receives `reviewed_through=2` and reads as `pending=false`, although `o2` was never supplied by that retrieval.

Distinguish stored evidence, evidence available in retrieved context, evidence the agent acknowledges reviewing, and evidence supporting the resulting claim. Support is not coverage: a reviewed contradictory attempt may correctly not support the final conclusion. Substituting the maximum support ID would not solve this.

The lean change is a review-coverage contract at the existing retrieval/save boundary. Clearing pending must require declared coverage of the relevant evidence snapshot, including corrections; incomplete selections must not silently establish complete review. The integrated plan now recommends an exact considered-observation declaration, separate from supporting IDs, without a read ledger or receipt service. This validates declared coverage, not whether the model understood the evidence.

### 2. Returned interpretations can lack their supporting evidence — tighten retrieval

`learning/retrieval.py:147-217` selects observations by topic/query/handle, then expands correction links. It returns selected topic assessments/reviews without independently adding their support handles. Pagination can omit support; valid cross-topic support can also be outside the entire selected topic history.

A second temporary probe saved a topic assessment citing an observation tagged with another topic. Retrieving only the assessed topic returned the assessment, no observations, and `complete=true`. This is legal under the current schema. Here `complete` correctly describes the selected history, but says nothing about whether the returned interpretation is supported by the delivered packet.

For a decision using an assessment, either supply its supporting evidence and correction closure or explicitly identify unloaded support and provide exact handles for expansion. Preserve topic preference isolation while expanding evidence. Do not recursively pull every assessment from every newly encountered topic; keep expansion bounded to the decision's selected claims.

### 3. Encoding must preserve diagnostic meaning — improve use of existing fields

Observations already permit response, assistance, task, provenance, event date, uncertainty, source locator, and excerpt (`learning/records.py`). These are useful distinctions. However, the required natural-language observation is still agent-authored, and response/provenance/source details are optional. A later tutor cannot recover omitted diagnostic detail merely by improving retrieval.

For consequential learner judgments, retain the smallest sufficient episode: the problem or exact source locator, decisive learner response, help already given, observed outcome, and unresolved uncertainty. Use existing fields first. Preserve a short exact excerpt or durable episode locator when wording is material; copying every conversation would create a different and unnecessary archive.

Example: “Understands singular systems” loses the distinction between independently classifying a new inconsistent system and recognizing a repeated equation after a hint. Store the discriminating evidence, then let the assessment compress it with support links. Do not let a compressed assessment become evidence for its own correctness. Successful teaching, learner agreement, and later unaided transfer remain different events.

### 4. Optimize disposable views before changing storage format

Retrieval already offers direct task resumption, exact handles, literal queries, an index, revision-bound pages, and correction expansion. Default topic histories are unbounded, however; `limit` bounds seed observation count rather than bytes or total expanded size. Full task plans and all task-index entries are returned, and active topic objects appear both under `topics` and `policy_topics`.

In the live sample, `policy_topics` duplicated 762 bytes of topic objects, approximately 6% of the 12,871-byte retrieval output. This is a modest measured opportunity, not a claim of a 6% reduction in total model tokens or cost.

Keep canonical JSON with meaningful field names. At the output boundary, distinguish resuming a task, inspecting evidence, and making a progress/review decision. Share the same selector and evidence rules; do not create a second state owner. A routine resumption can foreground purpose, current step, applicable preferences, unresolved uncertainty, and the evidence needed now. Larger histories remain retrievable by stable handles.

Any budget must preserve complete correction/support groups or explicitly indicate that they remain unloaded. Avoid silent top-k truncation and opaque abbreviations. Measure actual model input/output tokens, tool rounds, latency, and decision quality before claiming a format improvement. Literal search is a known limitation for paraphrases and Italian/English terms; test missed retrievals before choosing lexical, embedding, or hybrid expansion. Evaluate course-material discovery separately from learner-memory retrieval.

### 5. Hierarchical reasoning has a foundation; automatic validity propagation is narrower

`learning/task_context.py` validates an acyclic task plan, retains its stable purpose, and retrieves current-node/direct-prerequisite context. Topics also support parent/prerequisite metadata. This already supports goal → step → prerequisite → evidence navigation without a second graph system.

The hierarchy should provide decisions and retrieval routes, not a stored transcript of hidden reasoning. A curriculum prerequisite does not imply learner mastery. Expand deeper only when the next decision needs it; do not preload every ancestor.

Automatic freshness currently covers topic assessments/reviews. Task assumptions and plan choices rely on the tutor following the correction instructions in the skill. Topic parent/prerequisite links are reference-checked but are not traversed as an authoritative curriculum DAG. If future scheduling depends on them, define and validate those semantics then. A small on-demand list of affected checkpoints would be preferable to a global invalidation engine if correction failures are observed.

### 6. Evaluate whether memory changes the next action correctly

The repository already has bounded native acceptance scenarios and a previous run report. Those are useful; this audit did not rerun native providers or measure learning gains. Existing deterministic checks do not establish that an agent encoded the right detail, fetched sufficient evidence, or used it correctly.

[MemoryArena](https://arxiv.org/abs/2602.16313) evaluates interdependent multi-session actions and reports that strong conversational recall performance does not ensure effective memory-guided action. [RECON](https://arxiv.org/abs/2607.16716) explicitly tests downstream invalidation, source conflicts, and evidence chains; its long synthetic case files differ substantially from this learning system. They motivate local cases, not copying their architectures.

Extend the existing small evaluation set around the boundary being changed: partial retrieval followed by assessment, omitted cross-topic support, correction of a checkpoint assumption, ambiguous/paraphrased topic discovery, fresh-host continuation, and later independent transfer. Separate encoding failures, retrieval failures, interpretation failures, and bad teaching decisions. Compare a candidate with the current system on matched fixtures and actual context cost. No benchmark service or routine paid sweep is needed.

## Other boundaries worth retaining

Source versions are labels captured by the store, not automatic verification of file bytes. When mutable source content matters, re-read it; add an on-demand content fingerprint only if silent source changes become a demonstrated problem. Avoid a filesystem watcher without need.

`pending=false` means no detected unreviewed relevant event under the current contract. It does not mean an old demonstrated skill has been retained. Keep event dates, review tasks, and delayed unaided performance visible without inventing a mastery-decay formula.

Correction preserves historical evidence; it is distinct from a user-requested deletion. If selective forgetting becomes a requirement, remove or invalidate dependent interpretations and derived indexes as part of the operation. Do not add automatic forgetting that silently discards valid learning evidence.

Local revisions, locks, and atomic replacement already protect local writes. They do not coordinate independent remote iCloud writers; a distributed protocol is warranted only if that usage becomes required. Host transcript compaction remains a separate mechanism from shared memory, so fresh-host continuation is the relevant durability check.

## State representation, alternatives, and natural-language study

The follow-up requirement is decisive: the learner studies naturally; agents select, save, correct, and maintain memory internally. Architecture should be judged by the resulting continuity, correctness, and delay to useful teaching. A silent but slow bookkeeping workflow still fails this requirement.

Five choices should be assessed independently:

| Choice | Current approach | What an alternative can change |
| --- | --- | --- |
| Meaning of state | Observations, interpretations, tasks, preferences, source references | Whether important distinctions survive encoding and later interpretation |
| Durable storage | Revisioned JSON files with local locking and atomic replacement | Transactions, concurrent access, indexed reads, operational complexity |
| Retrieval | Scope/task/topic selection, literal matching, correction expansion | Finding sufficient evidence, including paraphrases or relations |
| Agent-facing representation | Compact JSON selected by the Python helper | Input tokens, ambiguity, unnecessary details and subsequent reads |
| Agent workflow | Shared skill plus context/save tools or CLI adapters | Tool rounds, repeated reads, repair calls, visible interruptions |

Switching the storage backend while returning the same tool-result text gives the agent the same tokenized input for the same tokenizer. Switching to a vector database does not itself reduce tool rounds: one existing context call can perform multiple internal searches, while a poorly designed vector interface can require several agent calls. Conversely, JSON records can coexist with a derived vector or lexical index. These are not mutually exclusive architectural categories.

| Alternative | Benefit to establish | Local recommendation |
| --- | --- | --- |
| JSON files plus better projections | Less duplicate/irrelevant context, preserved evidence semantics | First candidate; retains existing inspectability and maintenance model |
| SQLite with relational indexes and FTS5 | Faster indexed selection, richer lexical search, transactional queries as records grow | Reasonable next storage/search candidate if profiling or query requirements justify it; not an automatic token reduction |
| Dense or hybrid retrieval over canonical records | Better discovery under paraphrase, bilingual wording, implicit connections, or large source corpora | Run a bounded comparison when such misses occur; keep eligibility, source identity, corrections and preferences deterministic |
| Graph-backed retrieval | Correct multi-step prerequisite or evidence paths that existing links cannot serve | Use existing relations first; a graph database is optional infrastructure, distinct from having a graph-shaped domain model |
| Markdown or a concise custom wire format | Lower real token/repair cost with equally clear meaning | Can be a derived reading view; no demonstrated reason to replace canonical structured state or validated patches |
| Hierarchical summaries | Better selection across long histories while retaining routes to original evidence | The existing task/topic/observation levels are a starting point; do not add recursive summary maintenance without benefit |
| Learned latent memory or fine-tuning | Better task performance after training with explicit maintenance/deletion semantics | A model-training research direction, poorly matched to portable, inspectable memory shared among independent host models |

No backend is proven universally optimal. A defensible local comparison holds evidence, model, tasks, context budget, and required correctness fixed, then measures useful teaching, unsupported judgments, tool rounds, tokens, and latency. A benchmark victory in conversational recall is not proof of smoother studying or better learner retention. The [research refresh](learning-memory-research-refresh-2026-09-20.md) documents the primary evidence and limits.

### Measured current costs

On the live small scope, 30 repeated local reads measured a median of 0.361 ms for loading, validation, and freshness; 30 context selections measured 0.363 ms. Twelve separate Python CLI context processes measured a median of 50.826 ms, maximum 83.500 ms, returning 13,832 UTF-8 bytes including paths and applicable preferences. These are warm-filesystem micro-measurements on this machine. They exclude model inference, tool transport, source extraction, and Obsidian display; they do not establish end-to-end user latency. No model-token count was measured.

The measurements provide no evidence of a current JSON/disk bottleneck. The known improvements concern what is returned and how often an agent asks for it. Removing the duplicated policy-topic payload after preference selection is a candidate lossless wire cleanup; active topic handles already occur in selection metadata. Preserve the internal snapshot used to choose preferences.

### User experience contract

The current shared skill and Pi adapter already express most of the intended interaction:

- An ordinary grounded follow-up reuses loaded material; often no memory tool call is needed.
- A meaningful learner attempt usually requires one combined state patch, including evidence, checkpoint, and any justified assessment changes.
- A fresh known task usually needs one context call, with separate source reads only when the material is missing.
- Discovery, pagination, support expansion, and conflict repair remain internal. The learner is asked only about genuinely ambiguous intent, not memory handles, backends, or where records belong.
- Confirmed saves need no verification reread. Routine successful memory operations stay hidden; operational failures are surfaced when they affect continuity.

These are target behaviors rather than a claim that every host reliably achieves them. CLI source review confirms the primitives, and previous acceptance covered a bounded episode; uninterrupted real study remains the appropriate usability check. A literal-query fallback must not force the learner to formulate database queries. If autonomous topic resolution repeatedly fails, improve that internal resolver and its candidate context rather than adding management commands to the learner's workflow.

Do not introduce a separate planner/encoder/retriever/critic model call on every turn. Internal Python can compose deterministic work behind one tool invocation. Additional model work should earn its latency through a better teaching decision. Preserve source truth and revision safety when making that workflow smaller.

## Verification and proposed scope

Forty-two focused tests passed across `test_assessments.py`, `test_retrieval.py`, and `test_records.py`. Two additional temporary-store probes established the coverage and support-delivery behavior above. No probe touched the learner's actual records. No application code, tests, dependencies, or configuration changed.

The revised implementation order is evidence coverage/support, unfinished-task planning context, readable Pi delivery on known open failure, then bounded native acceptance. Compare reduced context projections afterward. Improve diagnostic recording through the existing observation contract. Keep larger search systems, recursive summary trees, numerical mastery models, and background curation as experiments triggered by measured failures. The [integrated plan](learning-memory-integrated-plan-2026-09-20.md) supplies the new evidence and acceptance criteria.
