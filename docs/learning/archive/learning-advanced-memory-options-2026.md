# Advanced learning-memory options: 2026 evidence and implementation decisions

Checked 2026-09-19. Evidence window: 2026-01-01 through 2026-09-19. This extends [the lab-source audit](learning-agent-memory-2026-sources.md). Recommendations consider possible capability gains, not merely the current store size. Recommendations and release criteria below are engineering proposals, not published lab standards. No dependencies were installed.

## Recommended direction

All four options can add value. Their useful capabilities are distinct: semantic retrieval finds differently worded evidence; a curriculum graph exposes dependencies; curation maintains interpretations across time; knowledge tracing estimates future performance. A vector database, a universal entity graph, an always-running process, and a percentage labelled “mastery” are particular implementations, not substitutes for those capabilities.

**Production recommendation now:** strengthen evidence, corrections, current-state validity and evaluation. Do not add an embedding dependency, global graph store, curation daemon or mastery estimator solely because 2026 papers report benefits elsewhere. This is an evidence requirement, not a small-store exemption. The same requirement applies to a large course-material corpus; the potential retrieval benefit there may be substantial and deserves a separate benchmark.

| Option | Implement now | Production decision |
| --- | --- | --- |
| Semantic/hybrid retrieval | Held-out retrieval cases and error analysis; then an offline dense/hybrid comparison if semantic misses or discovery needs are demonstrated. No production dependency yet. | Enable where it improves source-grounded answers within the same context budget. Use a vector database when filtering, update consistency, latency, or operational requirements justify that backend. |
| Curriculum/knowledge graph | Reuse existing topic prerequisites, concepts/domains and task dependencies. Verify their traversal and evidence semantics; no second graph store or speculative ontology. | Add a missing relation/query only for a demonstrated planning need; expand across subjects when actual cross-subject planning benefits. |
| Automated curation | Revision-safe interpretation updates, correction application and deterministic index maintenance. If repeated semantic maintenance needs appear, add an evidence-linked proposal/apply workflow. | Allow automatic application by mutation class after evaluation. Keep inferred claims distinct from explicit preferences and observed performance. |
| Numeric learner model | Rich attempt records and comparable-outcome statistics; define the prediction target and collect evaluation labels. | Run a model experiment once its target can be evaluated. Expose probability only after chronological held-out calibration; never relabel a heuristic score as measured mastery. |

The supplied local audit reports that topic prerequisites, concepts/domains and task dependencies already exist. Their presence reduces the architectural gap; it does not prove planning quality. No new curriculum relation query has yet been demonstrated by this research task. A candidate such as “show the unresolved foundations and source-backed dependency path for the selected task” should first be checked against existing functionality. Add no duplicate representation if it is already answerable.

Shipping an unmeasured capability as the default would skip the decision the experiment is meant to resolve. Existing stdlib-only policy also means an embedding runtime must earn its dependency through this comparison; corpus size alone neither vetoes nor authorizes it.

## What the 2026 research supports

**Retrieval has complementary strengths.** [AgentIR](https://arxiv.org/html/2605.25092v1), first published **2026-05-24**, by USC researchers, evaluates lexical, dense, fusion, and query-dependent routing. It reports different winners across memory workloads. Its comparisons include judge dependence, static indexes for several benchmarks, and derived rather than fully remeasured cascade latency. Use it to motivate an ablation, not adopt its timing claims as a local guarantee.

**An agent-controllable search interface remains a serious baseline.** [ReFind](https://arxiv.org/html/2608.12888v1), first submitted **2026-08-13**, by USTC/MetaStone authors, combines lexical search with session context, temporal constraints, neighboring turns, and repeated searches. It reports strong precise-recall and fact-update performance without precomputing a semantic graph. This is evidence to compare retrieval workflows as well as indexes; it does not establish that embeddings lack value for semantic discovery.

**Graphs can improve relational retrieval while retaining source passages.** [MemWeaver](https://arxiv.org/html/2601.18204v1), **2026-01-26**, from HIT, UNSW, Macquarie and CSIRO-affiliated authors, combines temporal graph facts, distilled experience, and original passage retrieval. It reports LoCoMo gains and acknowledges model-dependent abstraction quality. This supports preserving evidence beside graph representations; conversational QA results do not establish educational benefit or justify global automated inference.

**Test the relation actually needed.** [HybridRAG-Bench](https://arxiv.org/html/2602.10210v1), **2026-02-10**, with MIT, IBM Research and UCF affiliations, constructs evidence-grounded multi-hop tasks over aligned text and graph records. It helps separate retrieval/reasoning performance from a model's preexisting knowledge. For this subsystem, a prerequisite path must be assessed against source-backed relations rather than a model's plausible explanation. This is a benchmark paper, not evidence that every retrieval query needs graph traversal.

**Prerequisite structure is useful but must be executed correctly.** [Circuit Complexity of Hierarchical Knowledge Tracing and Implications for Log-Precision Transformers](https://arxiv.org/html/2603.23823v1), **2026-03-25**, Rice/UCF, studies formal prerequisite trees and trained encoders. Providing structure alone did not prevent shortcut solutions in its experiments. Its theoretical caveats are explicit. The practical inference is to compute graph reachability and path explanations deterministically and evaluate their use; this paper is not a trial of curriculum sequencing with real students.

**Current LLM judgments are not calibrated learner models by default.** [FoundationalASSIST](https://arxiv.org/html/2602.00070v1), **2026-01-20**, WPI, ASSISTments Foundation and UCF, preserves question text, actual answers, hints, answer exposure, skill mappings and timestamps. Tested open-weight models barely exceeded simple correctness baselines and showed optimistic prediction bias. The scope is zero-shot evaluation on K–12 mathematics and selected models, not a verdict on every current model. It nevertheless motivates storing diagnostic evidence and testing prediction instead of trusting an inferred percentage.

**Aggregate calibration can conceal bad progression decisions.** [Subgroup Calibration and Mastery Decision Errors in Knowledge Tracing](https://ieeexplore.ieee.org/document/11596401/), IEEE SIST **2026-05-13–15**, added to Xplore **2026-07-14**, evaluates six knowledge-tracing models on EdNet. The publisher abstract reports low aggregate calibration error alongside systematic performance-group bias; a 0.85 decision threshold produced incorrect promotion decisions for low-performing students. The inspected abstract supports decision-level evaluation; it does not validate any threshold for this learner or subject.

**Automated curation is a viable major-provider pattern.** OpenAI's [Dreaming](https://openai.com/index/chatgpt-memory-dreaming/), **2026-06-04**, describes background synthesis and temporal maintenance with user-reviewable memory. Google Cloud's [Always On Memory Agent](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/agents/always-on-memory-agent/README.md) provides ingestion, consolidation and query agents over SQLite; its [introducing commit](https://github.com/GoogleCloudPlatform/generative-ai/commit/cfd52c4041b66ac8a2c151bff202fbb30f9b0c5b) is **2026-03-03**. The latter is explicitly a demo, not benchmark evidence that LLM-only retrieval replaces vectors. Both make curation a credible option to evaluate; neither establishes that unrestricted autonomous rewriting is reliable or that a new curator is needed locally.

These new academic papers are primary research, but they are not OpenAI/Anthropic/DeepMind standards. The major-lab evidence remains separately identified in the earlier audit. Earlier papers republished or revised in 2026 remain excluded.

## Concrete architecture and acceptance criteria

### Retrieval

If the benchmark justifies semantic retrieval, use the canonical records as the source of truth and lexical/embedding indexes as replaceable projections, keyed by record ID, content digest, embedding model/version and revision. Filter eligible records by scope, authority and validity before final context selection. Fuse ranked candidates, deduplicate by evidence identity, and fetch the current canonical record before returning it. Similarity must not overrule an explicit correction or active-scope rule.

Keep learner-memory retrieval and course-source retrieval separate in evaluation: one asks what is known about this learner and what evidence is current; the other asks which material explains a concept. A dense channel that improves course-document discovery does not establish permission to broaden preference scope or mix unrelated learner records.

First record failures and representative discovery tasks. For an offline candidate comparison, compare lexical-only, dense-only, hybrid, and iterative lexical retrieval with identical source records and context budgets. Include Italian/English paraphrases, concept aliases, code/formula tokens, missing-answer cases, expired interpretations, and misleadingly similar topics. Score evidence recall, wrong-evidence inclusion, grounded answer quality, latency and tokens. Keep a held-out subset separate from tuning. Account for embedding inference, model downloads, credentials, reindexing and local operation as well as query latency.

Proposed promotion rule: improve held-out grounded outcomes with a paired uncertainty estimate, preserve all deterministic authority/scope cases, and show no material degradation on exact technical queries or abstention. If evidence is inconclusive, retain the experiment and collect more cases. Do not select a backend from document count alone. Benchmark a dedicated vector store when exact vector search cannot meet the chosen p95 latency/update consistency requirements, or shared service operations demand it. No cited 2026 study fixes a universal database threshold.

### Curriculum graph

Keep curriculum relationships separate from learner observations. A node identifies a concept; an edge records a typed relationship and its evidence. A learner assessment references the concept and its supporting attempts. “A is prerequisite for B” must not mean “the learner knows A,” and success at B must not silently mark every ancestor mastered.

Use the existing relation vocabulary before adding fields or relationship types. For any relation that becomes a planning authority, preserve direction, source, verification status and revision. Enforce acyclicity only for prerequisite relationships within a curriculum that claims to be acyclic; do not impose it on general relatedness. Represent alternate routes only when an actual curriculum needs them. Distinguish suggested foundations from mandatory prerequisites.

Release graph-assisted planning when the intended dependency paths are correct on reviewed examples, each recommendation cites its path, and stale or rejected edges cannot influence planning. Expand to a global graph when specific cross-domain queries benefit in a same-budget comparison. Graph size alone neither establishes nor removes its value.

### Curation

If curation needs are demonstrated, trigger work after a completed learning event, correction, changed source or accumulated new evidence. A curator can propose merges, supersessions, topic links and revised interpretations. Each proposal includes source IDs/revisions, reason, scope and resulting status. Keep original evidence and a record of accepted changes. Reject missing sources, obsolete input revisions, invalid relationships and attempts to promote inferred content into explicit user instruction.

Automate lossless maintenance immediately: rebuilt indexes, stale-reference detection and duplicate detection with exact identity. For semantic merges and revised learner judgments, implement proposals and a deterministic apply boundary. The teaching agent can validate proposals while handling an authorized session; an always-running daemon is optional scheduling, not the core intelligence.

Promote a mutation class to unattended operation only after replaying corrections, conflicting evidence, repeated events and stale-source cases with no authority escalation or evidence loss, plus human review of the semantic judgments. A class can remain proposal-only while other classes are automated. Compare curation against no-curation on downstream behavior and correction fidelity.

### Numeric learner state

Define the target before choosing a model: for example, probability of solving a new unaided problem from a specified concept/task family after a given delay. Record item identity/version, concept tags, response, rubric/result, assistance or answer exposure, timestamp and transfer context. A correct repeated answer with hints and a correct new unaided derivation are different evidence.

Expose factual statistics now: observed outcomes, assistance levels, distinct items and recency. If a numerical estimate is developed, keep its target, model version, assumptions and uncertainty alongside it. Compare a simple baseline, a knowledge-tracing model and any LLM estimate using chronological splits. Evaluate Brier/log loss, calibration, failure detection and the actual decision policy; stratify by concept, task type, assistance and delay where data supports it.

Release numeric predictions when they improve the defined future-outcome task over a simple baseline and calibration uncertainty is acceptable near the decision boundary. Use a decision's false-promotion cost to choose its threshold. There is no defensible universal “three successes means 90% mastery” rule in these sources. Until calibrated, keep the learner assessment qualitative and evidence-linked, or display the number explicitly as an experimental prediction rather than mastery.
