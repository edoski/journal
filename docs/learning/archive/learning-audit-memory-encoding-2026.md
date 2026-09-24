# Learning memory encoding audit — 19 September 2026

Read-only analysis of the implementation and contracts. Only this report was written. Temporary-directory probes exercised hypothetical records; they do not establish that the real learner record contains misinformation.

## Verdict

The core has a good small-system foundation: durable event evidence, mutable topic interpretations, separate task checkpoints and preferences, explicit correction links, and atomic revision-checked writes. Its main weakness is the boundary between **what happened** and **what the tutor currently infers**. The implementation preserves events well, but does not make a current interpretation traceable, freshness-aware, or invalidated by corrections. Better retrieval alone cannot repair an unsupported or stale interpretation.

No reviewed 2026 source supplies a universal lab-standard memory schema or evidence that this tutor must use embeddings, a graph database, probabilistic mastery, or autonomous background reflection. The useful convergence is narrower: retain evidence, distinguish inference, maintain current interpretations, and test temporal and contradictory cases.

## What already works

`save` only appends observations and assigns stable handles; existing observations survive topic/task changes ([memory.py:551](/Users/edo/dev/python/journal/learning/memory.py:551)). References are checked against existing records; corrections must target earlier observations ([memory.py:80](/Users/edo/dev/python/journal/learning/memory.py:80), [memory.py:176](/Users/edo/dev/python/journal/learning/memory.py:176)). Retrieval expands the correction component around selected observations, including corrections outside the initial page ([memory.py:295](/Users/edo/dev/python/journal/learning/memory.py:295)). This correctly distinguishes a later learning improvement from an earlier event recorded incorrectly; deleting every past mistake would destroy useful historical evidence.

The skill expressly distinguishes assisted performance, preparation, delivery, and understanding. It says to preserve meaningful learner wording and actual assistance, and not to classify the tutor's error as the learner's misconception ([SKILL.md:14](/Users/edo/dev/python/journal/learning/skills/learn/SKILL.md:14), [SKILL.md:30](/Users/edo/dev/python/journal/learning/skills/learn/SKILL.md:30)). These are substantive strengths, although the runtime cannot establish their semantic truth.

Local writers are serialized with a lock and expected revision; publication flushes and atomically replaces the file ([storage.py:29](/Users/edo/dev/python/journal/learning/storage.py:29), [storage.py:54](/Users/edo/dev/python/journal/learning/storage.py:54)). Concurrent-write tests exist ([test_memory.py:14](/Users/edo/dev/python/journal/tests/learning/test_memory.py:14)). A database replacement would not address the main representational weakness.

## Worthwhile core changes

### 1. Make topic interpretations explicitly evidence-based and freshness-aware

Today `summary`, `gap`, `status`, and `review` are mutable topic fields. `normalize_record` validates topic identity, links, metadata and review dates, but does not require evidence support or an assessment timestamp/watermark ([memory.py:158](/Users/edo/dev/python/journal/learning/memory.py:158)). Topics may already carry an `observations` list; the generic link checker checks existence, without assigning support semantics or tracking later evidence. The live aggregate inspected by the coordinating agent contains six topics and no topic observation links; that establishes missing traceability, not incorrect content.

More consequentially, planning exposes summary/gap/status without the supporting observation collection ([planning.py:69](/Users/edo/dev/python/journal/learning/planning.py:69)). A tutor can append an explicit correction, retrieve both old and corrected events, and still receive an unchanged topic interpretation from planning. A correction to a claim of independent success does not automatically revisit a review interval scheduled on that claim.

Use one coherent topic assessment containing the interpretation, supporting observation handles, uncertainty in plain language when relevant, and a helper-managed record of which evidence it considered. New relevant evidence or a correction should make the assessment visibly pending reassessment. A tutor may revise it in the same transaction; otherwise context and planning must expose that it has not incorporated the new evidence. Do not have the storage layer invent a replacement belief.

Keep the mechanism modest. Initially, any new observation for the topic can mark its assessment pending; a correction also affects assessments supported by the corrected observation. This conservative rule is easier to explain and test than an LLM deciding silently whether every new event matters. Avoid fabricated probability scores. A statement such as “one assisted success; independent transfer untested” is more defensible than “mastery = 0.81.”

New observations and their assessments must remain atomically saveable. Because handles are helper-assigned, a new contract must explicitly support links to observations added in the same patch; requiring a second write would weaken the existing good transaction boundary.

Minimum verification: append new evidence without an assessment patch; correct evidence underlying an assessment; correct a correction; add unrelated evidence; update assessment and new events atomically; show planning never treats a pending assessment as settled.

### 2. Give observations a small reliable temporal and provenance envelope

Dates are optional, by deliberate contract ([records.md:28](/Users/edo/dev/python/journal/learning/skills/learn/references/records.md:28), [memory.py:188](/Users/edo/dev/python/journal/learning/memory.py:188)). Storage's `updated_at` belongs to the entire scope and changes when anything changes; it cannot identify when a particular attempt happened ([storage.py:91](/Users/edo/dev/python/journal/learning/storage.py:91)). Observation number gives ingestion order, not event time. Three of the thirteen live observations lacked dates in the coordinator's aggregate inspection. No claim is made about why.

Add helper-owned `recorded_at` to every new observation. Keep a separate event date/time when known, with explicit unknown for imported historical attempts; never silently label an old event with today's date. This makes delayed imports, review timing, and changes across sessions interpretable without forcing the tutor to fill out a large form.

Capture the basis of an observation when it matters: direct learner attempt, learner self-report, tutor inference, or external assessment. Preserve the decisive response/excerpt and actual assistance. Source paths and locators establish which exercise was used, but do not themselves prove what the learner said. A host message identifier can be optional provenance; provider identity should not replace the stable logical task handle.

Runtime validation should cover the handful of canonical semantic fields. A controlled probe showed that `summary: false`, `gap: []`, `response: 99`, and `assistance: false` all pass normalization. This is a permissive-contract finding, not evidence of a production incident. Free prose is appropriate for diagnostic detail; arbitrary types for named fields make provider behavior harder to reason about.

There is also a narrower provenance limitation: source handles resolve through a mutable path. A temporary probe saved an event citing `s/Exercise 1`, patched `s.path` from `old-edition.md` to `different-edition.md`, and retrieved the old event with the new path. Ordinary file moves should remain easy. If source contents materially change, preserve a version identity or a small relevant excerpt instead of silently rebinding historical evidence to a different edition. Mandatory full-file hashing is unnecessary for every local note.

Minimum verification: undated historical import retains unknown event time; unrelated writes do not alter event metadata; malformed canonical field types fail; moved source and changed source edition have distinct semantics.

### 3. Consolidate only after the evidence/assessment boundary is sound

The system currently relies on the active tutor to write summaries and clear obsolete task hints. That is a legitimate small-scale design. The coordinator found one approximately 15 KB scope, thirteen observations, six topics, and one task. There is no measured pressure for lossy compression, global graph construction, or scheduled multiagent memory curation.

Once evidence-linked assessments exist, a lightweight on-demand reassessment operation could read affected topic histories, preserve corrections and uncertainty, and propose updated assessments. Run it at meaningful learning milestones or when an assessment becomes pending. Keep original events inspectable. Evaluate whether it improves future teaching decisions before scheduling it or allowing it to rewrite broad learner traits.

Learning about the learner and improving the tutor are different domains. A recurring tutor mistake may justify a narrow procedural improvement, but must not become evidence that the learner is confused. A successful answer after the tutor revealed the solution must not teach the system that this strategy demonstrates learner mastery.

## 2026 primary-source comparison

Only sources published from 1 January through 19 September 2026 inform these comparisons. Papers about personalization or web agents are related evidence, not direct validation of educational outcomes.

| Source and status | Relevant evidence | Appropriate implication here |
| --- | --- | --- |
| [OpenAI, Dreaming: Better memory for a more helpful ChatGPT](https://openai.com/index/chatgpt-memory-dreaming/), 4 June 2026, official research/product post | Describes memory synthesis aimed at freshness, continuity and relevance; evaluates carrying context forward, preference consistency, and changes caused by time. | Test current interpretations across time. It does not prescribe a local schema or prove scheduled background synthesis is needed at this scale. |
| [Anthropic, New in Claude Managed Agents](https://claude.com/blog/new-in-claude-managed-agents), 19 May 2026, official product announcement | Dreaming reviews sessions and memory stores to extract patterns and curate memories; changes can be reviewed before adoption. | Evidence supports separating capture from curation. Managed-agent workflows are not proof that autonomous curation improves this learner's outcomes. |
| [Liao et al., Belief Memory](https://arxiv.org/abs/2605.05583), first submitted 7 May 2026, research preprint; affiliations MBZUAI, RIKEN AIP, UT Austin and Wuhan University | Studies self-reinforcing mistakes when ambiguous observations become deterministic conclusions. Retains competing conclusions and reports results on LoCoMo and ALFWorld. | Preserve uncertainty and avoid turning one attempt into an enduring learner trait. Its numerical probability update is not a validated student mastery estimator and should not be copied as one. |
| [Choi et al., PGMem](https://arxiv.org/abs/2608.01708), first submitted 3 August 2026, research preprint; Korea University and Boston University | Connects inferred persona state to supporting and revising events, then considers evidential validity in retrieval. Evaluated on personalization benchmarks with small language-model backbones. | Supports traceable derived interpretations and correction-aware retrieval. It does not establish that this tutor needs the paper's whole graph architecture. |

BeliefMem and PGMem are independent academic work, not OpenAI, Anthropic or Google DeepMind standards. Their original paper HTML verifies the affiliations ([BeliefMem](https://arxiv.org/html/2605.05583v1), [PGMem](https://arxiv.org/html/2608.01708v1)).

The [Google Research ReasoningBank post](https://research.google/blog/reasoningbank-enabling-agents-to-learn-from-experience/) is dated 21 April 2026 and identifies its authors as Google Cloud researchers. Its [underlying paper](https://arxiv.org/abs/2509.25140) was first submitted on 29 September 2025 and revised on 16 March 2026, so this report does not treat it as new 2026-origin research or a Google DeepMind standard. The post is useful context for a separate possible tutor-procedure memory, but that is lower priority than honest learner-state encoding.

The implementation recommendation is an inference from source comparison and the concrete code paths. No cited lab claims that the proposed schema is a mandatory standard. The best immediate change is a small, explicit relationship between events and current assessments, followed by temporal/provenance metadata and targeted continuity evaluations.
