# Learning fidelity follow-up: delivery and observed limits

The [approved spec](learning-fidelity-followup-spec-2026-09-23.md) is implemented,
reviewed and installed. Engineering checks pass. The fixed native evaluation is
**not fully green**: knowledge meaning and provenance survive, but two responses
misplace the acknowledgment and the held-out case makes unnecessary state changes.
No failed sample was rerun until clean, and no production change followed inspection
of the final candidate batch.

Baseline: `6238921153bb67d7b861bb9a6c688bfd2c2e9555`.
Production candidate: `b8c2876e74390169330f36dfad2da771fb780a97`, including the main
implementation in `446ecb8b5c0ea311daf38338c0329e2f97c7d2c8`.
Later report/evidence commits do not change the tested implementation.

## Delivered behavior

`learning_save` now returns an exact, internal `needs_confirmation` preview before
replacing or removing existing attribution, uncertainty, conflicts or references,
or deleting an existing knowledge entry. The entire proposed update stays
unpublished, including observations and task/source changes. The agent can repair
the patch or acknowledge the affected handles with the current revision and digest.
Successful receipts remain unchanged. Invalid candidates and stale state still
fail before review; qualification acknowledgment is never persisted.

This is an agent attention checkpoint, not learner permission. It cannot prove the
agent understood the diff, prevent semantic weakening confined to `text`, or bind
acknowledgment to a previously presented patch. It introduces no pending-request
store or semantic classifier. New facts, additive qualifications, safe writes and
ordinary reads do not require an extra call.

Scoped knowledge-only reads silently ignore a valid `evidence_budget`. Invalid
budget values and incompatible selectors still fail; actual evidence reads still
enforce their budgets. Python owns the behavior; CLI and Pi expose the same contract.

Canonical guidance now distinguishes ordinary teaching, a brief acknowledgment of
an explicit learner restriction before the subject answer, and a direct memory
question. It favors adding distinct facts while permitting supported corrections.
There is no runtime vocabulary filter, extra retrieval stream or routine warning.
The existing quiet Pi renderer keeps save review out of the lesson.

## Engineering verification and installation

The final candidate passed `.venv/bin/python tools/check.py learning`: **267 Python
tests, 32 Pi adapter tests, Ruff, strict mypy over 20 source files, and all 10 import
contracts**. Focused cases cover guard triggers, exact previews, atomic mixed saves,
retry IDs, qualification repair, acknowledgment validation, conflict precedence,
serialization errors, CLI/Pi forwarding, quiet rendering and retrieval equivalence.

Independent Standards and Spec reviews both finished with zero actionable findings.
The Spec review found one validation-order defect: an unserializable candidate
could reach a noncommit preview. Commit `b8c2876` makes serialization validation
precede that preview; focused cases cover nonfinite numbers and invalid Unicode.
The final correction was independently re-reviewed. Behavioral review is reported
separately below rather than hidden behind the code-review result.

The existing installer completed with readiness true and no issues. Hashes of all
three personal portable state files remained unchanged; see the aggregate
[installation receipt](learning-ux-acceptance-2026-09-23/fidelity-installation.json).
Unrelated macOS edits were preserved, and no native app rebuild was performed.
New Pi sessions load the updated tool schema; existing running sessions were not
claimed to have reloaded it.

At the user's request, Pi was updated from 0.85.1 to **0.87.1** and the exact
`openai-codex/gpt-6-sol` model was verified in its catalog and every returned model
message. Official references identify [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)
and [Pi's provider/model entry](https://pi.dev/models/openai-codex/gpt-6-sol).
All accepted sessions use high reasoning. The harness pins the model and refuses
fallback; it does not change the global default. The interrupted GPT-5.5 batch is
retained separately and excluded from every comparison below.

## Fixed native evaluation

There are 34 fresh synthetic sessions: five repetitions of three profiles per arm,
plus four candidate controls. Each uses Pi 0.87.1 and GPT-6 Sol/high. Prompts and
rubrics were frozen before evaluation; the independent held-out case was withheld
from implementation and defined before its evaluation. Baseline and candidate
source hashes match their pinned commits. All processes completed without timeout,
model mismatch, production-source mutation or tool error.

| Check | Baseline | Candidate |
| --- | --- | --- |
| Qualified correction: notation meaning and provenance | 5/5 pass | 5/5 pass; original notation and unrelated bench entry also byte-identical |
| Legitimate authority update, unrelated calculator uncertainty retained | 5/5 pass | 5/5 pass |
| Course recall, attribution and unverified status | 5/5 pass | 5/5 pass |
| Correction acknowledgment followed by subject content, frozen rubric | 5/5 pass | **3/5 pass** |
| Same acknowledgment placed before teaching, stricter live skill | 3/5 pass | **3/5 pass** |
| New invented learner performance in comparison cases | 0/15 | 0/15 |
| Knowledge read with `evidence_budget` actually attempted | 0 | 0: native coverage unexercised |

Candidate correction 2 ends with “not a claim that you've learned the mathematics”;
correction 5 ends with “or tell me what mathematics you've already learned.” These
are natural acknowledgments rather than internal classification jargon, but fail
the required answer order/ending. The rubric was not relaxed after seeing them.

All ten candidate correction/authority cases produced one review preview followed
by one successful acknowledged save, with no recurring loop. Their proposed changes
were legitimate. This batch therefore demonstrates usable review/retry handling,
not rescue of an actually bad native proposal. Deterministic tests establish guard
enforcement and repair. Likewise, the tolerant knowledge-budget path passed
Python/CLI/Pi tests but was not selected by the native model in either arm.

Three controls pass with unchanged state: ordinary teaching, Bayesian subject
vocabulary, and an explicit memory question. The held-out parameterization answer
is mathematically correct, properly attributes the demonstrator's card, preserves
the earlier assisted observation, and leaves both tasks unfinished. It nevertheless
adds a truthful self-report observation about the convention misunderstanding and
rewords the pending checkpoint. Those changes fail the frozen no-extra-observation
and unchanged-task controls. They are unnecessary bookkeeping, not fabricated
performance, task completion or lost mathematical continuity.

Retrieval efficiency remains imperfect. Recall cases inspect lab sources after
already receiving the complete requested notation entry. One recall per arm saves
a supported but unnecessary lab-notation entry. Candidate authority 2 duplicates
the same supported rule in course context and knowledge. These are retained in the
evidence rather than scored as source-fidelity failures.

Detailed evidence: [baseline semantic review](learning-ux-acceptance-2026-09-23/fidelity-baseline-semantic-review.md),
[candidate and controls](learning-ux-acceptance-2026-09-23/fidelity-candidate-semantic-review.md),
[independent held-out review](learning-ux-acceptance-2026-09-23/fidelity-heldout-review.md),
and [independent accounting](learning-ux-acceptance-2026-09-23/fidelity-accounting-review.md).
Those reports link public answers and complete synthetic state snapshots.

## Context and execution cost

| Static material | Baseline | Candidate | Change |
| --- | ---: | ---: | ---: |
| Canonical skill words | 1,122 | 1,145 | +23 |
| Live tool-description words | 805 | 843 | +38 |
| Combined instruction words | 1,927 | 1,988 | **+61**, below the 150-word budget |
| Serialized registered tool schemas, including descriptions | 11,522 bytes | 11,914 bytes | +392 bytes |

The on-demand records reference separately adds 136 words / 1,086 UTF-8 bytes.
Measurements include all five registered tools, including the quiz disabled for
headless evaluation. Skill words use whitespace splitting; descriptions are counted
recursively from registered definitions. Schema bytes are UTF-8 bytes of JSON for
each definition's name, description and parameters, loaded through Pi's extension
loader without invoking tools. Descriptions are already included in schema bytes;
these figures must not be added together or called context-window token counts.
See [static measurements](learning-ux-acceptance-2026-09-23/fidelity-context-size.json).

| Native arm | Sessions | Tool calls | Uncached input | Cache reads | Output | Total tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 15 | 116 | 146,916 | 384,000 | 12,660 | 543,576 |
| Candidate | 15 | 129 | 155,258 | 545,536 | 15,889 | 716,683 |
| Candidate controls | 4 | 30 | 52,605 | 90,752 | 2,857 | 146,214 |

Cache writes were zero. Comparison totals increased by 31.8%; uncached input by
5.7%. Each guarded native update incurred one additional save round. This is a real
tradeoff for the checkpoint, not evidence of token savings.

Median full-turn times for baseline/candidate were 43.559/51.385 seconds for
correction, 37.300/46.787 for authority, and 25.191/31.889 for recall. These are
descriptive observations, not causal estimates: stochastic tool choices, caches,
provider load and mostly baseline-before-candidate execution remain confounders.
Usage sums accumulate requests; they are neither peak context nor billed cost.
[Machine-readable counts and state diffs](learning-ux-acceptance-2026-09-23/fidelity-summary.json)
include per-case delivery timing, ranges, errors, previews and actual budget use.

## Reproduction and remaining limits

The runner defaults to preparation only. For a new, authorized comparison, use
distinct output directory names and pin each checkout explicitly:

```sh
.venv/bin/python docs/learning-ux-acceptance-2026-09-23/run_acceptance.py \
  --repo /path/to/pinned/checkout --output new-fidelity-arm \
  --model gpt-6-sol --thinking high --repeat 5 --isolated \
  --only s1-qualified-correction s7-new-authority f3-course-recall --run

.venv/bin/python docs/learning-ux-acceptance-2026-09-23/summarize_fidelity.py
```

The offline summarizer reads the three retained `fidelity-sol-*` directories and
does not assign semantic grades. Public traces exclude private reasoning and
credentials. The separate held-out JSON and expectations preserve its exact input
and frozen controls; it is no longer unseen material for future implementation.

No new native GUI interaction or other-provider parity was tested. Installation
readiness is not visual verification. These small synthetic batches do not measure
human learning gains or establish population reliability. Structural qualification
loss is now guarded; semantic weakening in free text, useful observation selection,
answer placement and unnecessary source reads remain agent judgments. In accordance
with the approved spec, the remaining failures are reported without adding more
skill prose, output filtering or repeated sampling until success.
