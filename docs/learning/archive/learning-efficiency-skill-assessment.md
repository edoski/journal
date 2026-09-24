# Skill and study-experience efficiency assessment

Independent design review, 18 September 2026. Read the integrated retrieval design, latest preference design, lesson/teaching proposals, quiz proposal, acceptance design, and current 502-word canonical skill. No implementation, vault edits, or model runs.

## Verdict

The proposed architecture can support fluid study, but only if ordinary continuation is explicitly cheap. The greatest risk is making the tutor repeat setup, preference adjudication, retrieval, and calibration before every answer; hiding that work from the learner does not remove its latency or context cost. Keep adaptive effort, with a clear stopping condition for each necessary investigation.

## Findings

1. **Reuse needs an explicit normal path.** The [current skill](../../../learning/skills/learn/SKILL.md) says to retrieve context on starting or resuming. “Continue” within an intact conversation must not be interpreted as a fresh session requiring another skill read, catalog scan, and evidence load. The [integrated design](learning-context-retrieval-design.md) already permits reuse; make that operationally primary. Refresh missing or consequentially changed information after topic/task changes, compaction, source uncertainty, or an actual conflict.

2. **Complete selected histories are an initial evidence policy, not a per-answer ritual.** Preserve access to older evidence and corrections. Once the relevant evidence and source are available, further turns on the same exercise can use them. Topic history size alone does not justify exhaustive rereading; broaden retrieval when unresolved uncertainty could change the next teaching step. Never recover speed by silently dropping assistance, an exact pending question, or decisive contrary evidence. [Retrieval design](learning-context-retrieval-design.md).

3. **The preference design has a genuine recurring-reasoning risk.** Scope/topic/concept/domain/activity selectors serve real overlapping preferences, but resolving every possible label and comparing all rules on every turn would defeat the intended experience. The helper should handle exact applicability and mechanical dominance; the tutor resolves meaning only for relevant unresolved overlaps. Reuse the resulting interpretation for the current task. Explicit feedback changes the answer immediately; durable generalization and semantic cleanup occur only when feedback actually warrants them. [Current preference design](learning-current-preferences-design.md).

4. **Calibration is a learning action, not an admission test repeated per turn.** Retain the user's requested proactive boundary-finding at a substantive start or genuinely new topic. A current attempt may already establish the boundary. Stop when a useful foundation and gap, or sufficient task competence, is established. A resumed pending question and its recorded assistance should continue that episode; it should not trigger another preliminary quiz. Re-probe only when the next teaching decision needs it; direct explanation remains a valid request. [Teaching design](learning-teaching-skill-design.md), [calibration design](learning-calibration-research.md).

5. **Continuous lessons and single authorship reduce avoidable work.** Use the same teaching Markdown in chat and the saved lesson. Avoid both an extra rewriting pass and instructions requiring each reply to restart a self-contained article. Include only the local context necessary to understand the current step. Saving meaningful state does not justify repeating the response or issuing a persistence acknowledgment. [Lesson design](learning-lesson-experience-design.md).

## Ordinary continuation

An ordinary same-task turn uses the skill, source statement, relevant evidence, task-specific policy, and pending work already in context. Interpret the new answer, choose the useful next teaching step, persist changes that matter, and deliver teaching once. It need not rediscover the course, reload unchanged histories, recalculate all preferences, revise every review date, or revisit the presentation design.

This is not a hard zero-tool promise. A learner answer may warrant an evidence append and updated active work; a subtle source condition may warrant verification. The stopping rule is sufficient grounding for the next useful step, not exhausting every possible source. If the uncertainty remains nonblocking, preserve it and teach the supported part rather than prolonging setup.

Use revision information returned by normal reads/writes to detect real conflicts; do not invent a preference-polling call before every answer. This means a change made concurrently in another conversation is not guaranteed to become visible immediately without a refresh. Document that freshness boundary; add proactive invalidation only for an observed requirement, not as a default study tax. The current conversation's explicit feedback always applies immediately.

## Keep policy small; put mechanics with their owner

| In the canonical skill | In helper code, data, or maintenance documentation |
| --- | --- |
| Reuse available context; obtain missing facts that change the next step | Selection, exact matching, IDs, page revisions, completeness, error details |
| Establish and use the task-relevant understanding boundary | Evidence validation, correction pairing, revision-safe append |
| Apply feedback at its supported scope; distinguish temporary requests | Selector normalization, dimension matching, mechanical precedence, atomic updates |
| Preserve assistance, uncertainty, and resumable unfinished work | JSON shape, migration, lock ownership, publication mechanics |
| Teach a coherent step once; record meaningful changes quietly | Event projection, tool UI modes, display identity, branch reconstruction |

Keep the small agent-facing command and patch contract discoverable and stable. Do not turn the whole design corpus into required reading or move an always-used contract behind a reference reread every turn. Detailed migration, selector examples, and renderer/event behavior are implementation concerns, not a tutor checklist. Actionable helper output should resolve routine operational questions without sending the model through several manuals.

## Retain, change, defer

| Decision | Proposal | Reason |
| --- | --- | --- |
| Retain | One skill, shared evidence/current preferences, native source tools, exact active work | Necessary continuity without provider duplication |
| Retain | Precise assistance/correction evidence and safe writes | Speed cannot compensate for a wrong assessment or lost state |
| Change | Retrieval and policy application | Resolve once per relevant context; revisit only missing, changed, or conflicting inputs |
| Change | Preference conflict handling | Apply mechanical rules locally; one bounded semantic decision for a real consequential overlap, not a survey of hypothetical conflicts |
| Change | Review upkeep | Revise timing when new evidence or deadlines justify it; unchanged reviews require no repeated patch or planning call |
| Change | Persistence wording | Save actual changes; group compatible scope changes in one patch, keeping separate preference transactions where required |
| Defer | Default quiz-widget use | Plain conversation is the baseline; the optional tool earns use through interaction value, not every assessment |
| Defer | Taxonomy enrichment, inference cleanup, historical audits during study | Add identities or repairs only when the current request needs them; no silent maintenance project |
| Defer | Extra references, diagram pipelines, model-based rewriting or grading, skill fanout | No demonstrated requirement beyond existing native capabilities |

Sparse preferences are worth keeping; a mandatory global→domain→concept→course→topic reasoning walk is not. Likewise, one compact policy is not an excuse to lose genuinely different task preferences. Resolve the actual task, not the whole learner model.

## Short core wording

Proposed replacement guidance, not an installed edit or complete skill:

> Teach a continuous lesson, advancing the next coherent step toward the learner's goal. Reuse the skill, sources, evidence, and applicable preferences already in context; retrieve what is missing or consequentially changed. At a substantive start or new topic, establish the relevant understanding boundary from the current attempt or a short adaptive probe, then teach from a useful foundation and gap or demonstrated task competence. Explain directly when requested. Apply clear feedback immediately and preserve durable preferences only at their supported scope. Record meaningful evidence, actual assistance, and unfinished work quietly. Deliver teaching once in readable native Markdown, with structure and detail chosen for this learning step.

Pair that guidance with the minimal storage contract and existing scientific safeguards. Replace overlapping old instructions rather than adding a second policy. “At a substantive start” means a teaching episode, not each new assistant message.

## Future native evaluation

Use one short, multi-turn exercise with initial retrieval followed by at least three same-task exchanges, then a meaningful topic change and one explicit preference correction. Include a fresh-host continuation separately. Inspect task accuracy, assistance attribution, calibration resets, preference handling, duplicate teaching, and the continuous Obsidian lesson. A direct-explanation request should not trigger a compulsory intake.

Record observable source/context reads, repeated bytes, writes/no-ops, time until useful teaching, and any available usage counters. Distinguish initial setup from ordinary continuation. Extra work must answer a changed or unresolved teaching decision; a hard call count would penalize necessary verification. Do not require the tutor to narrate these measurements to the learner or infer private reasoning from latency. Deterministic tests cover mechanics; a few native turns assess whether the policy actually stays fluid. Share these cases with [retrieval acceptance](learning-retrieval-evaluation.md), not a parallel benchmark framework.

## Confidence and gaps

High confidence in the identified instruction ambiguities and potential duplicated stages; these are visible in the proposals. Actual delay, unnecessary reasoning, native skill rereads, and subscription impact remain unmeasured. No fixed prompt length, call budget, or calibration count is justified by this review. The recommendation is a lean default with evidence-triggered expansion, not a claim of guaranteed performance.
