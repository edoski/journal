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
replacement. Learning storage separately owns locked, atomic JSON publication;
its evidence and lesson-ownership rules belong to learning. Raw files, shortcuts,
and model-generated JSON are validated on entry. Internal typed values are not
repeatedly converted back into generic mappings and validated again.

Each period synchronization reads its required dates once. Flow interruption
totals are loaded in grouped queries. Learning derives topic standings from the
observations in one pass per read. None of these require a persistent cache or
background worker.

## Learning

One workspace studies one course; its record is `.study/course.json` (schema 6).
`learning/schema.py` declares the record shapes, the handle namespace shared by
topics, knowledge, tasks and sources, whole-record validation and the single patch
rule (maps merge by handle, entries by field, `null` removes, lists replace,
observations append), rejecting unknown fields with close matches. `progress.py`
derives each topic's standing from the observations through one verdict per
counted day (learning, probe or practice day), giving levels, unaided days, lapses
and stale diagnoses, and schedules reviews on the successive-relearning ladder
within the exam window. `records.py` applies a patch to the latest record under the
record lock, schedules, validates and publishes atomically, returning a receipt
with the consequences, and refuses a save that grows pinned knowledge past its
budget; it also forgets exact items. Consumers read validated
`dict` records; the typed layer lives at the validation boundary.

`retrieval.py` builds `resume` (the session opener: time, due reviews, the path
with levels, weak topics, the open task, evidence and knowledge within byte
budgets), `show` (whole items) and `search` (accent-insensitive lexical
discovery with light stemming) on the one packer in `packing.py`. Whole items are
kept or omitted, never clipped, and omissions are reported. `planning.py` joins
reviews and open work across registered workspaces with Journal effort, the week
in review (replayed from the window start) and, near an exam, the run-up pace
from the Journal schedule.

`cli.py` is a command table: one small handler per verb with its mutation policy
declared beside it; `__main__.py` parses, selects the workspace and dispatches.
`mcp.py` is a stdlib MCP server over stdio that exposes the same verbs as typed
tools and prompts to Claude Desktop, Claude Code and Codex, running each verb as a
CLI subprocess so the CLI stays the contract. `workspace.py` owns discovery,
material links and the per-user registry; `preferences.py` merges global and
course preferences; `sources.py` scans and registers material; `storage.py`
publishes atomically under locks; `clock.py` owns the study day; `install.py` and
`readiness.py` register and check the hosts.

The canonical skill and its references own teaching workflows; host adapters
route to them rather than keeping a second pedagogical state model. Observations
are appended for actual attempts (with the help given and the result), external
results and explicit self-reports; the tutor's own explanations are not evidence.
Levels and review dates are computed, not asserted. There is no vector service,
background reflection worker or curriculum database.

## Maintenance

Run `python tools/check.py` from the project environment. Use `sync` or `learning`
as an optional argument for focused checks, and `--coverage` when coverage detail
is useful. Ruff, strict mypy, import contracts and Python tests cover the
maintained code. The sync check also verifies rendering fixtures
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
per-user registry maps that directory back, and discovery follows a link only when
no nearer marker exists and both directions still agree. The registry lists every
workspace so planning and search can span courses. `learning/study.py` owns
the short user command (`init`, `link`, `unlink`); `__main__.py` is the canonical
agent CLI. The MCP server resolves a course per tool call from its argument, the
server's working directory or the registry.
