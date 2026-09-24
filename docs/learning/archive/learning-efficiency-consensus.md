# Study responsiveness: assessment consensus

Implemented in the [current system](learning-system-implementation.md). The user subsequently chose real-life study feedback instead of the proposed native measurement work below; no benchmark or model evaluation pipeline was added.

18 September 2026. Four focused assessments reviewed the gathered proposals: [study experience](learning-efficiency-ux-assessment.md), [retrieval](learning-efficiency-retrieval-assessment.md), [state and preferences](learning-efficiency-state-assessment.md), and [skill overhead](learning-efficiency-skill-assessment.md). Assessors initially examined separate responsibilities, then exchanged findings. Their agreement is design review, not independent experimental validation. No model timing runs, runtime changes or vault edits occurred in this assessment.

## Decision

Keep the architecture, simplify the normal workflow. The tutor uses the task, sources, evidence and preferences already in context; reads only what a new decision needs; saves meaningful changes together; and delivers one coherent teaching response. Hidden management still costs time. Silence alone does not make an expensive workflow acceptable.

The [integrated design](learning-context-retrieval-design.md) is the reconciled implementation direction. Earlier module proposals are investigation records; where they prescribe full-history loading or extra preference state more broadly, this consensus and the integrated design supersede them.

## Agreements and resolved tradeoffs

| Area | Reconciled choice |
| --- | --- |
| Ordinary study | Reuse established context. No recurring skill read, catalog discovery, preference classification, calibration restart or progress audit. |
| Initial acquisition | Known course/task goes directly to focused context with active work, applicable preferences and relevant evidence. Read missing source material through native tools. Discovery is conditional on unknown identity. |
| Historical evidence | Preserve full recoverable evidence and corrections. Exact continuation can use its supporting subset. Wider learner assessment, contradictions, recurring difficulties and historical claims require wider retrieval; fitting in context alone does not make every observation useful now. |
| Preferences | One current shared policy with sparse selectors. Resolve applicability for the actual task and reuse it. Update only on durable feedback, preserving context-specific exceptions. No preference reflection pass or taxonomy maintenance every turn. |
| Preference representation | Keep explicit/inferred origin. Basis is brief and optional unless inference or scope needs support. Remove mandatory preference-revision tracking inside active exceptions; retain normal revision receipts for safe updates. |
| Temporary instructions | Keep them in conversation; use plain instructions in the existing active task when necessary for handoff. No separate exception registry, expiry service or session lifecycle. |
| Persistence | Promptly checkpoint substantive attempts, material assistance and important pending work. Combine related scope changes in one patch. No routine confirmation reread, unchanged summary rewrite, review rescheduling or end-of-session-only saving. |
| Synchronization | Shared state is read on acquisition/resume and actual refresh. Local revision checks protect writes. Already-running conversations do not instantly receive another conversation's edits; avoid per-turn polling to manufacture that promise. |
| Teaching | Calibrate a substantive new learning episode until its starting point is useful; the current attempt can supply the evidence. Continue the lesson without repeated intake or a fixed template. |
| Presentation | One authored response; assistant-focused Markdown lesson. No second rewriting model. Avoid known redundant Pi projection events while preserving branch reconstruction and publication safety. |

Mechanical preference matching belongs in the helper. It can identify applicability, origin and structural specialization. It cannot prove that two prose instructions conflict. Do not discard a compatible instruction merely because another has stronger origin or a narrower selector; the tutor handles an actual semantic conflict once in the current context.

## Expected operation shape

These are diagnostic targets for straightforward cases, not quotas. Initial skill activation, source extraction and host access constraints can add work.

| Situation | Expected management work |
| --- | --- |
| Grounded clarification, unchanged continuation | No retrieval; often no write |
| Meaningful learner attempt or new pending learning step | Usually no retrieval; one combined scope patch |
| Fresh known task or provider handoff | One focused context read plus missing source material; save only meaningful changes |
| Topic/activity switch | Reuse what still applies; retrieve newly needed evidence, policy and source material |
| Explicit durable preference correction | Policy update; read affected rules if necessary, especially for an everywhere-change |
| Broad exam planning, disputed assessment, unfamiliar proof | Enough source/history retrieval to support the request; no small fixed cap |

The stopping condition is sufficient grounding for the next teaching decision. Mathematical reasoning may be extensive while memory retrieval remains small. Conversely, a short question about progress across the semester may require substantial history. Tool-count reduction alone is not evidence of better performance.

Keep Journal reads and broad review planning out of ordinary exercise turns. Update a review only when new evidence, a deadline or an explicit planning request changes its rationale. Native Mermaid stays lightweight; quiz widgets remain optional. Defer embeddings, rerankers, background reflection, generalized caches, taxonomy registries and answer-delivery infrastructure until a concrete failure justifies them.

## Validation before claiming success

After implementation, reuse a few temporary native-session cases: a known exercise with several uninterrupted follow-ups and a substantive attempt; a topic/activity change with durable feedback; and a fresh-provider continuation requiring old evidence or an updated source. Include one genuinely deep request so a speed target cannot reward superficial retrieval. Clean up synthetic records afterward.

Measure delay to useful teaching, repeated reads/bytes, agent tool rounds, meaningful writes, and local projection overhead. Inspect exact continuation, assistance, current preferences, source correctness, old-evidence access, output duplication and visible management chatter. Separate initial acquisition from ordinary turns; distinguish tool time from observable model latency without inferring private reasoning. Do not run repetitive paid sweeps without an observed issue.

The consensus supports a lower-overhead design. Actual responsiveness and subscription impact remain unmeasured; native behavior must establish them. No new schema, preference adaptation, retrieval policy or lesson projection is installed by these documents.
