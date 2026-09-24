# Learning context and teaching: integrated design

> Historical investigation: implementation descriptions and proposals below reflect an earlier snapshot and are not the current runtime contract. See the [current learning README](../../../learning/README.md) and [behavioral acceptance cases](../behavioral-acceptance.md). Research claims retain their stated dates and limitations.

Implementation status: the agreed core, preferences and Pi changes were installed on 18 September 2026; see [implementation and preservation](learning-system-implementation.md). At the user's request, quality evaluation is through real study feedback, without benchmark infrastructure or model evaluation runs. The research and proposed measurement sections below document the design process, not additional work scheduled for the learner.

Design synthesis, 18 September 2026. This supersedes the earlier recommendation to retain a three-observation view and solve retrieval through summary-writing alone. It also replaces the transcript-style session-note proposal. No runtime or vault migration has been performed by this research round.

## Decision

Keep one canonical teaching skill, one small local Python core, one authoritative JSON file per learning scope and one shared current-preference record. Improve the evidence representation enough to support precise lookup and corrections. Let the tutor resolve meaning with its normal tools; Python selects and safely persists records. Context should be sufficient for the current task, not forced into a tiny observation allowance.

Five focused investigations informed this design: [2026 research](learning-retrieval-frontier-2026.md), [representation](learning-retrieval-representation.md), [query workflow](learning-retrieval-query-design.md), [evaluation](learning-retrieval-evaluation.md), and [teaching skill design](learning-teaching-skill-design.md). The [lesson experience](learning-lesson-experience-design.md) describes the learner-facing result. These are design recommendations, not measured improvements in learning outcomes or subscription usage.

The subsequent preference requirement is covered by [current-preference design](learning-current-preferences-design.md), [scope assessment](learning-preference-scope-evaluation.md), and [current research](learning-current-preferences-research.md).

Four further assessments examined responsiveness and management overhead. Their [reconciled consensus](learning-efficiency-consensus.md) refines this design around context reuse, conditional retrieval and meaningful persistence. These documents are implementation references, not material loaded into study sessions.

The research set contains four papers first submitted in August–September 2026. It supports preserving recoverable evidence and adapting retrieval breadth to the task, but does not establish a universally best memory system. Current official documentation is distinguished from dated research. No 2025-or-earlier paper is used as the frontier evidence for this decision.

## What the learner experiences

The learner asks naturally to continue a course, work on an exercise, understand a concept or plan study. The tutor identifies relevant material and prior understanding, asks a targeted clarification only when genuine ambiguity remains, then teaches in coherent, appropriately scoped steps.

The shared skill steers continuity, calibration, useful depth and concise presentation. It does not impose a fixed lesson template, turn length, repeated headings, universal quiz cadence or mandatory approval ceremony. Structure emerges from the topic and the learner's responses. All clients follow that policy; client adapters handle access and presentation only.

In Obsidian, display the tutor's lesson content, posed exercises and useful feedback. Do not automatically copy user prompts or add You/Tutor wrappers. A short quoted learner step may appear when the correction requires it. Native chat history retains the interaction; evidence records retain meaningful learner responses and actual assistance. No second model rewrites the lesson.

## Evidence representation

Retain the current scope metadata, goals, exam, coverage, reviews and active work. Preserve existing teaching preferences through the single current-preference store described below. Use a small versioned revision of the JSON shape:

| Part | Responsibility |
| --- | --- |
| Scope and topics | Stable meaningful keys, titles, optional known aliases, current summary/gap and existing review information |
| Sources | Stable handles to vault-relative paths or external URIs; optional title and task/page/section locators |
| Observations | Stable handles, referenced topic keys and a meaningful observation; date, exact response, task, assistance and uncertainty when known |
| Relationships | Optional source references, correction links and session grouping; add only relationships actually established |
| Active work | Exact current task, latest relevant attempt, prior help, next/pending question and necessary source/topic references |

Observation handles let the tutor retrieve an old fact exactly and correct an erroneous record without rewriting history. Source handles avoid repeated paths and permit a verified relocation to be fixed in one place. Scope/topic aliases cover established course abbreviations and terminology. Tags are optional for useful distinctions not already represented by topic, task or source; no universal tagging taxonomy or mandatory session registry is needed.

Use one scope-level observation collection so evidence relevant to several topics can be referenced without copying it. The helper assigns observation IDs and returns them; the tutor does not generate UUIDs. Preserve dates and unknowns accurately. Absence of an assistance label never proves independence.

Summaries are current interpretations and navigation aids. They do not replace source observations, and the tutor must reconcile a summary that contradicts the evidence. Include a decisive learner response verbatim when the diagnosis depends on its exact wording; do not assume an assistant-only lesson note or inaccessible native conversation can reconstruct it later.

Distinguish learning progress from record correction. A past wrong answer remains a valid historical observation after the learner improves. A misquoted answer or omitted hint is a defect in the record: append an explicit correction referencing the earlier observation, and present the pair together when retrieved. Do not silently erase old evidence or infer supersession from recency alone.

## Current preferences

Keep one small mutable `learn/preferences.json` containing current global guidance and sparse scoped rules. It is shared learner data, not an agent-written replacement for the canonical skill. Store one current value per preference dimension and applicability selector, rather than a chronological list of corrections. Keeping rules together permits an explicit everywhere-change to replace a global rule and remove conflicting exceptions atomically.

Selectors reference established course/topic identities and, when useful, shared concept, domain or current-activity labels. Multiple conditions mean all must match. Global guidance has no conditions. Reuse learning identities without putting preferences inside historical evidence. No forced domain/course/topic hierarchy, automatic descendant matching, mandatory tagging, or separate taxonomy registry is needed. A proof-related preference can apply across courses while a particular chapter retains a local exception.

The shared skill owns the adaptation rule: apply clear feedback immediately; update the matching durable preference when the user expresses an ongoing expectation; keep one-off instructions local; generalize repeated feedback only as far as it supports. The native tutor interprets the feedback during its ordinary turn, without a reflection agent or extra model pass. The helper owns validation, revision checks, replacement and applicable-scope projection.

Explicit feedback takes precedence over inferred habits. Within the same origin, a rule that includes another rule's conditions and adds conditions specializes it; there is no arbitrary priority between course, domain and activity. Compatible guidance combines. The tutor interprets genuinely conflicting prose using the current request and supported exceptions; the helper does not pretend to resolve meaning. A temporary request changes the current task without automatically rewriting durable rules. Repetition can support a cautious, scoped preference, but success, silence or one complaint does not establish a universal rule. Keep any inference identifiable as inference and easy to replace. Clarify only a consequential ambiguity, in ordinary language, rather than requiring preference-management ceremonies.

Revise a matching rule into one coherent current statement instead of accumulating prohibitions. A broad correction such as "stop doing that everywhere" must also remove contradictory narrower defaults; a task-specific request such as "show every step of this proof" must not erase a general preference for concise explanations. Relevant task exceptions can travel in active work until that task ends. Do not maintain a pending-preference queue or feed obsolete preferences back into routine context.

`context` returns current global guidance plus only applicable scoped rules and active-task instructions, with origin and revision information sufficient to update the right owner. Missing task labels do not prove a match. Keep rules already resolved for the current task in working context; scope selection is not a fresh classification exercise every turn. Once migrated, scope records no longer contain a second authoritative teaching-preference copy. Preserve original current guidance during conversion; do not infer general preferences from study mistakes.

Keep supporting basis short and conditional on actual interpretive value; inferred rules need grounded support. Temporary instructions essential for handoff fit in the existing active task. They need no separate exception registry or mandatory saved preference-revision layer. Normal context/write receipts carry revisions, and natural resumption reconciles current policy with the saved task.

Separate style feedback from defects. Response length, pacing and research depth can be preferences. Duplicate emitted answers, broken rendering or lost state require workflow/code correction when instructions alone are insufficient. The tutor should adapt its next response, but it must not silently edit the canonical skill, runtime, provider settings or access controls during a study session. A current preference is not authority to weaken factual accuracy or storage integrity.

## Retrieval workflow

1. Resolve the course from the request, current context and compact catalog. Use known IDs/titles/aliases before scoped file discovery. A missing learning record does not mean course material is absent.
2. Resolve the exact exercise or source. Distinguish worksheet, edition, number and subpart. Read the statement and its required definitions, figures or code. Ask one concrete question if two plausible assignments remain.
3. Recover matching active work and select relevant topics from the task and compact topic metadata. Explicit new requests override stale focus. Follow prerequisites only as needed for the next reasoning step, not recursively across the whole course.
4. Acquire missing task-relevant history together with goals/preferences, current interpretations, assistance and source references. A focused topic's complete history is useful when modest and relevant; it is not mandatory preparation for every question merely because it fits the context window. For a narrow continuation, start from the exact active work and supporting evidence. Broaden for assessment, recurring difficulties, contradictions or historical questions. Do not truncate by a fixed recent-observation count.
5. Read source excerpts and further observations when needed. Older evidence, contrary evidence and corrected records remain discoverable. Preserve necessary theorem assumptions and task context; read the whole short document when that is simpler and clearer.
6. Proceed when the task/source and next teaching decision are sufficiently grounded. Unknown learner understanding calls for calibration, not invented mastery. Reuse already loaded context; expand when the topic changes, evidence conflicts or native compaction removes what is needed.

The tutor uses its normal file search and document-reading tools. For private structured records, the helper offers deterministic selection and literal text matching over the entire scope, including older observations. It returns candidates and match reasons; it does not parse arbitrary natural-language intent or silently choose between ambiguous courses/exercises.

## Agent-facing surface

Keep the existing internal `context`, `save`, `plan`, `journal` and `note` capabilities; no learner commands. Extend `context` with three coherent uses:

- **Discover:** compact scope/topic metadata, aliases, source locators and history sizes; optional literal matching returns candidate handles across retained observations.
- **Read:** selected topics or exact observation handles, plus active work, applicable current preferences and linked correction evidence. An explicit topic-history request returns that selected history completely when manageable; ordinary continuation need not request it again.
- **Expand:** explicit pages for genuinely large histories. Report selection, revision, total/returned counts, completeness and continuation. Reject unknown explicit keys and stale page revisions rather than returning misleading empty or mixed context.

Pagination is an operational choice informed by actual available context and response limits, not a claim that three, ten or any fixed count is pedagogically sufficient. A tool response truncated by its transport is incomplete even if the helper succeeded; request smaller pages. Never split an observation silently. Keep a direct detail route for long evidence and its linked source.

Distinguish complete retrieval of a selected task from complete coverage of a topic's history. A narrow continuation result cannot establish that the learner has never demonstrated independence, or support a whole-course progress judgment. Such claims require appropriate broader evidence; missing history remains unknown rather than negative evidence.

This reconciles the investigation alternatives: retain the query report's native source discovery and deterministic selection, while adopting addressable observations/source handles rather than continuing arbitrary string lists indefinitely. Avoid a general query language, custom ranking weights or a separately persisted search index.

Start without FTS, embeddings, rerankers or background indexing. Add such machinery only for observed recall or scan-latency failures against the simple baseline. No separate classifier, summarizer or memory-maintenance agent is required.

## Session efficiency

Treat acquisition and continuation differently. Once the task, source, learning evidence and applicable preferences are present, teach from that working context. An ordinary clarification should need no new skill, catalog, preference or source read. Read the skill on activation and recover missing instructions after compaction only when needed; do not reread it as a turn ritual. Do not reclassify the activity or resolve an unchanged preference overlap on each answer.

Retrieve again for a concrete missing fact, a substantive topic/source change, conflicting evidence, lost context, a requested history/planning review, or a stale-write conflict. Stop when the next teaching decision is grounded. A difficult proof can justify substantial mathematical reasoning without justifying a broad memory search. A broad exam plan can legitimately require many topics and Journal activity; an ordinary exercise does not.

Return the applicable policy with an existing context read rather than requiring separate global-policy and scoped-policy calls. Skip catalog discovery when the scope is already known. Source reading remains a native capability and may need its own call. Further context is conditional, not a required discover/read/expand sequence. Large responses remain explicitly incomplete when paged; efficiency cannot hide omissions.

Save meaningful learner evidence, changed assistance, an important unfinished step, durable feedback or a changed review decision promptly. Group related scope changes into one patch and use its returned revision on the next write. No confirming reread is needed after a successful save. An unchanged explanatory follow-up need not write anything. Do not defer all checkpoints until session end: the learner may leave without announcing it. Preference writes occur when preferences change; routine teaching must not rewrite the policy merely for having followed it.

Shared durable state supports fresh and resumed sessions. Already-running chats reuse loaded context; instantaneous propagation into all of them is not promised without polling or push infrastructure. Refresh at genuine context acquisition and reconcile stale writes. On an explicit request to use a just-changed policy, fetch it. Avoid continuous freshness probes solely to simulate live synchronization.

Use observable work profiles as evaluation targets, not enforced tool budgets: grounded follow-ups normally need zero retrieval calls and zero or one scope save; a known-course start generally needs one combined context read plus any necessary source read. Unknown tasks, provider handoffs, conflicts and deep questions may require more. Do not prescribe model reasoning-token ceilings or fixed timeouts for teaching. Measure delay to useful teaching, redundant reads, tool rounds and continuity errors in representative native sessions before claiming a speed or subscription benefit.

The deterministic Pi mirror also has avoidable work: the current implementation rebuilds and publishes on user and assistant message completion and settlement. Assistant-only projection should skip ordinary user events and known unchanged repeated lifecycle work while preserving session/branch reconstruction and public quiz events if introduced. Measure this local work separately from agent calls; do not add a new cache or storage layer without a measured need.

## Response and persistence ordering

The shared skill prepares one teaching response, performs necessary record operations and publishes the response once. It must not repeat already displayed text after a save. This replaces ambiguous post-teaching-save wording in the canonical source; it is not a Claude-specific exception.

Keep the current atomic, revision-checked state publication. A planned explanation/question is not proof of learner exposure, understanding or response. Native history supplies delivery evidence when available; the resume record must remain useful even after interrupted output. The Pi lesson projection rebuilds from native event identity without reprinting prompts or replaying events twice.

Do not introduce an answer journal, transactional outbox or universal chat-delivery protocol. The system cannot guarantee atomic publication across a local file and an external app UI it does not control. The meaningful requirement is one authored teaching response, recoverable learning state, and verified behavior in the supported native clients.

## Skills and optional presentation

Replace contradictory or redundant skill wording rather than stacking more policy. Calibration should actively establish the task-relevant starting point for substantive teaching, use current attempts as evidence, and stop at a useful foundation/gap or demonstrated task competence. Direct-teaching requests remain valid.

Use native Mermaid for small useful relationships; equations remain ordinary Markdown math. No routine PNG export, renderer installation, diagram agent or inspection loop. Add only one optional Pi quiz tool when its widget improves interaction, with explicit public question/feedback projection. Free reasoning remains a normal tutor exchange, not a separate grading-model job.

Preserve the live Claude adapter and local skill links. Code and instruction changes remain in the canonical repository. Native client access controls remain outside this design; no skill can grant itself access to an unconnected folder.

## Preservation and implementation order

1. Revise the core response and lesson policies, including proactive calibration, preference adaptation and native Mermaid. Implement the assistant-focused Pi projection and verify a real native response involving a save.
2. Implement the selected evidence/retrieval and current-preference contracts with focused synthetic fixtures. Rehearse explicit conversion on copies; then preserve and convert existing state without inferring missing dates, assistance, sessions, mastery or global preferences. Keep exact legacy content and existing lesson/source files.
3. Integrate the optional Pi question widget with the same lesson projection. Verify question-before-input, hidden answer keys, distinct cancellation/unknown/incorrect outcomes and branch reconstruction.

Maintain one clean current schema after explicit conversion, with an untouched backup and a validated restoration path. Do not keep permanent dual readers. Existing strings/objects must survive conversion without semantic invention; new observations follow the defined current shape. Migration is not authority to delete historical lessons or study material.

Acceptance centers on exact exercise resolution, important old evidence beyond recent noise, assisted performance, explicit record corrections, provider continuation, visible paging and source changes. Deterministic tests prove storage/query/projection behavior; a few later native-host cases assess actual tutor behavior. Record missing evidence, reads and output sizes before claiming efficiency gains. No large benchmark framework or repeated model sweeps are proposed.
