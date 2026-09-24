# Learning-task context and sparse planning

Research checked 18 September 2026. Scope: preserving the purpose of a lesson across providers while its immediate teaching step changes. This is a design recommendation, not a claim that a particular schema guarantees tutoring quality.

## Evidence

**Persist purpose and useful progress together.** Anthropic's March 2026 scientific-computing account separates a high-level objective and plan from persistent progress notes containing completed work, failed approaches and their reasons, and remaining limitations. This is practical evidence for cross-session continuity in scientific coding; its application to tutoring is an inference. [Long-running Claude for scientific computing](https://www.anthropic.com/research/long-running-Claude).

**Explain why the local request belongs to the larger task.** Current Claude guidance explicitly recommends supplying the larger task and what its output enables, so the agent can connect relevant information rather than infer intent. The same page recommends concise memory of corrections and confirmed approaches, including their rationale. These are model-specific recommendations; their provider-neutral design implication is to retain task purpose and supporting evidence, not copy model-specific scaffolding. [Prompting Claude Fable 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5#give-the-reason-not-only-the-request).

**Keep behavioral judgment flexible, persistence precise.** Official skill guidance recommends concise instructions, progressive disclosure, and more freedom where multiple context-dependent approaches are valid. It reserves tightly specified scripts for fragile operations requiring consistency. Applied here: the tutor decides whether a new chapter needs orientation; Python validates and preserves the resulting records. [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

**Clarification has a cost as well as a benefit.** OpenAI's published Model Spec says to use available context to resolve gaps and weigh a mistaken assumption against user time and delay. Ask when consequential uncertainty remains; use a reasonable assumption when the missing detail would not materially change the response. This source is a behavior specification, dated December 2025, not a research paper or proof of adherence. [Model Spec: uncertainty and clarification](https://model-spec.openai.com/2025-12-18.html#consider-uncertainty-state-assumptions-and-ask-clarifying-questions-when-appropriate).

**Recent research cautions against topic-only memory.** SegTreeMem, June 2026, preserves temporally contiguous interaction segments and distinguishes local evidence from broader evolving context. Its retrieval discussion is task-dependent, rather than establishing one universally best expansion policy. It supports examining contextual relationships in addition to semantic similarity; it does not establish that this small vault needs a segment tree, embeddings or another inference stage. [Paper](https://arxiv.org/html/2606.04555v1).

**Hierarchies can separate intent from the immediate action.** HMT, March 2026, separates intent, stages and actions for web agents and checks stage preconditions before execution. The relevant analogy is that recovering an action is insufficient when its parent goal has been lost. This is evidence from web automation, not learning science; importing its full planner/actor architecture is unwarranted here. [Paper](https://arxiv.org/abs/2603.07024).

## Local diagnosis

At inspection, `learning/memory.py::context` selected task topics or explicit observation handles, then filtered observations against those topics. A current detour into inverses could therefore omit the earlier uniqueness difficulty even if that difficulty caused the detour. `_source_ids` inspected only immediate source references. Task saves replaced the entire named task object, so merely updating a pending question could erase omitted purpose or plan fields. These are concrete representation/retrieval seams, not evidence that more context volume is inherently needed.

The shared skill already called for a short plan at major starts and allowed Mermaid. Its checkpoint guidance emphasized pending work and assistance. It did not give enduring purpose a distinct home or define how that purpose survives an evolving teaching route.

## Recommended minimum

Keep the existing task as the unit of continuity. Add two optional fields, rather than another store or hierarchy service:

| Field | Responsibility |
| --- | --- |
| `frame` | The enclosing material or exercise, learning goal, meaningful completion condition, and the topic/evidence/source anchors needed to understand why the work exists. |
| `plan` | The current proposed or agreed route: a small keyed set of learning steps, prerequisite links where useful, and the current step. |

The task's existing current question, assistance and next action remain its changing teaching position. `frame` survives a detour. It changes when the learner changes the objective, not whenever a new example appears. Plan links denote learning dependencies; a suggested teaching sequence need not imply strict mathematical prerequisites. A graph is useful when these relationships explain the route; a plain short route is enough otherwise.

Use explicit `proposed` versus `agreed` status. Writing a proposal is not learner agreement. Existing authorization to proceed can establish the route without another approval question. If a route is reconstructed from partial history, preserve that uncertainty rather than claim it was previously agreed.

Patch task fields shallowly, preserving omitted fields and supporting explicit removal. This prevents frequent checkpoint writes from discarding the less frequently changing frame. Replace a supplied `frame` or `plan` deliberately as a unit; avoid recursive arbitrary merge semantics or a second checkpoint object. Validate references and plan-node links at the storage boundary. No scheduler or graph database is required.

For normal continuation, one context call returns the task frame, route and current step, plus evidence from both the immediate focus and purpose anchors. Explicitly pinned observations must survive topic filtering; their correction chains remain available. Resolve frame source references and locators. Do not automatically fetch all histories of future plan steps. Explicit topic/query retrieval should retain its focused meaning, with omissions visible through the existing selection metadata. Relevant histories remain available without an arbitrary recent-count limit.

Keep learner evidence in the existing observation store. A planned step, delivered explanation, assisted success and independently demonstrated understanding are different facts. Do not duplicate mastery in plan-node statuses; use referenced observations and concise factual progress descriptions. The tutor's own error is not evidence of a learner misconception.

## In-session behavior

At a meaningful new unit—chapter, slide set, theory group or substantial new objective—the tutor first uses the available materials, evidence and preferences. It then establishes the intended outcome, locates the useful starting boundary, and proposes a short route. Include a compact native Mermaid dependency diagram when it actually explains how the ideas fit. Reuse this orientation across related exercises and resumed chats; do not repeat it at every launch or follow-up.

Ask one concrete question when an unresolved choice would substantially change teaching. For an unfamiliar slide deck, conceptual understanding, exam practice and detailed proofs may imply different routes. Suggest a reasonable route alongside the question so the learner is choosing a useful direction rather than designing the lesson. Missing history alone is not a reason to ask: a clear request can already specify the outcome. Store consequential answers at their supported scope, then proceed without re-asking.

During teaching, the frame stays internal unless a short connection would help the learner or they ask where the lesson is going. Explain a detour's purpose naturally; return to its original objective when the gap is addressed. Change the plan when evidence calls for it. Verify understanding at meaningful transitions or wrap-up rather than enforcing a quiz cadence. A direct question or request for a solution remains direct.

## Confidence and limits

The local loss mechanisms and the official guidance above are well supported. The proposed two-field representation, shallow updates and retrieval union are engineering judgments fitted to this codebase and the observed failure; no cited source establishes an optimal universal tutoring schema. Research on web agents and conversational memory supports preserving intent and contextual relationships, but does not prove learning outcomes or justify adding its infrastructure here.

Focused deterministic checks should cover retained task purpose, selected context and source references, valid route links, and distinction between proposals and agreement. The user has explicitly chosen real study feedback as the quality assessment; no model benchmark, extra reflection agent or quality-evaluation pipeline is proposed.

## Implementation decisions

Implemented in the existing schema-3 task objects; the optional fields do not change the stored envelope. `learning/task_context.py` validates local plan shape and acyclic node dependencies. `learning/memory.py` validates all nested evidence/source links and resolves relevant anchors into the existing context response. Default task retrieval unions topic history with pinned observations, preserving correction expansion and revision-bound paging. Explicit filters remain narrow; their response still carries the selected task frame/route when `--task` is given. All linked plan source locations are available, without reading the material or pulling future histories automatically.

Task patches now merge at field level, removing explicit null fields. Frame/plan values replace whole objects, so an agent updating a plan must retain its unaffected nodes. This is a deliberate update-contract change, documented in the canonical skill, with no compatibility adapter. Ordinary question updates cannot silently erase the frame or plan. The existing task ID remains stable across hosts; source refs and observations remain authoritative.

Teaching policy stays in the shared skill, with the record details and one illustrative example loaded conditionally from `references/lessons.md`. The learner sees a short route at a meaningful start, or a clarification when the choice matters, then focused teaching. No per-turn reflection, plan rendering, extra service, or model-quality benchmark is added.
