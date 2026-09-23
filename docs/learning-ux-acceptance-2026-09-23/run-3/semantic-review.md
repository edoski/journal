# Final targeted native review — run 3

**Behavioral acceptance is not fully green.** The targeted memory-boundary fixes,
explicit transfer question and evidence-based uncertainty resolution work in this
sample. The tutor still unnecessarily rewrites a separate notation entry, changes
its qualification/provenance, and exposes an evidence-classification sentence.
Two invalid retrieval combinations also require recovery. These residual failures
are recorded rather than hidden by the passing software gate.

This is a **three-case subset**, not another full seven-case run. It uses a fresh
synthetic fixture at frozen commit
`d74bbd7ab6d1cccae78bb095606fce8873761e2e`, Pi 0.85.1 and the unchanged
`openai-codex`/`gpt-5.5` configuration. Source hashes remained stable. The cases,
in order, were the repeated qualified correction, a clarified one-bit transfer
request, and the previously successful newly supplied-source resolution. The last
case was unseen during the first implementation revision; by this run it is a
repeat, not a newly held-out sample.

| Boundary | Observed result |
| --- | --- |
| Resource qualification | The resource entry preserves the learner-report basis and the undated-file conflict without identifying either undated file as old. |
| Course facts versus learning evidence | No observations are added for the resource correction; all actual pre-existing learner evidence remains unchanged. |
| Unrelated knowledge | The bench entry survives exactly, but the separate notation entry is rewritten. |
| Visible teaching | Subject explanation is relevant, but the correction answer ends with administrative evidence classification. |
| Explicit transfer target | One unanswered temperature-sensor question preserves the requested one-bit/two-level concept in a different setting. |
| New-source resolution | The answer and saved entry retain the exact limited formula-sheet permission and leave calculator rules unknown; source is registered and obsolete uncertainty explicitly cleared. |
| Scope isolation | Numerical Methods is unchanged during Signals work; Signals is unchanged during the Numerical Methods source update. |
| Unanswered practice | Asking the transfer question produces no new observation or portable-state change. |
| Tool efficiency | Two knowledge-index reads incorrectly include an evidence budget; both recover, with no failed saves. |

## Residual failures

The original notation entry says “The lecturer writes g for impulse response;
Atlas writes h,” with explicit learner-report attribution and no independent
slide verification. The correction concerns which laboratory resources reflect
the current convention, not the g/h correspondence. Yet the tutor replaces this
separate entry with a broader paragraph, changes Atlas “writes h” to “may use h,”
and attributes it to “Learner-reported lecturer clarification plus the course
files' stated conventions.” The newly reported clarification was not about the
Atlas symbol, and the inspected lab files do not verify Atlas notation. The g/h
content remains, but the remembered assertion's confidence and provenance change
without a corresponding new basis. This is a semantic-fidelity failure, not just
a byte-equality complaint.

The answer also ends:

> This is a convention/source correction, not evidence that you’ve learnt the maths.

It is a short acknowledgment of the learner's concern, but it still violates the
intended study-only presentation by exposing internal evidence classification.
Run 2 omitted such narration; this recurrence shows that instructions alone do
not guarantee quiet model prose.

Evidence: [correction answer](s1-qualified-correction.answer.md),
[correction state](s1-qualified-correction.state.json),
[exact correction trace](s1-qualified-correction.public-trace.jsonl).

## Successful targeted outcomes

The explicit question is:

> Suppose a sensor stores each temperature reading using one bit before sending it
> to a display. Why can the display have only two possible output levels, even if
> the real temperature varies continuously?

It preserves the target and withholds the answer. Unlike the original ambiguous
fresh-session case, it does not rely on remembering material intentionally left
unsaved or private. This is evidence of target alignment for one generated
question, not evidence that a learner can answer it or retain the concept.

The new-source case permits exactly one A5 sheet, handwritten on one side, with
formulas but no worked derivations or solutions. It explicitly leaves calculators
unspecified. The save registers `oral-notice`, links it to the current aid entry,
and sets the obsolete `uncertainty` field to null. No unrelated attempts or tasks
change. Null fields are preserved in this run's public traces; the capture bug
from earlier runs was fixed before launch.

Evidence: [transfer answer](s8-explicit-transfer.answer.md),
[authority answer](s7-new-authority.answer.md),
[final state](s7-new-authority.state.json).

The [27 structural subset checks](checks.json) pass 24 and fail 3: all three
failures detect the single notation rewrite carried across the snapshots. The
semantic analysis above explains why the rewrite matters. Other earlier cases
such as task closure and private-source isolation were not rerun here; their
latest observations remain the seven-case run at `975e0ca`.

## Measurements and limits

| Case | First public text delta (s) | Complete turn (s) | Calls | Errors | Uncached input | Cache read | Output |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Qualified correction | 33.635 | 40.830 | 9 | 1 | 16,913 | 27,648 | 1,369 |
| Explicit transfer | 18.547 | 24.916 | 9 | 1 | 6,602 | 24,576 | 731 |
| New authority | 21.996 | 26.377 | 7 | 0 | 13,339 | 17,408 | 657 |

Total: **92.123 seconds**, **25 calls**, **2 recovered retrieval errors**. Provider
totals are 36,854 uncached input, 69,632 cache-read, zero cache-write and 2,757
output tokens, totaling 109,243 over every model round. No matched performance
improvement claim follows from these samples. Timing measures first model text
delta and process completion, not first useful explanation or actual GUI delivery.

The tested source version is stated above; later documentation-only ownership
clarifications are not retroactively covered by these native results. No further
native runs or prompt-tuning loop followed this subset. Deterministic interface
tests and code review do not erase the observed model-level fidelity/UX failures.
Human retention, examination performance, multimodal learning and other hosts
remain outside this native test.
