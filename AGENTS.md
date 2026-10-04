# Repository Guidelines

This repository syncs Flow app focus data into an Obsidian journal and builds daily/weekly/monthly/yearly metrics.

## Project Structure

- `sync/`: daily and periodic notes, Flow sessions, media, and grades.
  - `contracts/`: typed data; `ports/`: external integration protocols.
  - `readers/`, `metrics/`, `writers/`: parse, calculate, render.
  - `application/`: daily and period orchestration.
  - `adapters/`: filesystem, status, and media integrations.
  - `study/`: Flow persistence, session enrichment, read-only study context.
  - `daily/`, `periods/`: note composition and period-specific presentation.
  - `notes/`: Markdown operations and note locking.
  - `run/`: CLI parsing, direct dispatch, and integration construction.
- `learning/`: study workspaces, records, retrieval, preferences, planning, notes, and the MCP server.
- `tests/`: behavior, external integrations, and rendering fixtures.
- `tools/check.py`: full or package-focused quality checks.
- `macos/Journal/`: native app and bundled sync runtime.

See [docs/architecture.md](docs/architecture.md) for module ownership and the
learning integration. Existing `sync` command lines and rendered notes are
compatibility requirements; the learning agent CLI is an internal interface owned
by the skill and adapter, and internal Python helpers do not need compatibility
aliases.

## Architecture Rules

### Layering

- `contracts`: typed payloads only, no I/O.
- `ports`: `Protocol` interfaces consumed by application services.
- `adapters`: concrete implementations of ports.
- `application`: orchestration only; depends on `ports` + `contracts`, never on adapter internals.
- composition roots wire implementations:
  - `sync/run/*` (entrypoint in `sync/run/__main__.py`)

### Dependency constraints

- `sync/application` must not import `sync/adapters`.
- `sync/writers` must not import `sync/ports` or `sync/adapters`.
- Non-composition modules outside `sync/run/*` must not import `sync/application` or `sync/adapters`.
- `sync/readers` must stay parse-only (no `sync/application`, `sync/adapters`, `sync/writers`, or `sync/run` imports).
- `sync/periods` must not import `sync/run`.
- No cross-module private (`_name`) imports in `sync/`.
- `sync` must not import `learning`.
- Learning reads journal activity and schedules through
  `sync.study.context.journal_summary`; it does not import other sync internals.
- Learning record shapes, validation and the patch rule belong to
  `learning/schema.py`; derived standings and review scheduling to
  `learning/progress.py`; publication and receipts to `learning/records.py`;
  `resume`/`show`/`search` to `learning/retrieval.py` on the single packer in
  `learning/packing.py`; the CLI verb table to `learning/cli.py`.

### Rendering architecture

- Charts are rendered only via `sync/writers/charts/api.py::render_chart(spec)`.
- Markdown tables are rendered only via `sync/writers/tables/api.py::render_table(spec)`.
- Markdown table parsing/row escaping is centralized in `sync/notes/markdown_tables.py`.
- Chart/table specs should expose one canonical field type per value slot; normalize richer domain payloads at call sites instead of widening spec fields with unions.
- Vertical bar charts are geometry-driven: placement of value labels, in-chart labels, and overflow/top rows must be derived from shared bar/anchor geometry rather than metric-specific special cases.
- Every vertical-chart row above the axis is a chart-area row and must start with the chart y-axis glyph at column 0, including any overflow/top annotation rows.
- Additional vertical-chart top rows are data-driven and should be emitted only when the current labels/values require them; avoid fixed extra headroom rows and metric-specific hacks.
- Do not reintroduce legacy one-off chart/table helpers or compatibility shims.

## Canonical Services and Interfaces

### Application services

- `DailySyncService`: builds and writes daily note metrics/frontmatter.
- `PeriodSyncService`: period orchestration for weekly/monthly/yearly notes.
  - period-specific rendering logic lives in `sync/periods/builders/`.
  - media scanning is injected through `MediaSource` and passed into the period renderer as `MediaBundle`.

### Canonical rendering entrypoints

- `render_chart(spec) -> list[str]` in `sync/writers/charts/api.py`
- `render_table(spec) -> list[str]` in `sync/writers/tables/api.py`
- Chart/table behavior is configured through typed specs; avoid ad-hoc markdown string-concatenation paths.

### Ports

- `StudySessionSource.load_sessions(day, day_schedule) -> list[StudySessionRecord]`
- `DailyStatusSource`:
  - `target_days(anchor_day) -> tuple[date, ...]`
  - `load_training(day) -> TrainingStatus`
  - `load_sleep(day) -> SleepPayload | None` (canonical keys only: `date`, `start`, `end`, `sleep_min`, `awake_min`, `awake_count`)
- `ScheduleSource.resolve_day(day) -> DayScheduleProfile`
- `NoteStore`:
  - `read_or_create(path, template_path) -> list[str]`
  - `publish(path, lines, expected=...) -> NotePublication`
  - `update(path, updater, template_path=...) -> NotePublication`
  - publication owns note locks, compare/no-op behavior, atomic replacement,
    directory creation, and the canonical trailing newline
- `DailyAggregateSource.load_for_dates(dates) -> dict[date, DailyAggregate]`
- `MediaSource.scan(start, end) -> MediaBundle`
  - `MediaBundle.items` contains immutable period-ready `MediaItem` rows; period
    rendering does not interpret podcast storage topology
- `FlowSessionRepository` owns Flow connection lifecycle, session SQL,
  stale-row repair, and transactions. `FlowStudySessionSource` delegates
  persistence to it and owns session enrichment; pure dedupe/break/lunch/overrun
  logic remains in `sync/study/enrichment.py`.
- Metrics contracts are canonical across `sync/metrics`, `sync/application`, and `sync/periods`:
  - `DailyAggregate`, `TrainingOccurrence`, `PeriodAggregate`, `MovingAverageAggregate`, `TrainingTypeSessionStat`, `MetricValue`
  - `DailyAggregate.training_occurrences` stores complete immutable sessions for training-type duration, interrupt, and schedule aggregation
- Year sync windows must carry explicit execution anchors:
  - `YearWindow.target_date`

## Canonical Markdown Schemas

- Daily `STUDY` tables are canonical only when they include:
  - `| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |`
- Daily `TRAINING` rows with a positive `DURATION` are canonical only when `TIME` is `HH:MM - HH:MM` (24-hour); non-canonical values are rejected with explicit errors.
- Periodic `TRAINING` type summary tables are canonical only when they include:
  - `| TIME | ACTIVITY | DURATION | INTERRUPT |`
  - one row per activity type, with one dominant averaged `HH:MM - HH:MM` range
- Periodic `MEDIA` tables are canonical only when they include:
  - `| TYPE | AUTHOR | TITLE | DATE |`
  - `AUTHOR` is a book note's `author`, a podcast note's `host`, or, for a series,
    its index note's `host` falling back to the latest in-range episode's; media
    without one renders a blank cell
  - rows are sorted globally by `DATE`, intermixing books and podcasts
- `notes/podcasts/` entries render in periodic `MEDIA` tables only when:
  - a note directly in the directory sets `visible: true`; it renders as its own entry
  - a subdirectory is a series: it renders as one entry titled after the folder, dated
    by its latest episode inside the period window
  - a series is represented by its `<folder>/<folder>.md` index note, whose
    `visible: true` opts the whole series in exactly as a standalone podcast note does
    for itself; episodes' own `visible` properties are ignored inside a series
  - the index note's episode table is regenerated on every scan from all its episodes
    in watch order, so only its frontmatter may be hand-edited; a series without an
    index note gets a hidden one (`visible: false`) written on the next scan
- `PROTOCOL.md` `## SCHEDULE` is canonical only when it includes:
  - `| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |`
  - required `DEFAULT` row with full values
  - optional `WEEKDAY:...` and `DATE:YYYY-MM-DD` override rows
  - `OFF` is allowed only as `STUDY_START=OFF` and `STUDY_END=OFF` on non-`DEFAULT` rows
  - `OFF` rows must leave `LUNCH_START`, `LUNCH_END`, and `WORKOUT_START` blank

## Data Flow

- parsing path: `markdown -> readers -> contracts`
- rendering path: `contracts -> writers -> markdown`
- orchestration path: `composition root -> application service -> ports -> adapters`

## Run Commands

Requires Python 3.10+ and project venv.

```bash
source .venv/bin/activate
```

### Sync entrypoints

```bash
python -m sync.run period all
python -m sync.run period daily
python -m sync.run period weekly [--date YYYY-MM-DD] [--no-cleanup]
python -m sync.run period monthly [--month YYYY-MM] [--no-cleanup]
python -m sync.run period yearly [--year YYYY]
python -m sync.run grades sync <bsc|msc>
python -m sync.run media book annotations import /abs/path/to/export.html --note /abs/path/to/book.md
```

### Snapshot baseline fixtures

```bash
python tools/regenerate_baselines.py
python tools/regenerate_baselines.py --check
python tools/regenerate_baselines.py --only weekly_metrics.txt --only yearly_metrics.txt
```

### Study CLI

```bash
python3 -m sync.run session rename "Title" [--confirm]
python3 -m sync.run session undo [--confirm]
python3 -m sync.run session skip [--state toggle|status]
python3 -m sync.run session remind [--state toggle|status]
```

## Quality Gate

Run the full gate for changes spanning packages, or the focused gate for one:

```bash
source .venv/bin/activate
python tools/check.py
python tools/check.py sync
python tools/check.py learning
```

The gate runs Ruff lint/format checks, strict mypy, import-linter, and Python
behavior tests. Sync checks also verify unchanged rendering fixtures.

Add `--coverage` when coverage diagnostics are useful. For failure detail, run
`python -m pytest tests/ -v --tb=short`. These deterministic checks establish code
behavior, not teaching efficacy; native-host acceptance is documented in
`docs/learning/behavioral-acceptance.md`.

## Testing Guidance

Validate:

- idempotency: repeated sync runs produce stable output.
- period rendering snapshots: strict line-for-line invariance against deterministic fixture generators; regenerate via `python tools/regenerate_baselines.py` when changes are intentional.
- parsing edge cases: open sessions, malformed shortcut payloads, missing files.
- period historical flags (`--date`, `--month`, `--year`).
- architecture-layer test taxonomy under `tests/sync/`:
  - `adapters/`, `application/`, `readers/`, `writers/`,
    `domain/`, `integration/`, `snapshots/`

## Configuration and Paths

Central path/env resolution lives in `sync/config.py` (`PATHS`).

Primary env overrides:

- `JOURNAL_DIR`, `VAULT_DIR`, `BOOKS_DIR`, `PODCASTS_DIR`
- `DAILY_TEMPLATE_PATH`, `WEEKLY_TEMPLATE_PATH`, `MONTHLY_TEMPLATE_PATH`, `YEARLY_TEMPLATE_PATH`
- `SCHEDULE_PATH`, `BSC_GRADES_PATH`, `MSC_GRADES_PATH`
- `JOURNAL_SUPPORT_DIR`, `JOURNAL_STATE_DIR`, `DAILY_STATE_DIR`, `TRAINING_STATE_DIR`
- `MEDIA_CACHE_DIR`, `LOCK_DIR`
- `FLOW_DB_PATH`, `ICLOUD_SHORTCUTS_DIR`, `ICLOUD_JOURNALSYNC_DIR`

## Runtime Configuration

Path resolution precedence:

1. Process env vars from the invoking shell (interactive terminal runs).
2. Defaults in `sync/config.py` (home/vault-derived fallbacks).

Operational guidance:

- Keep LaunchAgents minimal. They invoke `Journal.app --run`, which runs the
  bundled `python -m sync.run`.
- Use shell profile exports only for terminal convenience; do not rely on them for launchd jobs.
- Keep env var names explicit; use clean breaks when storage semantics change.
- `sync.run session skip` is session-first: it no-ops unless Flow is currently in `Flow` phase and the latest Flow DB row is an open flow session.
- `sync.run session remind` is session-first: it no-ops unless Flow is currently in `Flow` phase and the latest Flow DB row is an open flow session.
- Logging is stderr-only; no app-level log file sink is used.
- Launchd writes logs to `/tmp` and the application does not truncate them.

Repository relocation:

- Recreate `.venv` in the new root and re-run `python -m learning.install` (MCP server entries and skill links).
- Build and install the native bundle with `macos/Journal/build.sh --install`.
- LaunchAgents keep using `/Applications/Journal.app`; source edits alone do not
  update their bundled Python code.

The configured `tools/hooks/post-commit` hook rebuilds and installs the app after
commits touching `sync/` or `macos/`. Run the quality gate before such commits.

## Data and Cache Files

- media cache: `~/Library/Caches/Journal/media/dates.json`
- learning workspace registry and links: `~/Library/Application Support/Learning/workspaces.json`
- learning global preferences: `~/Library/Application Support/Learning/preferences.json`
- flow reminder state: `~/Library/Application Support/Journal/state/flow_reminder_state.json`
- shortcut pending state: `~/Library/Application Support/Journal/state/daily/status/pending/`
- shortcut invalid diagnostics: `~/Library/Application Support/Journal/state/daily/status/invalid/` (30-day retention)
- training state: `~/Library/Application Support/Journal/state/daily/training/YYYY-MM-DD.json` (14-day retention)
- locks: `~/Library/Application Support/Journal/locks/<shard>/<sha1>.lock` (stable lock files; do not prune by age)

## LaunchAgents

- Journal sync: `~/Library/LaunchAgents/com.edo.journal.sync.plist`
- Skip automation: `~/Library/LaunchAgents/com.edo.journal.skip.plist`
- Remind automation: `~/Library/LaunchAgents/com.edo.journal.remind.plist`

Reload:

```bash
launchctl unload ~/Library/LaunchAgents/com.edo.journal.sync.plist
launchctl load ~/Library/LaunchAgents/com.edo.journal.sync.plist

launchctl unload ~/Library/LaunchAgents/com.edo.journal.skip.plist
launchctl load ~/Library/LaunchAgents/com.edo.journal.skip.plist

launchctl unload ~/Library/LaunchAgents/com.edo.journal.remind.plist
launchctl load ~/Library/LaunchAgents/com.edo.journal.remind.plist
```

## Coding Conventions

- 4-space indentation, snake_case functions, UPPER_SNAKE constants.
- Private helpers prefixed with `_`.
- Prefer small pure helpers over large monolith functions.
- Keep stdlib-only unless explicitly changed by repository policy.
- Preserve deterministic rendering and idempotent sync behavior.

## Security and Safety

- Never commit personal journal content.
- Treat Flow DB as read-mostly; write operations must be intentional and minimal.
- Use file locks for note writes.
- Avoid destructive git commands (`reset --hard`, checkout of unknown changes).
