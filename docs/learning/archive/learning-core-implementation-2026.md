# Learning core implementation — 19 September 2026

Implemented the recommended core changes from [the assessment](learning-core-audit-2026.md). The canonical [README](../../../learning/README.md) and [record contract](../../../learning/skills/learn/references/records.md) describe the maintained system. This document records delivery and verification, not a claim of measured learning efficacy.

## Delivered

| Area | Result |
| --- | --- |
| Learner representation | Schema 4 separates immutable observations from evidence-backed topic assessments. Assessment and review freshness is computed from the full evidence snapshot, including corrections to relevant observations outside the immediate topic. |
| Atomic writes | Local aliases let observations, supporting assessments/reviews and task progression publish in one revision-checked patch. Existing observation metadata is not rewritten by new aliases. |
| Provenance | New observations receive recording timestamps. Known event dates remain separate; unknown origins/times remain unknown. Response, assistance, uncertainty and provenance fields are validated. |
| Source identity | Observations capture source versions. Cited source editions cannot be silently changed in place; file moves preserve identity, and new editions use new handles. |
| Planning | Plans expose assessment freshness, supporting/correcting observations, assistance, known dates and relevant sources. Unassessed topics also retain their evidence. Reviews require an actionable task, reason and evidence. |
| Preferences | Explicit values reject inferred replacements. Applicability derives from active teaching topics in the same scope snapshot, separately from background evidence. Topic deletion and preference writes share lifecycle locking and reject dangling references. |
| Discovery | Corrupt scopes are reported individually; healthy scopes remain discoverable. Direct access to corrupt records still fails explicitly. |
| Pi | Empty branches clear existing owned lesson projections; empty startup creates no lesson. Named metadata and unowned notes remain protected. Parameter descriptions explain exact task/topic handles following an observed native recovery. |
| Teaching contract | Source text does not become learner policy through storage. Corrections must revisit affected assessments/task assumptions; pending assessments are reconsidered when a decision needs them, without a routine reflection stage. |
| Maintenance | Added a runnable learning quality gate, honest coverage/type-check documentation, and historical markers on superseded design notes. |

## Migration and installation

The actual schema-3 scope was previewed, backed up and converted to schema 4 under the shared record lock. Its revision advanced once, from 15 to 16. All thirteen observations, historical wording/provenance, task checkpoints, source paths and prior assessment/review wording were independently checked against the original bytes. Six existing assessments and two reviews are pending because migration does not invent supporting evidence.

Preference bytes and all six files under the session-note directory remained unchanged. The migration backup contains exact originals and SHA-256 checksums under `learn/backups/schema3-to4-20260919T123333Z-d2cb8831/`. A second apply was verified to be a no-op. Backup scope files are namespaced beneath `state/` so valid course handles such as `preferences` or `manifest` cannot collide with backup metadata.

Existing Codex/Claude skill links resolve to this repository's canonical skill. The installed skill command successfully retrieved schema-4 context with matching scope/policy-selection revisions and produced planning context containing all thirteen observations and pending decisions. The existing unrelated `sync/config.py` changes were preserved byte-for-byte. No personal learner records or backups were added to the repository.

## Verification

- Learning gate: **122 Python tests**, strict mypy for all sixteen learning modules, Ruff lint/format, and **13 Pi adapter tests** passed.
- Full repository: **711 Python tests** passed. Repository-wide Ruff lint/format, configured Pyright, strict mypy for `sync`, and all seven import contracts passed.
- Pi verification includes actual persisted SessionManager compaction, restart and branch reconstruction, alongside ownership and publication-failure checks.
- Independent core and integration reviewers found issues during development; fixes were rechecked with isolated probes. No outstanding findings remained in their assigned scopes.
- Three real native runs, **Codex → Pi → fresh Codex**, passed sixteen independent acceptance checks. They exercised exact task continuation, assisted performance, correction attribution, durable versus temporary preferences, one hostile worksheet, and no unnecessary writes during clarification. [Public results and artifacts](learning-native-acceptance-results.md).

Claude Code was installed but unauthenticated, so no Claude behavioral run was performed. The one synthetic adversarial example does not establish general injection resistance. No longitudinal learning-outcome study was performed. Passing these cases is evidence about these versions and scenarios, not a general reliability percentage.

## Decisions on advanced and conditional additions

[The advanced-options investigation](learning-advanced-memory-options-2026.md) evaluates the capabilities independently of the current architecture. Semantic retrieval, curriculum graphs, automated curation and numeric prediction all have plausible value, but no added service or model dependency was justified by the observed cases.

The most promising separate experiment is hybrid lexical/semantic retrieval over course materials, evaluated independently from learner-memory retrieval. The existing prerequisite/concept structure and new assessment-support relationships provide useful graph semantics without a second store. On-demand evidence-backed reassessment is supported now; a separate unattended curator would require evidence that its semantic mutations improve later decisions. Numeric predictions require a defined future outcome and chronological calibration before presentation as learner ability.

Deferred: embedding/vector infrastructure, a global inferred concept graph, an unattended curator, numeric mastery estimates, operation-ID replay, generated mutation schemas, response-size budgets, forgetting workflows and multi-device coordination. Their triggers and acceptance criteria remain documented. The native Pi handle mistake justified a smaller interface clarification immediately; it did not justify duplicating the Python validator or adding a schema service.

No new runtime dependencies, provider credentials, background services or recurring model jobs were introduced.
