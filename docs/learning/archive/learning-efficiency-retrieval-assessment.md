# Retrieval efficiency assessment

Design review, 18 September 2026. Read the [integrated design](learning-context-retrieval-design.md), [current preferences](learning-current-preferences-design.md), [representation](learning-retrieval-representation.md), [query design](learning-retrieval-query-design.md), [acceptance](learning-retrieval-evaluation.md), [teaching skill](learning-teaching-skill-design.md) and [lesson experience](learning-lesson-experience-design.md), with current helper/skill source. Only this assessment changed; no runtime, vault or model tests.

## Verdict

**Retain the architecture; change the invocation policy.** Initial acquisition and an ordinary teaching turn are different operations. A grounded follow-up should reuse its known task, source excerpts, evidence and applicable preferences without new retrieval. Resume can retrieve exact active work and its supporting observations. When a topic-history read is selected, return its complete history when manageable; that does not make such a read compulsory merely because it fits.

The proposed numbered retrieval flow should describe decisions, not a compulsory sequence of calls. Deeper retrieval needs a named unresolved question: which exercise, what assumption, whether an old answer was independent, which correction applies, or what changed. No fixed evidence cap or universal token budget follows from this recommendation.

## Findings

| Costly interpretation of the proposals | Change |
| --- | --- |
| Read global preferences → list scopes → resolve course → read its index → resolve activity → read more preferences → read history | Known identities go directly to one focused context result containing evidence, active work and applicable policy. Unknown scope discovery includes global policy in that same result. Fetch additional policy only when newly established context can change it. |
| Treat the index as mandatory before every focused read | Use it when identities or history size are unknown. Existing topic IDs, exact observations and matching active work permit direct reads. Return completeness/size metadata with normal reads; a separate index is not a ceremony. |
| Reopen the task source and reselect prerequisites after each learner answer | Keep the actual statement, assumptions, excerpts and selection in native context. Expand only when the new step needs material not already present or there is evidence of change. |
| Retrieve all topic history whenever any sentence touches that topic | Reuse loaded evidence. A local algebra clarification often needs only the visible attempt and established task context. Broader history is for decisions that need it, not a prerequisite for every explanation. |
| Recompute every concept/domain/activity selector and reconsider all preference conflicts each turn | Resolve actual task context once and carry its applicable policy. Reconsider only feedback, activity/topic changes, newly relevant identities or a real conflict. Do not classify incidental words in every answer. |
| Reread revisions before every save and reread again afterward | Write against the retained revision; successful receipts advance local knowledge. Reread/reconcile on conflict or uncertain completion. Preserve compare-and-swap on every mutation. |
| Run proactive calibration as a new assessment before each teaching step | The current attempt and already recovered evidence can establish the starting point. Probe only the remaining uncertainty that affects teaching; stop when there is sufficient foundation or task competence. |
| Save policy, active work, observations, reviews and notes as separate routine stages | Only changed owners need writes. Combine meaningful scope changes in one patch. Policy writes require actual durable feedback; extra note publication requires a substantial artifact. Pi already owns lesson projection. |

These are risks in reading the proposals literally, not measured current production costs. Existing [memory code](../../../learning/memory.py) already returns revision receipts and provides locked atomic writes; those mechanisms need no additional read-before-write protocol.

## Practical call profiles

The counts below describe expected simple cases, not caps or correctness criteria. Source ambiguity and genuinely large records may require more work.

| Situation | Retrieval profile | Persistence |
| --- | --- | --- |
| Ordinary follow-up within a grounded task | **Zero new reads.** Use the visible attempt, current source material, loaded evidence and policy. No skill reload or policy reflection. | Zero writes for a clarification with no durable change; normally one scope patch for meaningful learner evidence or changed continuation. |
| New session, known course/task | Usually one focused context call including applicable policy and active work; fetch only source material absent from the conversation/record. Skip catalog and index when identifiers and selection are already known. | Save only resulting meaningful changes. |
| New session, unresolved course/exercise | One compact discovery result including global policy; scoped source discovery and candidate inspection; then selected context after identity is known. Batch independent reads when supported. | Do not create a scope or preference merely because lookup was inconclusive. |
| Resume or provider handoff | Fresh focused context for the saved task, current policy and assistance; read its exact missing source excerpt if needed. Recover the pending question without reintroducing the course or restarting assessment. | Patch only changed state; a read-only resume requires no save. |
| Topic/activity changes during a session | Reuse global/course identity and unchanged sources. Retrieve newly relevant evidence and policy together; refresh source material only for the new work. Existing current topics need not be returned again. | One patch if focus/continuation/evidence changes meaningfully. |
| Native compaction | If retained context still contains the material needed for this decision, continue. Otherwise reacquire the exact active task and missing evidence/excerpts; no whole-course bootstrap. | Native compaction itself does not require another observation or policy rewrite. |
| Deep retrospective or disputed evidence | Search the relevant scope, read exact observations and correction links, then expand or page until the requested conclusion is supported. Whole selected histories or several topics may be appropriate. | Save a changed interpretation only after reconciling the evidence. |

For “exercise 5 SMM,” a previously resolved course and source handle should bypass broad discovery. If two worksheets remain plausible, inspect those candidates or ask the distinguishing question; eliminating a necessary clarification would be false efficiency.

## Reuse and freshness

Keep reuse in ordinary native conversation context: selected task/topics, actual source excerpts, current policy, scope/policy revisions and completeness. No new persistent cache, context digest, session registry, token allocator or dependency-invalidation service is needed. Stable source/observation handles support targeted reacquisition after context loss.

The session uses the last retrieved policy/evidence snapshot. Refresh on a genuine resume/handoff, a relevant scope/topic/activity change, an explicit external-change signal, a source discrepancy, or a revision conflict. A passing clarification does not create a freshness boundary. A newly relevant preference selector may justify a policy-only projection through the same helper; it does not justify reloading every observation.

**CAS protects writes, not read freshness.** Reusing context cannot promise immediate visibility of another agent's preference edit. State this limit rather than adding per-turn polling. At the next necessary context read, return the current policy and revisions. A changed revision is a reason to inspect relevant rules, not to discard all context or erase active task exceptions. An explicit request to use a just-changed policy warrants an immediate read.

Avoid a second freshness mechanism based on mandatory `active.preference_revision` polling. The existing current policy, explicit task exception and native context provide enough information to reconcile on natural retrieval. Keeping an as-of revision for provenance is different from requiring a revision check before each answer. Independent cross-device iCloud edits remain outside local CAS guarantees.

Use the last known scope revision for a meaningful patch. On a successful receipt, retain its new revision/assigned IDs and the confirmed changes; do not re-fetch unchanged history. On conflict, reload affected context, reconcile concurrent changes and retry only the intended update. If the save result is uncertain, first inspect whether the observation committed; never blindly reappend. Distinct scope and preference files remain separate transactions. A policy-only correction needs no scope write unless it also changes resumable work or evidence. Save meaningful attempts and important continuation changes promptly; reducing needless writes must not become session-end-only persistence.

Native source text is likewise a snapshot. Reuse it within the continuous task; reread on resume when the original is needed, reported edits, mismatched locators or content contradictions. Do not stat/hash every source on every turn. A stale or missing source cannot be made authoritative by caching its old excerpt.

## Minimal common contract

One `context` operation should project the requested evidence/active work and applicable current policy together, with separate revisions and explicit selection/completeness. Discovery can include global policy with its catalog. Do not implement separate per-host preference loaders, a natural-language router or a mandatory orchestrator pipeline.

Keep lexical matching and source discovery native. The tutor supplies known selectors from its existing understanding; the helper performs exact matching and selection. Where context identity is genuinely unknown, use staged discovery. Where independent source and record reads are already identified, request them together rather than waiting for one before asking for the other.

Full focused evidence, direct observation lookup and explicit pagination remain available. “Manageable” is about the actual record and host context, not a fixed pedagogical quota. Choose the evidence scope needed for the decision, whether records are small or large; do not exhaust topic history merely to answer a local source question. Exact-task selections must disclose that scope and cannot establish “never demonstrated independently,” broad mastery, progress or recurring-gap claims. Those judgments require wider evidence, even when it takes longer. Unknown history stays unknown.

Keep the canonical skill short enough to carry the common rule inline: reuse sufficient context, retrieve only what is missing, save meaningful changes once, then deliver teaching once. Research reports, conflict examples and optional UI documentation are not routine lesson inputs. Supported hosts need only their normal native tools plus the same local helper; no MCP server, provider-specific cache protocol or extra model pass is required.

## Retain, change, defer

**Retain:** one canonical skill, one scope record, current policy owner, addressable observations/source references, assistance distinctions, correction links, complete topic histories when selected, explicit pagination and atomic revision-checked saves.

**Change:** make known-task reuse the ordinary path; combine applicable policy with context; avoid obligatory catalog/index stages; tie expansion/calibration to an unresolved teaching decision; limit persistence to meaningful changes and use receipts instead of verification rereads.

**Defer:** FTS/embeddings, global taxonomy completion, automated compaction preparation, new cache/snapshot services, active-policy polling, generalized batched APIs and mandatory source hashing. Reconsider only against an observed failure the current simple contract cannot handle.

## Confidence and gaps

High confidence that these changes eliminate logically redundant operations while preserving current write protection. Actual latency, token use and host behavior were not measured; zero-read ordinary turns are a design expectation when context is sufficient, not an observed result. A later small native exchange should cover warm clarification, meaningful answer, topic change, compaction recovery and an external revision conflict, recording reads/writes and missing evidence alongside responsiveness.
