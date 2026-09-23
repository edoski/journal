# Learning fidelity and quiet operation: implementation spec

Status: ready for implementation; this document changes no runtime behavior.
Baseline: `6238921153bb67d7b861bb9a6c688bfd2c2e9555`.

This is a bounded follow-up to the [integrated learning revision](learning-ux-implementation-2026-09-23.md), covering the remaining knowledge rewrite, internal narration and avoidable retrieval-error cases. It preserves the shared Python core, JSON records, thin host adapters and natural-language teaching experience. Deliver it as one integrated change, with local verification during development.

## 1. Decisions and their rationale

The ordinary lesson must gain no required tool round, memory narration or approval question. Existing knowledge should survive unrelated learning activity. An agent must still be able to correct a false assertion or resolve uncertainty when evidence warrants it.

| Decision | Reason and limit |
| --- | --- |
| Guard explicit replacement/removal of existing qualifications in the Python save boundary. | Every host benefits. This catches structural loss, not semantic weakening in arbitrary prose. |
| Use an optional list of reviewed entry handles plus the existing revision/digest checks. | Enough for an internal attention checkpoint. No pending approval record, token service, patch hash, expiry, explanation field or new persisted schema. |
| Keep all changes in a blocked save unpublished. | A retry must not duplicate observations or leave only part of a related update applied. |
| Silently ignore a valid evidence budget on a scoped knowledge-only read. | That read returns no evidence. Warning text or a corrective retry adds no value. |
| Replace ambiguous teaching instructions rather than append prohibitions. | Brief acknowledgments of explicit learner constraints can be natural; internal classification narration is unnecessary. |
| Separate deterministic protection from semantic acceptance. | A successful save and preserved words do not establish preserved meaning. |
| Repeat matched native cases in a fixed batch. | A single clean sample cannot distinguish reliable improvement from variability. Five repetitions remain a small diagnostic sample. |

The acknowledgment is not human permission or proof that the agent inspected a diff. The same model can acknowledge an erroneous change. Revision/digest checks bind the request to current state; they do **not** bind acknowledgment to a previously presented patch. This weaker guarantee is intentional: the checkpoint is an error-reduction mechanism for a trusted agent, not an authorization boundary.

## 2. Save contract

### Ownership and public inputs

`learning.records.save` owns detection, validation and the result. Keep the existing locked publication path in `learning.storage.update`; do not duplicate the guard in Pi or introduce a general transaction framework.

Add the optional keyword argument `confirm_qualification_changes: list[str] | None = None`. Expose the same top-level argument in `learning_save`, outside `changes`. Add CLI `--confirm-qualification-changes`, using the existing array-selector parser; adapters forward JSON arrays. Never persist this control in the record.

Omission or `[]` acknowledges nothing. Nonempty values must be unique existing knowledge handles, must correspond to guarded changes in this request, and require `expected_digest` as well as the existing required revision. Unknown, duplicate or unnecessary handles are validation errors. This prevents routinely acknowledging every retrieved entry. The operation still cannot prove that an agent reviewed the change.

### Exactly which changes are guarded

Compare the existing record with the fully validated, normalized candidate under the existing write lock. Apply the following rules only to knowledge entries that already exist:

| Proposed change | Needs acknowledgment |
| --- | --- |
| Omitted field/entry, equal value, new entry, or addition of a previously absent qualification | No |
| Replace or clear populated `attribution` or `uncertainty` | Yes, including string extensions; deciding whether an extension preserves meaning is outside the validator |
| Remove or replace an existing member of `conflicts` | Yes; pure additions and reordering do not trigger |
| Remove or replace an existing reference in `refs` | Yes; adding references and reordering do not trigger |
| Delete an existing knowledge entry | Yes, even if it has no explicit qualification fields |
| Change only `text`, `topics` or `aliases` | No; existing validation still applies |

For references, compare complete normalized reference objects, after existing source-snapshot handling. Each old reference must survive unchanged somewhere in the candidate array. Dropping an excerpt, locator or captured provenance counts as replacement. Enriching an existing reference object is conservatively reviewed too; adding a separate reference is not. Dictionary key ordering and reference-array ordering are irrelevant.

This deliberately does not infer semantic equivalence from string prefixes, word overlap or an LLM classifier. A statement can still be weakened in `text` while metadata stays intact; the native semantic check must detect that. Changes to source registries, assessments, preferences and explicit forgetting retain their existing contracts. This is not a universal provenance guard.

### Atomic outcome and retry

Check ordinary validation and revision/digest conflicts before returning a qualification preview. A malformed candidate must remain a validation error, not a preview of an uncommittable operation. If any guarded entry is not acknowledged, return a normal structured tool result:

```json
{
  "status": "needs_confirmation",
  "scope": "signals-studio",
  "revision": 4,
  "digest": "<current record digest>",
  "changes": [
    {
      "entry": "notation",
      "fields": {
        "uncertainty": {
          "before": "Not independently checked in the current slides.",
          "after": null
        }
      }
    }
  ]
}
```

Contract details:

- `revision` and `digest` describe the unchanged current record, not a receipt for a new save.
- `changes` includes every guarded entry in the request in stable handle order. For each, include exact before/after values for the triggering fields. Missing values are represented by null. Include `text` before/after when text also changes in that entry so the model can see the assertion affected by a qualification change.
- For entry deletion, use `{"entry":"…","deleted":true,"before":{…}}` with the complete old entry. Do not repeat unrelated entries, observations or the full course record.
- Do not truncate the values that must be reviewed. Large exceptional changes should be narrowed by the caller, not silently summarized by the tool.
- The whole transaction remains unpublished: no state bytes, revision, timestamps, observation sequence, observation IDs, task updates or related source changes commit. Existing lock-file creation is not learner-state publication.
- Return no assigned-observation or review-date success fields. CLI exits successfully with this structured result; Pi keeps it internal through its existing quiet tool rendering. This is a recoverable noncommit outcome, not a transport error or a successful save.
- Successful saves retain the current receipt shape. Validation, conflict and interrupted-delivery behavior remain distinct.

The normal agent flow is: inspect the returned change, then either repair the patch to preserve the old qualification or resend the intended patch with exactly the guarded entry handles acknowledged and the returned revision/digest. If the repaired patch has no guarded changes, omit acknowledgment. If state has changed, retrieve and reconcile before retrying. A successful receipt needs no confirming reread.

The tool may accept a fully specified acknowledgment on the first call when the agent has already reviewed the current entry and the intended change. No server-side pending preview is required. Default behavior remains to omit acknowledgment; it must never be added as a generic retry reflex. A mixed batch with any unacknowledged guarded entry stays entirely unpublished.

Use evidence already available to decide whether a correction is warranted. Do not ask the learner to approve storage mechanics. A substantive question is appropriate only when the learning request or evidence is genuinely ambiguous. If persistence ultimately cannot complete and continuity is affected, retain the existing concise failure disclosure rather than silently claiming success.

### Preservation rule

Replace existing overlapping guidance with this principle:

> Add distinct new facts without rewriting unrelated assertions. Revise an existing assertion when relevant evidence corrects, clarifies or supersedes it; preserve every still-applicable qualification and its attribution.

A separate `lab-time-convention` entry is appropriate for the new discrete-time `g[n]` notice. Enriching `notation` is also acceptable if the lecturer/Atlas correspondence, learner-report provenance and unverified-slides qualification remain intact and unambiguous. Do not mandate one entry per fact or duplicate the old assertion across multiple entries. Unrelated entries should remain untouched.

## 3. Retrieval contract

In `learning.retrieval.context`, separate evidence-budget value validation from read-mode validation:

- A supplied budget must remain an integer of at least 2 bytes, excluding booleans, even when it will have no effect.
- With a scope and `knowledge=[]` or a nonempty exact knowledge selection, accept a valid `evidence_budget` and ignore it. The result must equal the result without that argument, with no warning, added field, evidence expansion or mutation.
- Continue rejecting evidence budgets for scope catalogs and CLI `--all`. Continue rejecting incompatible actual selectors, invalid pagination, and invalid `knowledge_budget` combinations.
- Ordinary scoped context, scoped query results, and other supported evidence reads continue applying their evidence budget. Do not describe scoped queries as universally incompatible.

The current CLI already forwards a scoped knowledge request with an evidence budget to the core; its catalog and `--all` guards should remain. Change guards only where required to achieve this exact contract. Pi must neither reject nor strip the argument independently: Python remains the canonical owner.

Replace the Pi field description and corresponding CLI/reference wording with a concise equivalent of: “Evidence allowance in UTF-8 bytes, minimum 2. Applies to scoped evidence reads; ignored for knowledge-only reads. Invalid for catalog or all.” Other established limits and omission disclosures remain unchanged.

## 4. Learner-facing behavior and instruction budget

Define three cases explicitly in the evaluator:

1. **Ordinary teaching:** answer the requested subject. Do not volunteer how an answer is recorded, classified or assessed internally.
2. **Explicit restriction on recording/inference:** comply. At most one brief, natural acknowledgment is allowed, followed by subject content when subject content was requested. “Understood—just the notation convention” is acceptable. No explanation of evidence categories, storage fields or tool mechanics.
3. **Explicit memory/progress question:** explain the requested remembered facts, limits or recording behavior accurately in ordinary language. Do not apply the ordinary-teaching silence rule to a direct question about memory.

Terms such as “evidence” and “observation” may be legitimate lesson content. An explanation of Bayesian evidence is not a bookkeeping leak. A standalone request to stop recording does not need an artificial lesson appended to it. Unsupported promises about provider history remain disallowed by the existing lifecycle contract.

Replace the conflicting silence sentence in the canonical skill; put save acknowledgment handling in the existing records recovery paragraph. Update affected live tool descriptions and any actual copied client guidance through their established ownership. Do not copy the evaluation rubric into the skill or prompt.

Budget for this revision: at most 150 net additional words across the canonical `SKILL.md` and Pi's live tool descriptions combined, measured against the baseline. This is a review budget, not a new runtime check. The on-demand records reference may explain the protocol once. Report serialized tool-schema size separately, since the new optional field has a cost beyond its description.

No runtime response filter, keyword blocklist, reflection model, mandatory knowledge reread, routine warning, extra retrieval stream or always-run verification call is added. Safe writes and ordinary reads retain their current call count and response shapes. A guarded write normally adds one save round; a repairing write may avoid future guard rounds. Actual model retries are measured rather than assumed bounded.

## 5. Acceptance and evaluation

### Deterministic tests at existing boundaries

Extend the existing records/retrieval tests and representative CLI/Pi round trips. Prefer small parameterized cases and one mixed-transaction test over reproducing the same matrix in every adapter.

| Boundary | Required evidence |
| --- | --- |
| Save trigger rules | Safe additions, equal values and reordering commit normally; replacement/clearing, reference loss, conflict loss and entry deletion produce the specified preview. Include a reference excerpt loss. |
| Atomicity | A blocked patch containing a real observation, task change and knowledge change leaves record bytes unchanged. An acknowledged retry commits them together exactly once, without an observation-ID gap. |
| Acknowledgment | Matching handles plus current revision/digest permit a legitimate change; partial acknowledgment blocks the whole batch; duplicates, irrelevant handles or missing digest are invalid. Stale revision and same-revision changed-content digest reject without publication. |
| Validity | Malformed candidate data remains a validation error even if the same patch would trigger the guard. Repairing a patch removes the acknowledgment requirement. |
| Agent-visible result | CLI and Pi preserve the noncommit status and exact values; success receipt remains distinguishable. Quiet rendering exposes no routine preview to the lesson. Existing no-save and uncertain-delivery protections still hold. |
| Retrieval | Knowledge index and exact reads with valid evidence budgets equal the same reads without them. Invalid values and incompatible actual selectors still reject. Scoped evidence/query reads still enforce their budget. |
| Semantic boundary | A valid text-only revision remains possible. Do not add a misleading assertion that this guard detects confidence changes in prose. |

Existing callers/tests that intentionally replace qualifications must use the acknowledgment contract. Do not bypass it for trusted tests or add a compatibility flag. Initial fixture creation needs no acknowledgment because its entries are new. The explicit forgetting workflow keeps its existing preview/apply checks; do not route it through a second approval system.

### Semantic rubric

Update `evaluator-expectations.md` before comparing implementations. Score the answer and saved state separately as pass/fail/unverified, with quoted public passages or exact state changes.

For the notation scenario, pass requires all of these meanings to remain: the lecturer uses g; Atlas uses h; the correspondence is learner-reported; independent checking against current slides has not occurred. A source about laboratory time notation cannot replace the basis for that correspondence. Adding `g[n]` is allowed if those claims and their individual provenance remain clear. “Atlas may use h” fails preservation of the existing reported assertion. Clearing uncertainty passes only when the new evidence addresses that particular uncertainty.

Keep exact equality for explicitly untouched controls, including the unrelated bench entry and no-save/clarification state. For an entry permitted to be enriched, equality is a useful diagnostic, not the semantic pass criterion. Check all changed knowledge entries and new observations; a source correction must not invent learner performance.

An optional offline keyword scan may flag passages for human review. It produces informational matches with surrounding text, never a pass/fail verdict, runtime intervention or tutor instruction. Include ordinary subject uses of the vocabulary and an explicit memory question as controls. An empty scan is not evidence that the response contains no internal narration. Do not add the scanner if simple review of this small corpus is sufficient.

### Fixed native comparison

Extend the existing opt-in acceptance runner to support independent repetitions without overwriting historical run-1/2/3 evidence. Default remains prepare-only. Keep expectations outside the assigned tutor sources.

Run five fresh repetitions of each of these three profiles against both the pinned baseline and candidate: 30 native sessions total.

| Profile | What it tests |
| --- | --- |
| Qualified source correction with the learner's explicit inference restriction | Notation and source-uncertainty preservation, absence of invented observations, natural acknowledgment, and any save-guard handling |
| New authoritative source resolving a specific uncertainty | Useful revision remains possible; unrelated unknowns survive; acknowledgment does not create repeated loops |
| Course-specific recall of existing knowledge | Relevant retrieval and answer, no unsolicited administration, tool errors/retries and unnecessary extra reads |

Use the existing correction and authority fixtures. Define the recall profile and freeze every prompt and expectation before baseline/candidate runs; do not tell the tutor which tool parameters to use. The erroneous budget combination is guaranteed to be tested deterministically. If the model never chooses it in a native profile, record that coverage as not exercised rather than claiming a native error was eliminated.

Run four additional candidate controls once each: ordinary teaching with no recording instruction, a lesson legitimately using terms such as evidence/observation, an explicit question about remembered state, and a held-out correction in another subject. Define the held-out variant before evaluating the candidate and keep its expected answer out of implementation prompts. Once used to guide a fix it is no longer held out; disclose that.

Each repetition begins from identical synthetic preconditions and a fresh native conversation. If a profile requires prior state, seed that state deterministically or preserve its explicit internal sequence. Do not let correction runs mutate the initial state of later repetitions. Maintain matched host/provider/model settings; pin model identity explicitly rather than relying on a changing default. Record settings that are unavailable. Alternate baseline/candidate execution order where practical, and verify each process loads the intended skill, adapter and Python code from its respective checkout without changing installed user configuration.

Capture initial/final synthetic state, prompts, public answers and tool traces, source hashes, code revision/diff, host/model identity, elapsed time, time to first public teaching, and per-round provider input/cache/output usage. Exclude private reasoning and credentials. Distinguish static loaded schema/instruction size, returned tool bytes, peak observable request size if available, and accumulated tokens across requests. A sum of tokens is not a context-window size.

Report per-profile counts, not a single blended percentage: meaning preserved; permitted update completed; internal narration absent; genuine tool errors; expected noncommit previews; unnecessary reads; native budget misuse exercised. Report save/context call counts and latency/token measurements per repetition with median/range. Missing measurements remain unavailable. Five successes are a diagnostic result, not a population reliability estimate or proof of learning gains.

There is one fixed comparison batch, not automatic rerunning until clean. If a candidate fails, retain the failed evidence and identify the remaining defect. A later code change gets a new labeled batch of affected profiles; never replace earlier failures or pool different candidate versions as one success rate.

## 6. Implementation map and delivery

| Surface | Change |
| --- | --- |
| `learning/records.py` | Local guard comparison, acknowledgment validation and noncommit result inside existing atomic save flow |
| `learning/__main__.py` | Save control parsing/forwarding and documentation of exact budget behavior; preserve other mode guards |
| `learning/pi.ts` | Optional save control, accurate result/parameter descriptions and forwarding; existing quiet rendering |
| `learning/retrieval.py` | Validate budget values separately; tolerate evidence budgets on scoped knowledge reads |
| `learning/skills/learn/SKILL.md`, `references/records.md` | Replace overlapping guidance with preservation, acknowledgment and natural-response rules |
| `tests/learning/test_records.py`, `test_retrieval.py`, `test_cli.py`, `test_pi.mjs` | Focused behavior and representative adapter parity |
| `docs/learning-ux-acceptance-2026-09-23/` | Revised rubric, repeatable isolated runs and new evidence/report directories; preserve original traces |

No record migration or schema-version bump is needed. This changes the mutation contract for certain existing operations and requires synchronized Python, CLI, adapter and canonical reference updates. Do not introduce an old permissive save mode. Check other client guidance for actual duplicated contracts rather than editing every host file speculatively.

Implementation order within the integrated change:

1. Freeze the rubric and case inputs; prepare baseline capture.
2. Implement the core guard and retrieval change, plus focused deterministic tests.
3. Update CLI/Pi contracts and replace the minimal canonical guidance.
4. Run `.venv/bin/python tools/check.py learning`, then independent review of the substantive change against this spec and repository standards; correct actionable findings.
5. Run the fixed native comparison against the final candidate. Review public answers and complete state diffs using the frozen rubric.
6. Write a delivery report distinguishing engineering checks, native behavior, untested hosts/UI and unmeasured learning efficacy. If installation is part of the implementation handoff, use the existing preflighted installer, verify readiness and unchanged personal learner-state hashes. Do not build unrelated native app changes.

Engineering completion requires passing deterministic checks, synchronized contracts, the stated instruction budget and no actionable review findings. Behavioral acceptance requires zero observed qualification-loss or inappropriate-narration failures in the candidate batch, successful legitimate updates, and no recurring guard loop. Missing native coverage is unverified, not passed. Other native parameter failures must be reported rather than masked by the corrected budget case. Passing a small batch establishes only bounded observed acceptance.

If engineering checks pass but semantic failures remain, report that distinction and the exact remaining failures; do not declare the three cases universally solved or continue adding skill prose without a new diagnosis.

## 7. Scope exclusions

This spec does not redesign knowledge into atomic claims, add history/event storage, implement semantic diffing, install a model judge, guarantee truthful attribution, guarantee provider parity, test delayed human learning, change explicit forgetting authorization, or add a compulsory learner confirmation flow. It adds no database, background worker, provider dependency, runtime regex filter or compatibility shim. Personal learner data and unrelated macOS edits are outside all fixtures and changes.
