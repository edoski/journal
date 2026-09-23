# Candidate semantic review

Candidate production: `b8c2876`. Pi 0.87.1, `openai-codex/gpt-6-sol`, high reasoning.
Each of the 15 comparison sessions starts from fresh synthetic state and a fresh
conversation. The frozen evaluator rubric and approved follow-up spec govern the
verdicts. No candidate changes or retries followed inspection of these answers.

All 15 preserve relevant knowledge meaning and provenance. All five correction
sessions preserve `notation` and `bench-wiring` exactly, retain the distinction
between the learner's report and undated-file identity, and add no observations.
All five authority sessions save the newly supported formula-sheet rule without
claiming calculator permission; old assisted evidence and unfinished tasks survive.
All five recalls give g/h with learner-report attribution and unverified status.

Two correction answers violate the frozen requirement to follow any acknowledgment
with subject content. Their acknowledgments use ordinary language, not internal
classification jargon. Score this as an order/ending failure, not knowledge loss
or invented performance. Under the stricter live skill wording (acknowledge before
teaching), those same two cases fail placement. Other answer content passes.

| Case | Content / provenance | Saved meaning | Acknowledgment order / ending | Evidence |
| --- | --- | --- | --- | --- |
| Correction 1 | Pass | Pass | Pass; no learning-status acknowledgment | [Answer](fidelity-sol-candidate/1-s1-qualified-correction/s1-qualified-correction.answer.md), [state](fidelity-sol-candidate/1-s1-qualified-correction/s1-qualified-correction.state.json) |
| Correction 2 | Pass | Pass | **Fail**; ends “not a claim that you've learned the mathematics” | [Answer](fidelity-sol-candidate/2-s1-qualified-correction/s1-qualified-correction.answer.md), [state](fidelity-sol-candidate/2-s1-qualified-correction/s1-qualified-correction.state.json) |
| Correction 3 | Pass | Pass | Pass; ends with source-identity limitation | [Answer](fidelity-sol-candidate/3-s1-qualified-correction/s1-qualified-correction.answer.md), [state](fidelity-sol-candidate/3-s1-qualified-correction/s1-qualified-correction.state.json) |
| Correction 4 | Pass | Pass | Pass; ends with undated-edition limitation | [Answer](fidelity-sol-candidate/4-s1-qualified-correction/s1-qualified-correction.answer.md), [state](fidelity-sol-candidate/4-s1-qualified-correction/s1-qualified-correction.state.json) |
| Correction 5 | Pass | Pass | **Fail**; final clause is “or tell me what mathematics you've already learned” | [Answer](fidelity-sol-candidate/5-s1-qualified-correction/s1-qualified-correction.answer.md), [state](fidelity-sol-candidate/5-s1-qualified-correction/s1-qualified-correction.state.json) |
| Authority 1 | Pass | Pass | Pass | [Answer](fidelity-sol-candidate/1-s7-new-authority/s7-new-authority.answer.md), [state](fidelity-sol-candidate/1-s7-new-authority/s7-new-authority.state.json) |
| Authority 2 | Pass | Pass | Pass | [Answer](fidelity-sol-candidate/2-s7-new-authority/s7-new-authority.answer.md), [state](fidelity-sol-candidate/2-s7-new-authority/s7-new-authority.state.json) |
| Authority 3 | Pass | Pass | Pass | [Answer](fidelity-sol-candidate/3-s7-new-authority/s7-new-authority.answer.md), [state](fidelity-sol-candidate/3-s7-new-authority/s7-new-authority.state.json) |
| Authority 4 | Pass | Pass | Pass | [Answer](fidelity-sol-candidate/4-s7-new-authority/s7-new-authority.answer.md), [state](fidelity-sol-candidate/4-s7-new-authority/s7-new-authority.state.json) |
| Authority 5 | Pass | Pass | Pass | [Answer](fidelity-sol-candidate/5-s7-new-authority/s7-new-authority.answer.md), [state](fidelity-sol-candidate/5-s7-new-authority/s7-new-authority.state.json) |
| Recall 1 | Pass | Pass; unchanged | Pass | [Answer](fidelity-sol-candidate/1-f3-course-recall/f3-course-recall.answer.md), [state](fidelity-sol-candidate/1-f3-course-recall/f3-course-recall.state.json) |
| Recall 2 | Pass | Pass; unchanged | Pass | [Answer](fidelity-sol-candidate/2-f3-course-recall/f3-course-recall.answer.md), [state](fidelity-sol-candidate/2-f3-course-recall/f3-course-recall.state.json) |
| Recall 3 | Pass | Pass; unchanged | Pass | [Answer](fidelity-sol-candidate/3-f3-course-recall/f3-course-recall.answer.md), [state](fidelity-sol-candidate/3-f3-course-recall/f3-course-recall.state.json) |
| Recall 4 | Pass | Pass; unchanged | Pass | [Answer](fidelity-sol-candidate/4-f3-course-recall/f3-course-recall.answer.md), [state](fidelity-sol-candidate/4-f3-course-recall/f3-course-recall.state.json) |
| Recall 5 | Pass | Pass; supported added lab entry | Pass | [Answer](fidelity-sol-candidate/5-f3-course-recall/f3-course-recall.answer.md), [state](fidelity-sol-candidate/5-f3-course-recall/f3-course-recall.state.json) |

Every correction/authority session receives one `needs_confirmation`, then one
successful acknowledged save. Ten previews and ten acknowledgments are expected
control outcomes, not errors. The actual proposed revisions were legitimate; this
batch does not demonstrate the guard rescuing a bad proposal. Deterministic tests
establish rejection/repair and atomicity. No native knowledge+evidence-budget
combination occurred; that tolerant path is covered by Python/CLI/Pi tests only.

Authority 2 duplicates the supported rule in `course_context` and knowledge.
Authority 1/3/4/5 remove the superseded knowledge entry while saving the rule under
course context. Both preserve the meaning; duplication is an efficiency concern.
Recall 5 adds a distinct lab-notation entry with original notation unchanged,
appropriate separate source support and explicit uncertainty. It records no new
learner attempt. Its save is supported, though the brief recall did not need it.
All recalls inspect laboratory sources after receiving the complete g/h entry;
those reads do not verify the requested lecturer/Atlas correspondence. Retrieval
efficiency therefore remains imperfect even with zero parameter errors.

## Additional controls

| Control | Visible answer | State | Evidence |
| --- | --- | --- | --- |
| Ordinary teaching | Pass: one short paragraph, two binary codes imply two levels, no bookkeeping | Unchanged | [Answer](fidelity-sol-controls/1-f4-ordinary-teaching/f4-ordinary-teaching.answer.md), [state](fidelity-sol-controls/1-f4-ordinary-teaching/f4-ordinary-teaching.state.json) |
| Subject vocabulary | Pass: correctly explains evidence as the prior predictive probability 0.625, posterior 0.6; vocabulary belongs to the lesson | Unchanged | [Answer](fidelity-sol-controls/1-f5-subject-vocabulary/f5-subject-vocabulary.answer.md), [state](fidelity-sol-controls/1-f5-subject-vocabulary/f5-subject-vocabulary.state.json) |
| Explicit memory question | Pass: directly describes the recorded assisted recognition and unfinished parameterization; memory language is requested | Unchanged | [Answer](fidelity-sol-controls/1-f6-explicit-memory/f6-explicit-memory.answer.md), [state](fidelity-sol-controls/1-f6-explicit-memory/f6-explicit-memory.state.json) |
| Held-out parameter convention | Correct three-sentence mathematical comparison and source authority; **state restraint fails** the frozen control | Adds a truthful self-report observation and rewrites the pending question; no fabricated attempt or task completion | [Answer](fidelity-sol-controls/heldout/f7-heldout-parameter-convention.answer.md), [state](fidelity-sol-controls/heldout/f7-heldout-parameter-convention.state.json), [rubric](fidelity-heldout-expectations.md) |

The held-out answer correctly uses `s=2-t`, preserves both parameterizations,
and does not promote the demonstrator's card into a lecturer/exam rule. The original
assisted observation, task identity, current pointer, frame, plan, aid uncertainty
and unrelated Signals record survive. Added `o2` accurately attributes the learner's
reported misreading and explicitly says there was no fresh attempt or proficiency
evidence. It nevertheless duplicates a convention correction as an observation,
contrary to the frozen no-extra-observation requirement. Rewording the checkpoint
preserves semantic continuity but fails the stricter exact-state control. These
are unnecessary state changes, not fabricated mathematical performance.

The frozen behavioral acceptance is therefore **not fully green**. These results
do not justify more prompt accumulation or an output filter. The implemented
guard has a narrower structural guarantee; judgments about useful observations
and natural wording remain model-dependent. No failed sample was rerun until clean.
