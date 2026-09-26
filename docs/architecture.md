# Journal architecture

Journal has two feature packages. `sync` renders journal notes and runs session,
media, and grade commands. `learning` owns study memory, lesson publication,
retrieval, and teaching-client integrations. Both belong to the same project;
neither needs a generic application framework.

Learning reads recorded study activity and schedules through
`sync.study.context.journal_summary`. That read-only interface owns knowledge of
the journal's Markdown schema. Learning does not access the Flow database.
`sync.study.repository.FlowSessionRepository` owns Flow persistence and
transactions; session enrichment remains pure study-domain logic.

Within sync, readers parse external Markdown into contracts, metrics calculate
results, and writers render typed chart/table specifications. Application
services coordinate external sources and note publication. The CLI parses first
and constructs the integrations needed by the selected command. Small protocols
remain where they isolate real filesystem, database, and status inputs.

Note publication owns locking, conflict detection, no-op comparison, and atomic
replacement. Learning storage separately owns revision-checked JSON publication;
its evidence and lesson-ownership rules belong to learning. Raw files, shortcuts,
and model-generated JSON are validated on entry. Internal typed values are not
repeatedly converted back into generic mappings and validated again.

Each period synchronization reads its required dates once. Flow interruption
totals are loaded in grouped queries. Learning retrieval indexes observation
counts and traverses correction relationships directly. None of these require a
persistent cache or background worker.

## Learning

`learning/schema.py` declares the record shapes (`Source`, `Observation`,
`Knowledge`, `Task`, `Route`), the single handle rule, and one validator and one
patch function per type. `records.py` composes them into whole-record
normalization, scope resolution (a handle, or an unambiguous course title or
alias), and revision-checked publication with snapshot digests and the
qualification guard on knowledge edits. Consumers read validated `dict` records;
the typed layer lives at the validation boundary.

`retrieval.py` implements five read verbs on `packing.py`, the one byte-budget
packer: `resume` (task, briefing, linked and recent evidence, relevant knowledge),
`catalog` (handles only), `search` (lexical discovery with candidates), `knowledge`
(whole entries or a paged index) and `evidence` (topic histories or exact
observations with correction groups). Whole items are kept or omitted, never
clipped, and every omission is listed under `selection`. `briefing.py` projects
course orientation and the position on the scope-level `route`; the selected task
is returned once, beside it, not inside it. Budgets are serialized UTF-8 bytes.

`cli.py` is a command table: one small handler per verb with its mutation policy
declared beside it; `__main__.py` parses, selects the workspace, applies the
no-save policy and dispatches. `pi.ts` maps three quiet Pi tools onto the same
verbs. `sources.py` scans, registers and fingerprints local material. `memory.py`
owns inspection and previewed forgetting. `planning.py` joins reviews, unfinished
work and Journal effort. `lessons.py` and `visuals.py` publish artifacts through
`storage.py`. `workspace.py` and `workspace_import.py` own directory workspaces.

The canonical skill and its references own teaching workflows; host adapters
route to them rather than keeping a second pedagogical state model. Observations
are appended for actual attempts (default origin `direct_attempt`); what the
learner reports or the tutor infers is kept as knowledge or task context.
There is no vector service, background reflection worker, curriculum database
or numerical mastery model.

## Maintenance

Run `python tools/check.py` from the project environment. Use `sync` or `learning`
as an optional argument for focused checks, and `--coverage` when coverage detail
is useful. Ruff, strict mypy, import contracts, Python tests, and the Pi adapter
tests cover the maintained code. The sync check also verifies rendering fixtures
without rewriting them.

Rendering fixtures are a compatibility contract, not refactoring targets. Changes
to architecture must preserve note text, whitespace, charts, tables, `sync` CLI
behavior, and stored learning records. Keep tests for observable behavior,
external-input errors, transactions, and concurrent publication. Avoid tests that
merely assert which private helper called another.

### Study workspace ownership

The learning engine is installed once; each initialized course/project directory
owns `.study`. `learning/workspace.py` resolves explicit selection or the nearest
ancestor, validates the versioned marker, and derives local output paths. There is
no global state fallback or inherited parent workspace. A workspace may instead
study linked material elsewhere: its manifest names the material directory and the
per-user index maps that directory back, and discovery follows a link only when no
nearer marker exists and both directions still agree. `learning/study.py` owns
the short user command; `__main__.py` is the canonical agent CLI. Pi pins the
selected workspace across tool calls and stores its conversations there. Private
launches use a temporary workspace with read-only access to the original sources.
`workspace_import.py` validates an explicit one-scope copy into an empty workspace,
rebasing paths and selecting applicable preferences without deleting originals.
