# State and preference overhead: efficiency assessment

Independent design review, 18 September 2026. Read the integrated design, representation and current-preference proposals, teaching-skill design and lesson-experience design against the inspected current core. No code, vault, settings or models changed. Recommendations here refine the proposals; they do not report measured speedups.

The proposed system can support quick ordinary study turns, but only if retrieval, policy adaptation and persistence are conditional work. The chief risk is turning reasonable capabilities into a repeated turn protocol. Do not execute “discover → classify → retrieve → reconcile preferences → assess → save → reflect” whenever the learner says something. A warm clarification often needs only the explanation.

## Retain, change, defer

| Area | Verdict | Smallest useful behavior |
| --- | --- | --- |
| One canonical teaching skill | Retain | Load on activation; reuse it. No research/design-doc reads during normal teaching |
| Relevant scope context and current preferences | Retain, combine | One known-scope retrieval returns needed evidence, current policy, active work and useful source locators |
| Current preference file | Retain | One sparse current owner; changes occur on actual durable feedback |
| Typed selectors | Retain sparsely | Use established scope/topic handles and only the semantic labels needed for existing applicable rules |
| Preference dimensions | Reduce obligation | Suggested names, not a checklist to populate or reevaluate |
| Explicit versus inferred origin | Retain | Necessary when preferences conflict; no inference should silently override an explicit request |
| Mandatory basis on every preference | Relax | Short provenance when uncertainty or scope is non-obvious; no repeated quote for an obvious explicit rule |
| Saved active preference revision | Remove as mandatory layer | Store CAS revisions in read/write receipts; reconcile current rules on natural resume/retrieval instead |
| Task/session override machinery | Simplify | Current request in conversation; essential temporary instructions in the existing active task only |
| Observation IDs and correction links | Retain | Exact retrieval and record repair need addressable evidence |
| Per-observation semantic fields | Keep optional | Record relevant known conditions, not a filled form for every tutor sentence |
| Summary, gap, review updates every turn | Reject | Change only when the interpretation, next review or continuation actually changes |
| Automatic reflection, indexing, taxonomy upkeep | Defer | No extra agent, model pass, registry or periodic job without an observed failure requiring it |

The existing proposal's selector flexibility does not require a policy engine. The helper matches supplied context literally and groups applicable values. Ordinary tutor reasoning handles semantic compatibility. No total specificity score, repeated conflict-analysis prompt or separate policy summarizer is needed. Predicate containment is useful for understanding an explicit specialization, not a mandate to calculate a hierarchy on every reply.

## What a normal exchange should cost

For a known resumed exercise, use one focused context read and read missing source material only if it is needed. If the scope or assignment is unknown, discovery has real work to do; those extra calls are justified by ambiguity. Do not force a catalog, then a topic index, then a global preference read, then a course preference read before retrieving an already known task.

Once the relevant task, policy and sources are present, retain that snapshot in ordinary conversation. A clarification, notation question or request to restate one step usually needs zero reads and no writes. A substantive learner attempt needs a checkpoint when it adds evidence or advances continuation, combined in one scope write. Each new substantive question awaiting an answer needs its exact active checkpoint for provider handoff. This is a conditional pattern, not a numerical turn budget.

Refresh when resuming across providers, returning after context loss, changing topic/activity in a way that affects available evidence or rules, seeing a contradiction, or resolving a write conflict. A fresh skill read is warranted only when the host has actually lost its instructions or a known skill change matters. A research request, unfamiliar theorem or difficult proof can require more source inspection; the light ordinary path must not forbid necessary deep work.

Do not require classification of every utterance into domain/concept/activity labels. Most continued work inherits known context. Derive additional labels only when the task changes or an existing selector needs them. A local parameter question during coding does not automatically warrant rediscovering a mathematical taxonomy. Uncertain semantic labels should not trigger registry construction.

Return a current policy snapshot with the relevant context. Routine output can include the resolved instruction and origin; include the short basis where it aids interpretation, conflict resolution or updating. The agent needs the preference revision and enough selector identity to target a later change. It does not need all unrelated rules, old feedback, a policy audit trail or a generated prose summary of the same instructions.

## Remove unnecessary preference state

The earlier preference design proposed carrying the policy revision inside every saved active override. That creates another freshness mechanism without guaranteeing current policy across chats. Remove it as a required field. The preferences document still has its ordinary revision for safe writes, and context receipts still identify the read snapshot. On resumption the tutor already receives current policy plus saved task instructions and can reconcile them then.

A one-answer exception remains in conversation. A temporary instruction essential to resuming unfinished work belongs in `active.instructions`, expressed plainly with its scope, such as “For this proof, show each intermediate implication.” Clearing the active task clears its task-specific instruction. If a session-wide instruction must survive handoff, state that within the same resume data; no separate exception IDs, expiration worker, session registry or override lifecycle is needed. Do not carry a finished task's exception into the next one automatically.

Origins earn their small cost because an inferred habit must not defeat explicit feedback. A compact basis earns its cost when it distinguishes an inference, a scope ambiguity or a deliberate exception. Requiring long explanations for every ordinary preference duplicates dialogue and encourages policy bookkeeping. Never maintain confidence scores, observed-use counters or repeated supporting quotes solely to make adaptation look formal.

Natural feedback updates the actual current rule directly when its durable intent is clear. One-off wording changes need no permanent rule. Repeated feedback can motivate an inferred scoped rule during normal reasoning, but there is no mandatory end-of-turn reflection question about what was learned about the user. Updating preferences must not require rereading every previous lesson. If the current evidence cannot support a broad inference, keep the change local.

## Evidence and persistence cadence

Keep the minimal observation contract: stable handle, topic links and meaningful text; add date, actual response, task, assistance, uncertainty and source locator when those facts affect future interpretation. Preserve unknowns. IDs are helper-assigned. Do not produce several near-duplicate descriptions in `text`, `task`, `response` and `summary` merely because fields exist. An exact learner step belongs in evidence when the diagnosis depends on it; irrelevant dialogue does not.

Record a meaningful event, not every chat message: a decisive attempt, assisted correction, new demonstrated boundary, important misconception or changed source/task. A routine explanation does not automatically require an observation asserting it was understood. A short clarification that leaves the pending task and learning interpretation unchanged may require no mutation. Durability is still important: do not postpone decisive learner evidence until session close or an imagined background flush.

When persistence is needed, submit one scope patch containing all related changes: append the new observation, adjust a genuinely changed summary/gap, replace or clear active work, and alter the review only if its rationale/timing changed. Do not schedule, write a summary and update continuation as separate model-driven calls. Do not resend an unchanged relative review interval, since doing so can move its date.

Use the current known revision without a precautionary read immediately before every save. The core validates and publishes atomically; a revision conflict triggers a targeted reread and reconciliation. A successful receipt should update the agent's known revision and supply helper-assigned handles and resolved dates, avoiding a verification read. No-op preference patches should keep the same revision. Ordinary read-after-write verification duplicates backend guarantees; native implementation acceptance checks can verify those guarantees separately.

Only an actual preference change needs a preference mutation. If the same turn also changes learning evidence, two document writes are justified. They can run through one local invocation if useful, with separate revision-checked receipts, but do not invent a cross-file transaction protocol. Failure or partial completion must remain explicit; retries inspect the missing change and never blindly reappend evidence. No approval queue, background repair model or event ledger is required.

A meaningful local save before one authored response adds a tool boundary; it is justified when it preserves continuity. Do not add a save merely to maintain a universal “persist before every answer” ritual. Prepared teaching is not evidence of delivery. Automatic lesson projection can preserve delivered native events without another agent tool call or model rewrite. Keep output authored once; never repeat it after a bookkeeping call.

## Concurrency and freshness are different promises

Locks and expected revisions prevent an agent from overwriting another committed update with a stale patch. They do not make an already running chat instantly aware of feedback written elsewhere. A study conversation may continue with its loaded snapshot until the next meaningful refresh. That is an acceptable initial consistency model for snappy study; do not add per-turn polling to simulate stronger live synchronization.

Current feedback in the active chat applies immediately. On the next natural resume, task change or explicit refresh, read shared policy and evidence again. Independently edited iCloud copies remain outside the local locking guarantee. No event bus, file watcher injected into every provider or continuously invalidated context cache is warranted for the stated need.

## Small acceptance checks

Use one synthetic short lesson containing a cold resume, two warm clarifications, a meaningful attempt, an ongoing style correction and a provider handoff. Inspect whether warm replies avoid redundant context/skill reads; the attempt uses one combined scope patch; the style correction replaces one current value; the handoff restores the exact task, assistance and current policy. Do not turn counts into hard limits when the content actually requires extra work.

Add one genuinely deep request to the same acceptance set: verify that source research expands when needed and the tutor does not hide uncertainty or truncate a necessary proof to meet a speed target. Reuse the existing deterministic concurrency test plus a no-op preference-patch case to test publication behavior; no repeated model sweeps or new benchmark infrastructure.

Record tool-call sequence, repeated reads, time until useful teaching and actual recovery correctness. Distinguish tool latency from model reasoning and source research rather than attributing all delay to JSON size. Performance improvement is unmeasured until these checks run. The proposal should optimize useful teaching per interaction, not merely the smallest stored record or fewest tokens.
