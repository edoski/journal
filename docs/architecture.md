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

Learning also retains optional agent-authored `knowledge` entries in the same
schema-5 record. Their prose carries reusable understanding and uncertainty;
observations retain learner evidence, tasks retain continuation, and preferences
retain current teaching policy. Completing a task does not delete knowledge.
`records.py` validates complete-entry replacement/removal and source/topic links
under the existing revision-checked atomic publication. It captures source
versions without certifying their truth or detecting file-content changes.

`retrieval.py` owns bounded whole-entry selection, focused reads, and paged literal
search across knowledge and existing metadata. Ordinary context and single-scope
planning use a 4,096-byte default knowledge allowance; multi-scope planning exposes
counts. The allowance counts serialized UTF-8 payload and newly introduced source
locations, not model tokens or the entire response. Exact reads default to 8,192
bytes and return complete entries or an actionable size error. Context and scoped
planning accept deliberate budget overrides; no source text or note is clipped
to make a whole-entry read fit. Discovery/index pages have separate 4,096-byte
bounds. Python owns these semantics; CLI and Pi expose the same existing tools.

The tutor chooses useful organization and corrects relevant understanding during
normal study. Retrieval treats knowledge as evidence, never instructions. No
curriculum model, vector service, background reflection process or parallel
knowledge store is introduced. More stored knowledge does not require loading it
all, but once loaded its context cost depends on the native host's subsequent
requests and compaction.

## Maintenance

Run `python tools/check.py` from the project environment. Use `sync` or `learning`
as an optional argument for focused checks, and `--coverage` when coverage detail
is useful. Ruff, strict mypy, import contracts, Python tests, and the Pi adapter
tests cover the maintained code. The sync check also verifies rendering fixtures
without rewriting them.

Rendering fixtures are a compatibility contract, not refactoring targets. Changes
to architecture must preserve note text, whitespace, charts, tables, CLI behavior,
and stored learning records. Keep tests for observable behavior, external-input
errors, transactions, and concurrent publication. Avoid tests that merely assert
which private helper called another.
