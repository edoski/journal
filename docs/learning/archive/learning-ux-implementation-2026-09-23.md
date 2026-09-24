# Integrated learning revision

The complete [implementation spec](learning-ux-spec-2026-09-22.md) covers the
original investigation, including the extensions beyond the four-part TLDR.
Implementation starts from `5e1e389f32839c7cc74cf0938c9c005e266153d3` in Journal,
which owns the shared learning skill linked into other workspaces.

The implementation and engineering review are complete. Native behavioral
acceptance remains mixed: important memory/continuation boundaries improved,
but the configured model still sometimes rewrites unrelated knowledge wording,
narrates evidence classification and needs parameter-error recovery. These
remaining model behaviours are recorded rather than represented as solved.

## Coverage

| Required outcome | Implementation |
| --- | --- |
| Faithful memory | Field patches preserve omitted knowledge qualifications, attribution, conflicts and references. Explicit clearing remains possible. Observation identities survive selective erasure. |
| Clear agent operations | Usable native schemas, revision/digest receipts, distinct validation/conflict/interruption handling, quiet management tools and exact array selectors. |
| Relevant bounded context | Compact course/task briefing, bounded complete evidence groups, ranked knowledge, direct prerequisite context, explicit omissions and exact expansion. Alias/token discovery supports deliberate cross-course connections. |
| Natural presentation | Direct subject-focused teaching, ordinary chat checks, default terminal streaming, localized optional quiz controls, protected learner annotations and readable publication failures. |
| Learning workflows | Canonical guidance for explanations, hints, faded examples, independent attempts, delayed retrieval, concept-preserving transfer, oral/mock exams, time budgets and native image/handwriting/code feedback. |
| Source and memory lifecycle | On-demand local fingerprints, inspection, previewed selective forgetting, separate artifact/backup deletion, portable no-save mode and temporary private Pi startup. |
| Host readiness and trust | Read-only host checks, installation preflight, copied-instruction drift detection, imported-content trust boundaries and removal of ordinary direct edit/write tools. |
| Evidence | Focused boundary tests, full repository gate, independent Standards/Spec review, repeated synthetic native sessions and a separate actual UI observation. |

The Python core and local JSON records remain the canonical owners. There is no
new database, embedding service, background reflection process, numeric mastery
model or required dashboard. Teaching workflows are agent guidance where a new
state model would add no useful guarantee.

## Validation and correction record

The first integrated full gate passed 827 Python tests, 31 Pi adapter tests,
Ruff, strict mypy, all ten import contracts and unchanged rendering snapshots.
A subsequent schema-parity correction increased the adapter suite to 32 tests.

[Native run 1](learning-ux-acceptance-2026-09-23/run-1/semantic-review.md) exposed
semantic failures despite those checks: source uncertainty was overwritten,
unrelated notation was rewritten, a completed task remained pending and a
transfer question changed the concept being tested. It also exposed unnecessary
tool retries. The failed traces remain intact. Guidance and native schemas were
revised around those general failure modes, including preserving each unresolved
qualification, exact scope discovery, canonical task closure and source reuse.

The independent code review is pinned to the base above and the initial integrated
commit `13d5f32`. Each review axis remains separate below; native-model judgments
are additional evidence, not substitutes for either axis.

### Standards

The initial review found two concrete violations: ordinary saves could invent
helper-owned source fingerprints, and forgetting previews were not bound to their
target course/root. No material code-smell findings were reported. A further
installation preflight edge involving an invalid archive destination was retained
as an actionable robustness correction.

All three were corrected. Independent re-review at `975e0ca` reported **zero
actionable Standards findings**. Reproductions now reject without changing the
wrong record or making partial installation changes. Legitimate source capture,
matching metadata round-trips and correctly targeted removal still pass.

### Spec

The initial review found that readiness omitted configured asset and native-session
destinations, so it could report ready before launch failed on an invalid path.
No additional missing implementation outcomes or scope creep were reported.

That defect was fixed. A later guidance review caught an overly broad instruction
to route course facts into knowledge; it now preserves the established ownership
of `exam`, `coverage` and `course_context`. Final bounded Spec re-review at
`038f540` reported **zero actionable findings**. Native behavior is assessed
separately from these code/guidance reviews.

### Final checks and native observations

The complete repository gate passed **838 Python tests and 32 Pi adapter tests**,
Ruff, strict mypy, ten import contracts and unchanged weekly/monthly/yearly
snapshots. Subsequent production changes affect two guidance files only; their
ownership correction received the final review above.

[Run 2](learning-ux-acceptance-2026-09-23/run-2/semantic-review.md) exercised six
repeated cases plus a new source-authority case on fresh state at `975e0ca`.
It corrected task closure and source references, preserved actual assisted
performance, honoured portable no-save and applied a narrowly supported new
examination-aid rule. It still exposed unnecessary context-event duplication and
unsupported source-identity wording.

[Run 3](learning-ux-acceptance-2026-09-23/run-3/semantic-review.md) exercised a
fresh targeted three-case subset at `d74bbd7`: source correction, explicitly
specified concept transfer and new authoritative evidence. It preserved the
undated-source ambiguity without a duplicate learner observation, produced a
one-bit/two-level transfer question and resolved only the supported aid permission.
It also rewrote an unrelated notation entry, reintroduced a short classification
sentence and recovered from invalid parameter combinations. There is no claim
of a clean end-to-end behavioral pass or guaranteed semantic fidelity.

The original transfer test referred to the “same idea” in a fresh conversation
after unsaved/private turns without identifying that idea in portable state.
Its narrow-target verdict was therefore inconclusive, not a demonstrated memory
failure. The clarified test names the target concept explicitly. Reports preserve
the original prompts, outputs, failed runs and evaluator correction.

All 16 native sessions used the existing Pi `gpt-5.5` default and synthetic
records. Metrics distinguish uncached input, cached input, output and accumulated
usage across model calls. Source manifests pin each run. The final `038f540`
ownership clarification was reviewed, not rerun through the model; it does not
change runtime code. These observations do not imply behavior on other models.

[Actual Obsidian UI checks](learning-ux-acceptance-2026-09-23/ui-observation.md)
verified math rendering, an annotation entered through the editor, preservation
after publication and note reopening. Fresh-vault title/language/edit-mode
limitations are recorded there. Computer Use explicitly blocked Ghostty access,
so actual Pi streaming and quiz UI were not exercised; their deterministic
adapter checks remain distinct evidence.

### Installed integration

Ran the preflighted learning installer after code review. It refreshed the managed
Codex instruction block and launch artifacts with backups. Final readiness is
`ready: true`, with no issues across the local Codex, Claude-link and Pi checks.
An aggregate hash over the three existing portable record/preference files was
identical before and after installation. Personal learner records were never
test fixtures. Existing unrelated macOS edits remain outside these commits.

## Practical limits

Local atomic writes, locks and snapshot digests cannot coordinate simultaneous
offline machines through iCloud. Source fingerprints establish byte identity,
not authority. Schema validation cannot establish that a model's prose is true
or preserves every qualification; the native acceptance cases deliberately check
that separate boundary.

Portable records, learning artifacts and provider/native histories have separate
lifecycles. Mid-session no-save stops future canonical publication but does not
erase history. Private Pi startup uses disposable local state and disables its
saved session; provider retention and terminal scrollback remain outside it.
Bash is retained for supported source/runtime tasks, so this is not a filesystem
sandbox.

Native observations are bounded examples, not a universal success rate or proof
of improved human learning. Delayed retention, actual examination performance
and equivalent behaviour on every provider remain unmeasured. The exact GUI
observations and unavailable checks are documented separately.
