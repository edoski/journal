# Architecture Cleanup Execution Ledger

Status: approved and in progress

This is the authoritative implementation and review ledger for the cleanup run. The user approved every listed slice in advance and requested continuous execution on main. Product work advances only after the preceding slice receives an independent zero-finding review.

## Run state

- Baseline: ff0b3a80e96562eaf20d32172fb77f8cf10dba6b
- Checkout: /Users/edo/dev/python/journal
- Branch: main
- Remote state at start: main equals origin/main
- Publication: local commits only; no push or pull request is authorized
- Live systems: do not access or mutate the real Flow database, Obsidian vault, iCloud data, caches, launch agents, or scheduled jobs
- Ledger lifecycle: remove this temporary file after all slices and final gates pass

## Approved decisions

1. Keep final Markdown rendering byte-for-byte compatible with the current notes.
2. Keep periodic TRAINING output exactly as currently rendered: TIME, ACTIVITY, DURATION, INTERRUPT, with one dominant averaged time range per activity.
3. Move Flow connection lifecycle and SQL mutations behind the canonical study repository boundary. Rename and undo must operate on every source primary key represented by a merged session.
4. Use the canonical escaped-pipe Markdown table parser for podcast series row comparison.
5. Expose period-ready media items instead of making period rendering interpret standalone-versus-series storage details.
6. Make readers parse-only: callers own file reads and external-path error context.
7. Centralize locked, compare-before-write note publication so callers cannot split read, lock, and write lifecycles.
8. Replace parallel training aggregate maps with a cohesive typed occurrence model without changing calculations, ordering, or Markdown.
9. Use clean breaks only. Add no legacy shims or architectural transition tests.
10. Do not expand this run into unrelated large-module splitting or generic framework creation.

## Verification policy

- Standard gate: source .venv/bin/activate && tox -e check
- Rendering gate: python tools/regenerate_baselines.py --check
- Final strict gate: source .venv/bin/activate && tox -e all
- Focused tests accompany each slice.
- Rendering snapshots must remain unchanged unless the protected contract explicitly says otherwise; this run authorizes no rendering changes.
- The pre-run standard gate passed with 553 tests.
- The pre-run rendering gate reported weekly, monthly, and yearly fixtures unchanged.
- A pre-run mutation run was interrupted when the user replaced the worktree strategy with direct work on main; it had already exposed existing surviving mutants and is not a green baseline claim.

## Slice ledger

| Slice | Baseline | Status | Implementer | Reviewer | Result |
| --- | --- | --- | --- | --- | --- |
| S1 Flow operations | ff0b3a80 | pending | pending | pending | pending |
| S2 Markdown row semantics | pending | pending | pending | pending | pending |
| S3 Period-ready media items | pending | pending | pending | pending | pending |
| S4 Parse-only readers | pending | pending | pending | pending | pending |
| S5 Locked note publication | pending | pending | pending | pending | pending |
| S6 Training occurrences | pending | pending | pending | pending | pending |

## S1: Flow operation ownership

Expected outcome: session lookup, rename, undo, skip, and reminder operations use one repository-owned SQLite lifecycle, and a merged session is mutated as one logical session across all of its source rows.

Scope:

- Move remaining Flow SQL and connection ownership from command and automation modules into sync/study/repository.py.
- Preserve pure dedupe, break, lunch, and overrun logic in sync/study/enrichment.py.
- Preserve all source primary keys when adapting enriched sessions for CLI operations.
- Rename and undo every represented source row atomically.
- Keep confirmation, output, skip, reminder, and no-op behavior unchanged.
- Add focused repository and command tests for multi-primary-key sessions and transaction behavior.

Non-goals:

- No Flow schema migration.
- No live database access.
- No redesign of enrichment rules or CLI text.

Checks:

- Focused study, repository, automation, and session-command tests.
- Standard gate.

## S2: Canonical Markdown row semantics

Expected outcome: podcast series index regeneration compares logical Markdown cells correctly, including escaped pipes, through the single canonical table parser.

Scope:

- Remove manual pipe splitting from the media adapter.
- Reuse sync/notes/markdown_tables.py for row parsing and normalization.
- Keep generated index Markdown, watch order, frontmatter, visibility, and idempotency unchanged.
- Add focused escaped-pipe and unchanged-index tests.

Non-goals:

- No new Markdown dialect.
- No visible podcast schema change.

Checks:

- Focused Markdown-table and media-adapter tests.
- Standard and rendering gates.

## S3: Period-ready media items

Expected outcome: period builders consume one normalized media item contract and no longer interpret podcast storage topology.

Scope:

- Replace separate period-facing book, podcast, and series collections with a cohesive immutable item representation containing only period rendering needs.
- Normalize standalone and series podcast behavior at the media source boundary.
- Remove unused period-facing media fields made obsolete by the new contract.
- Preserve title, date, kind, ordering, filtering, visibility, and Markdown exactly.

Non-goals:

- Do not split ObsidianMediaSource solely by file size.
- Do not change book or podcast note schemas.
- Do not alter series index regeneration behavior established by S2.

Checks:

- Focused media contract, adapter, application, and period tests.
- Standard and rendering gates.

## S4: Parse-only readers

Expected outcome: reader modules transform supplied text into contracts and perform no filesystem I/O.

Scope:

- Change daily, schedule, and grades readers to accept in-memory lines or text.
- Move safe file reads and path-specific error context to adapters or composition callers.
- Extend architecture enforcement so reader imports of sync.io are forbidden.
- Preserve parser validation messages where they describe malformed content; keep useful path context at raw I/O boundaries.

Non-goals:

- No ports for pure parsers.
- No compatibility overloads that accept both paths and text.
- No schema changes.

Checks:

- Focused reader, caller, and architecture tests.
- Standard and rendering gates.

## S5: Locked note publication

Expected outcome: note updates use one owner for lock acquisition, current-content read, equality check, atomic write, and trailing-newline behavior.

Scope:

- Deepen the note persistence boundary with a compact update or publish operation.
- Migrate application, period, command, and media index callers that currently assemble lifecycle pieces.
- Ensure series-index generation and date healing cannot overwrite concurrent frontmatter edits because they read outside the note lock.
- Preserve no-op writes, atomic publication, lock sharding, and exact Markdown.

Non-goals:

- No broad filesystem abstraction.
- No live vault writes.
- No process-wide transaction framework.

Checks:

- Focused note-store, concurrency, adapter, and application tests.
- Standard and rendering gates.

## S6: Cohesive training occurrences

Expected outcome: training aggregation carries aligned duration and time data as typed occurrences instead of six parallel maps, while current calculations and note rendering stay identical.

Scope:

- Introduce a cohesive typed training occurrence representation at the metrics contract boundary.
- Migrate aggregation, reduction, and period presentation to use it.
- Remove obsolete parallel duration, start, and end mappings.
- Correct repository documentation to describe the actual protected periodic TRAINING schema.
- Preserve activity ordering, session counts, duration averages, interrupt values, dominant averaged time range, rounding, and exact Markdown.

Non-goals:

- No multi-range rendering.
- No training schema or cache migration.
- No change to daily TRAINING validation.

Checks:

- Focused metrics, period builder, contract, and snapshot tests.
- Standard and rendering gates.

## Completion gates

- Every slice has a committed implementation and an independent GREEN LIGHT with zero actionable findings.
- Final source .venv/bin/activate && tox -e all completes successfully.
- Final python tools/regenerate_baselines.py --check reports all fixtures unchanged.
- This ledger is removed in the final cleanup commit.
- main is clean and no extra worktree or branch remains.
- Nothing is pushed.
