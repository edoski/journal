# Repository Guidelines

This repository syncs Flow app focus data into an Obsidian journal and builds daily/weekly/monthly/yearly metrics.

## Project Structure

```text
journal/
  sync/
    __init__.py

    config.py                  # Centralized path/env configuration
    constants.py               # Shared non-I/O constants
    dates.py                   # Date/period math
    formatting.py              # Formatting + percent helpers
    io.py                      # Safe file I/O
    log.py                     # Logger helper

    contracts/                 # Pure typed contracts (no I/O)
      study.py
      sleep.py
      status.py
      schedule.py
      metrics.py
      media.py
      grades.py
      cache.py
      notes.py

    ports/                     # Stable Protocol interfaces
      sessions.py
      status.py
      schedule.py
      notes.py
      daily_aggregates.py
      media.py

    adapters/                  # Concrete external integrations
      json_cache_common.py     # Shared validated JSON cache base classes
      flow_sessions.py
      icloud_status.py
      markdown_notes.py
      markdown_daily_aggregates.py
      markdown_schedule.py
      obsidian_media.py

    application/               # Orchestration over ports/contracts
      daily_sync_service.py
      period_sync_service.py

    readers/                   # Markdown parsing (markdown -> contracts)
      schedule.py
      media.py
    writers/                   # Rendering (contracts -> markdown)
      __init__.py
      charts/                  # Unified chart API (typed specs + renderers)
        api.py                 # render_chart(spec) -> list[str]
        specs.py
        profiles.py
        layout.py
        formatters.py
        renderers/
      tables/                  # Unified markdown table API (typed specs + renderers)
        api.py                 # render_table(spec) -> list[str]
        specs.py
        layout.py
        renderers/

    daily/
      __main__.py              # Daily composition root
      constants.py
      sleep.py
      training.py
      orchestrator/
        frontmatter.py
        note_io.py

    study/
      __main__.py              # Study CLI composition root
      constants.py
      labels.py
      breaks.py
      core_data_time.py
      repository.py
      enrichment.py
      section.py

    metrics/
      aggregation.py
      trends.py

    notes/
      locking.py
      markdown.py
      markdown_tables.py       # Shared markdown table parse/render helpers
      sections.py

    periods/
      __init__.py
      builders/                # Period-specific metric builders + shared helpers
        common.py
        weekly.py
        monthly.py
        yearly.py
      windows.py
      presentation.py
      runtime.py
      sections.py
      cleanup.py

    run/
      __main__.py              # Unified runtime composition root
      parser.py                # CLI parser wiring
      runtime_deps.py          # Runtime dependency container
      wiring.py                # Runtime DI wiring + period runners
      commands/                # Command domain handlers
        media_common.py
        media_books.py
        media_podcast.py
        media.py               # Small command hub/re-export surface

  tests/
    sync/
    fixtures/

  AGENTS.md
```

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

Run this standard gate before every commit:

```bash
source .venv/bin/activate
tox -e check
```

Equivalent expanded commands:

```bash
source .venv/bin/activate
ruff check .
ruff format --check .
pyright
mypy sync/ --strict
vulture sync/ --min-confidence 80
lint-imports --config .importlinter
deptry . --pep621-dev-dependency-groups dev --package-module-name-map tox=tox,mutmut=mutmut,pip-audit=pip_audit
python3 -m pytest tests/ -o addopts="-q --tb=short --cov=sync --cov-branch --cov-report="
```

Extended strict gate (security + mutation):

```bash
source .venv/bin/activate
tox -e extended
```

`tox -e extended` is mutation-strict. It fails when `mutmut results` reports any
non-killed status (`survived`, `no tests`, `timeout`, or other non-killed
states).
`extended` runs `mutmut` with `--max-children 1` to reduce false timeout noise
from parallel worker contention.

Literal everything gate (check + extended):

```bash
source .venv/bin/activate
tox -e all
```

Recommended run protocol:

1. Inner loop while editing:
```bash
source .venv/bin/activate
tox -e check
```
2. Before every commit:
```bash
source .venv/bin/activate
tox -e check
```
3. Before large refactors or release-ready changes:
```bash
source .venv/bin/activate
tox -e all
```

When debugging a failing test or coverage regression, rerun with verbose reporting:

```bash
source .venv/bin/activate
python3 -m pytest tests/ -v --tb=short --cov=sync --cov-branch --cov-report=term-missing:skip-covered
```

## Testing Guidance

Validate:

- idempotency: repeated sync runs produce stable output.
- period rendering snapshots: strict line-for-line invariance against deterministic fixture generators; regenerate via `python tools/regenerate_baselines.py` when changes are intentional.
- parsing edge cases: open sessions, malformed shortcut payloads, missing files.
- period historical flags (`--date`, `--month`, `--year`).
- architecture-layer test taxonomy under `tests/sync/`:
  - `architecture/`, `adapters/`, `application/`, `readers/`, `writers/`,
    `domain/`, `integration/`, `snapshots/`

## Configuration and Paths

Central path/env resolution lives in `sync/config.py` (`PATHS`).

Primary env overrides:

- `JOURNAL_DIR`, `VAULT_DIR`, `BOOKS_DIR`, `PODCASTS_DIR`
- `DAILY_TEMPLATE_PATH`, `WEEKLY_TEMPLATE_PATH`, `MONTHLY_TEMPLATE_PATH`, `YEARLY_TEMPLATE_PATH`
- `SCHEDULE_PATH`, `BSC_GRADES_PATH`, `MSC_GRADES_PATH`, `JOURNAL_CACHE_DIR`, `LOCK_DIR`, `NOTE_LOCK_DIR`, `STATE_LOCK_DIR`
- `MEDIA_CACHE_DIR`, `DAILY_CACHE_DIR`
- `TRAINING_CACHE_DIR`
- `FLOW_DB_PATH`, `ICLOUD_SHORTCUTS_DIR`, `ICLOUD_JOURNALSYNC_DIR`

## Runtime Configuration

Path resolution precedence:

1. Process env vars from the invoking shell (interactive terminal runs).
2. Defaults in `sync/config.py` (home/vault-derived fallbacks).

Operational guidance:

- Keep LaunchAgents minimal and route scheduled jobs through `python -m sync.run`.
- Use shell profile exports only for terminal convenience; do not rely on them for launchd jobs.
- Keep env var names stable and explicit; avoid embedding machine-specific repo paths in code.
- `sync.run session skip` is session-first: it no-ops unless Flow is currently in `Flow` phase and the latest Flow DB row is an open flow session.
- `sync.run session remind` is session-first: it no-ops unless Flow is currently in `Flow` phase and the latest Flow DB row is an open flow session.
- Logging is stderr-only; no app-level log file sink is used.
- Launchd writes logs to `/tmp` and the application does not truncate them.

Move checklist (repo relocation):

- Move repo to new location and recreate `.venv` in the new root.
- Update both LaunchAgent `ProgramArguments`/`WorkingDirectory` paths.
- Reload both LaunchAgents with `launchctl unload/load`.

## Data and Cache Files

- media cache: `~/.cache/journal/media/dates.json`
- flow reminder state cache: `~/.cache/journal/flow_reminder_state.json`
- shortcut status pending cache: `~/.cache/journal/daily/status/pending/`
- shortcut status invalid cache: `~/.cache/journal/daily/status/invalid/`
- training cache: `~/.cache/journal/daily/training/YYYY-MM-DD.json`
- note locks: `~/.cache/journal/locks/notes/<shard>/<sha1>.lock`
- state locks: `~/.cache/journal/locks/state/<shard>/<sha1>.lock`

## LaunchAgents

- Journal sync: `~/Library/LaunchAgents/com.edo.journalsync.plist`
- Skip automation: `~/Library/LaunchAgents/com.edo.skip.plist`
- Remind automation: `~/Library/LaunchAgents/com.edo.remind.plist`

Reload:

```bash
launchctl unload ~/Library/LaunchAgents/com.edo.journalsync.plist
launchctl load ~/Library/LaunchAgents/com.edo.journalsync.plist

launchctl unload ~/Library/LaunchAgents/com.edo.skip.plist
launchctl load ~/Library/LaunchAgents/com.edo.skip.plist

launchctl unload ~/Library/LaunchAgents/com.edo.remind.plist
launchctl load ~/Library/LaunchAgents/com.edo.remind.plist
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
