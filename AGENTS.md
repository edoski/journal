# Repository Guidelines

This repository syncs Flow app focus data into an Obsidian journal and builds daily/weekly/monthly/quarterly/yearly metrics with goal carry-forward and reconciliation.

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
      training.py
      screen_time.py
      status.py
      reminders.py
      deviation.py
      schedule.py
      metrics.py
      query.py
      goals.py
      media.py
      notes.py

    ports/                     # Stable Protocol interfaces
      sessions.py
      status.py
      schedule.py
      notes.py
      daily_aggregates.py
      goals.py
      reminders.py
      media.py
      context.py

    adapters/                  # Concrete external integrations
      flow_sessions.py
      icloud_status.py
      markdown_notes.py
      markdown_daily_aggregates.py
      markdown_goals.py
      markdown_reminders.py
      markdown_schedule.py
      obsidian_media.py
      vault_context.py

    application/               # Orchestration over ports/contracts
      daily_sync_service.py
      goal_sync_service.py
      period_sync_service.py
      query_service.py

    readers/                   # Markdown parsing (markdown -> contracts)
      schedule.py
    writers/                   # Rendering (contracts -> markdown)
      __init__.py
      goals.py
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
      context.py
      icloud.py
      screen_time.py
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
      db.py
      section.py

    goals/
      daily_pipeline.py        # Daily goal orchestration helpers (domain-owned)
      identity.py
      reminder_codec.py        # Reminder schedule parse/format codecs
      tombstones.py
      carry_forward.py
      state.py
      reconcile.py
      note_store.py
      period_pipeline.py
      reminders.py

    metrics/
      loading.py
      aggregation.py
      trends.py
      screen_time.py

    notes/
      locking.py
      markdown.py
      markdown_tables.py       # Shared markdown table parse/render helpers
      sections.py

    periods/
      __init__.py
      engine.py                # Period metrics facade (delegates to builders)
      builders/                # Period-specific metric builders + shared helpers
      windows.py
      runtime.py
      sections.py
      cleanup.py
      weekly/                  # Package
      monthly/                 # Package
      quarterly/               # Package
      yearly/                  # Package

    run/
      __main__.py              # Unified runtime composition root
      parser.py                # CLI parser wiring
      wiring.py                # Runtime DI wiring + period runners
      commands/                # Command domain handlers

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
- `sync/goals` must not import `sync/adapters`.
- No cross-module private (`_name`) imports in `sync/`.

### Rendering architecture

- Charts are rendered only via `sync/writers/charts/api.py::render_chart(spec)`.
- Markdown tables are rendered only via `sync/writers/tables/api.py::render_table(spec)`.
- Markdown table parsing/row escaping is centralized in `sync/notes/markdown_tables.py`.
- Chart/table specs should expose one canonical field type per value slot; normalize richer domain payloads at call sites instead of widening spec fields with unions.
- Do not reintroduce legacy one-off chart/table helpers or compatibility shims.

## Canonical Services and Interfaces

### Application services

- `DailySyncService`: builds and writes daily note metrics/frontmatter, delegates goal orchestration to `GoalSyncService`.
- `GoalSyncService`: canonical goal orchestration for daily + period notes (carry-forward, mirror/source reconciliation, piercing, source propagation) using explicit target dates from inputs (no wall-clock coupling).
- `PeriodSyncService`: period orchestration for weekly/monthly/quarterly/yearly notes, delegates goal flows to `GoalSyncService`, renders metrics through `sync/periods/engine.py`.
  - `sync/periods/engine.py` is a facade; period-specific rendering logic lives in `sync/periods/builders/`.
  - media scanning is injected through `MediaSource` and passed into the period renderer as `MediaBundle`.
- `QueryService`: period-window query/shift/bounds + metric snapshot service used by CLI and application consumers.
  - snapshot contract: `PeriodSnapshot` from `sync/contracts/query.py` (single canonical definition).

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
  - `load_screen_time(day) -> DailyScreenTimeData | None`
  - `write_study_times(day, sessions, day_schedule) -> None`
- `ScheduleSource.resolve_day(day) -> DayScheduleProfile`
- `NoteStore`:
  - `read(path) -> list[str] | None`
  - `read_or_create(path, template_path) -> list[str]`
  - `write(path, lines) -> None` (canonical persistence path uses `sync.io.atomic_write_note`, writes with a trailing newline)
- `DailyAggregateSource.load_for_dates(dates) -> dict[date, DailyAggregate]`
- `GoalStore`:
  - `extract(lines, section, horizon=None, period_key=None) -> list[Goal]`
  - `apply(lines, sections) -> list[str]`
  - `write(path, lines, sections) -> list[str]`
- `ReminderRuleStore.load()/save(rules)`
- `MediaSource.scan(start, end) -> MediaBundle`
- `ContextSource`:
  - `files_modified_on_date(day) -> list[VaultFileRecord]`
  - `links_for_window(files, start, end) -> list[str]`
- Metrics contracts are canonical across `sync/metrics`, `sync/application`, and `sync/periods`:
  - `DailyAggregate`, `PeriodAggregate`, `MovingAverageAggregate`, `TrainingTypeSessionStat`, `MetricValue`
- Query snapshot contract is canonical across `sync/application` and CLI consumers:
  - `PeriodSnapshot` in `sync/contracts/query.py`
- Reminder schedule parsing/formatting is canonical in:
  - `sync/goals/reminder_codec.py`
  - `sync/contracts/reminders.py` stays typed contracts only

## Canonical Markdown Schemas

- Daily `STUDY` tables are canonical only when they include:
  - `| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |`
- Legacy `STUDY` tables without `CONTEXT` are rejected with explicit errors.
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
python -m sync.run period quarterly [--quarter YYYY-Q#]
python -m sync.run period yearly [--year YYYY]
python -m sync.run grades sync [--path /abs/path/to/GRADES.md]
python -m sync.run goals add --period {daily|weekly|monthly|quarterly|yearly} [--current|--next] "goal text"
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
- goal reconciliation: source/mirror reopen+completion behavior remains correct.
- parsing edge cases: open sessions, malformed shortcut payloads, missing files.
- period historical flags (`--date`, `--month`, `--quarter`, `--year`).
- architecture-layer test taxonomy under `tests/sync/`:
  - `architecture/`, `adapters/`, `application/`, `readers/`, `writers/`,
    `domain/`, `integration/`, `snapshots/`

## Configuration and Paths

Central path/env resolution lives in `sync/config.py` (`PATHS`).

Primary env overrides:

- `JOURNAL_DIR`, `VAULT_DIR`, `BOOKS_DIR`, `PODCASTS_DIR`
- `DAILY_TEMPLATE_PATH`, `WEEKLY_TEMPLATE_PATH`, `MONTHLY_TEMPLATE_PATH`, `QUARTERLY_TEMPLATE_PATH`, `YEARLY_TEMPLATE_PATH`
- `REMINDERS_PATH`, `SCHEDULE_PATH`, `GRADES_PATH`, `JOURNAL_CACHE_DIR`, `LOCK_DIR`, `NOTE_LOCK_DIR`, `STATE_LOCK_DIR`
- `GOAL_CACHE_DIR`, `MEDIA_CACHE_DIR`, `DAILY_CACHE_DIR`
- `TRAINING_CACHE_DIR`, `SCREEN_TIME_CACHE_DIR`
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

- carried-goals cache: `~/.cache/journal/goals/carry_forward.json`
- goal-sync state cache: `~/.cache/journal/goals/reconcile_state.json`
- media cache: `~/.cache/journal/media/dates.json`
- flow reminder state cache: `~/.cache/journal/flow_reminder_state.json`
- training cache: `~/.cache/journal/daily/training/YYYY-MM-DD.json`
- screen-time cache: `~/.cache/journal/daily/screen_time/YYYY-MM-DD.json`
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
