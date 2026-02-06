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
    io.py                      # Safe file/json I/O
    logging.py                 # Logger helper

    contracts/                 # Pure typed contracts (no I/O)
      study.py
      daily.py
      metrics.py
      goals.py
      media.py
      notes.py

    ports/                     # Stable Protocol interfaces
      sessions.py
      status.py
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
      obsidian_media.py
      vault_context.py

    application/               # Orchestration over ports/contracts
      daily_sync_service.py
      goal_sync_service.py
      period_sync_service.py
      query_service.py

    models/                    # Dataclasses and domain payloads
    readers/                   # Markdown parsing (markdown -> models/contracts)
    writers/                   # Rendering (models/contracts -> markdown)

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
      constants.py
      labels.py
      breaks.py
      db.py
      section.py

    goals/
      daily_pipeline.py        # Daily goal orchestration helpers (domain-owned)
      identity.py
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
      comparison.py

    notes/
      locking.py
      markdown.py
      sections.py

    periods/
      __init__.py
      engine.py                # Shared period metrics renderer
      windows.py
      runtime.py
      sections.py
      cleanup.py
      weekly.py                # Composition root
      monthly.py               # Composition root
      quarterly.py             # Composition root
      yearly.py                # Composition root

  tui/
    __main__.py
    app.py                     # TUI composition root
    cli.py                     # CLI composition root
    state.py
    keymap.py
    data/
      daily_store.py
      reminders_store.py
      repository.py            # Thin delegate over QueryService
    views/

  tests/
    sync/
    tui/
    fixtures/

  sync_all.sh
  AGENTS.md
```

## Architecture Rules

### Layering

- `contracts`: typed payloads only, no I/O.
- `ports`: `Protocol` interfaces consumed by application services.
- `adapters`: concrete implementations of ports.
- `application`: orchestration only; depends on `ports` + `contracts`, never on adapter internals.
- composition roots wire implementations:
  - `sync/daily/__main__.py`
  - `sync/periods/weekly.py`
  - `sync/periods/monthly.py`
  - `sync/periods/quarterly.py`
  - `sync/periods/yearly.py`
  - `tui/app.py`
  - `tui/cli.py`

### Dependency constraints

- `sync/application` must not import `sync/adapters`.
- `sync/writers` must not import `sync/ports` or `sync/adapters`.
- Non-composition modules must not import `sync/application` or `sync/adapters`.
- No cross-module private (`_name`) imports in `sync/`.

## Canonical Services and Interfaces

### Application services

- `DailySyncService`: builds and writes daily note metrics/frontmatter, delegates goal orchestration to `GoalSyncService`.
- `GoalSyncService`: canonical goal orchestration for daily + period notes (carry-forward, mirror/source reconciliation, piercing, source propagation) using explicit target dates from inputs (no wall-clock coupling).
- `PeriodSyncService`: period orchestration for weekly/monthly/quarterly/yearly notes, delegates goal flows to `GoalSyncService`, renders metrics through `sync/periods/engine.py`.
  - media scanning is injected through `MediaSource` and passed into the period renderer as `MediaBundle`.
- `QueryService`: period-window query/shift/bounds + metric snapshot service used by TUI.

### Ports

- `StudySessionSource.load_sessions(day) -> list[StudySessionRecord]`
- `DailyStatusSource`:
  - `load_training(day) -> TrainingStatusBundle`
  - `load_sleep(day) -> SleepStatusPayload | None` (canonical keys only: `date`, `start`, `end`, `sleep_min`, `awake_min`, `awake_count`)
  - `load_screen_time(day) -> DailyScreenTimeData | None`
  - `write_study_times(day, sessions) -> None`
- `NoteStore`:
  - `read(path) -> list[str] | None`
  - `read_or_create(path, template_path) -> list[str]`
  - `write(path, lines) -> None`
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

## Canonical Markdown Schemas

- Daily `STUDY` tables are canonical only when they include:
  - `| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |`
- Legacy `STUDY` tables without `CONTEXT` are rejected with explicit errors.

## Data Flow

- parsing path: `markdown -> readers -> contracts/models`
- rendering path: `contracts/models -> writers -> markdown`
- orchestration path: `composition root -> application service -> ports -> adapters`

## Run Commands

Requires Python 3.10+ and project venv.

```bash
source .venv/bin/activate
```

### Sync entrypoints

```bash
./sync_all.sh
python -m sync.daily
python -m sync.periods.weekly [--date YYYY-MM-DD]
python -m sync.periods.monthly [--month YYYY-MM]
python -m sync.periods.quarterly [--quarter YYYY-Q#]
python -m sync.periods.yearly [--year YYYY]
```

### TUI/CLI

```bash
python3 -m tui
python3 -m tui.cli session-preview [-n COUNT] [--all-phases]
python3 -m tui.cli rename-session "Title" [--confirm]
python3 -m tui.cli undo-last-session [--confirm]
python3 -m tui.cli skip-now
python3 -m tui.cli skip-toggle [on|off]
```

## Quality Gate

Run this full gate before every commit:

```bash
source .venv/bin/activate
ruff check .
ruff format --check .
mypy sync/ --ignore-missing-imports
vulture sync/ --min-confidence 80
python3 -m pytest tests/ -v
```

## Testing Guidance

Validate:

- idempotency: repeated sync runs produce stable output.
- period rendering snapshots: line-for-line invariance unless intentionally changed.
- goal reconciliation: source/mirror reopen+completion behavior remains correct.
- parsing edge cases: open sessions, malformed shortcut payloads, missing files.
- period historical flags (`--date`, `--month`, `--quarter`, `--year`).

## Configuration and Paths

Central path/env resolution lives in `sync/config.py` (`PATHS`).

Primary env overrides:

- `JOURNAL_DIR`, `VAULT_DIR`, `BOOKS_DIR`, `PODCASTS_DIR`
- `DAILY_TEMPLATE_PATH`, `WEEKLY_TEMPLATE_PATH`, `MONTHLY_TEMPLATE_PATH`, `QUARTERLY_TEMPLATE_PATH`, `YEARLY_TEMPLATE_PATH`
- `REMINDERS_PATH`, `LOCK_DIR`
- `CARRIED_GOALS_PATH`, `GOAL_SYNC_STATE_PATH`, `MEDIA_CACHE_PATH`
- `TRAINING_CACHE_PATH`, `SCREEN_TIME_CACHE_PATH`
- `FLOW_DB_PATH`, `ICLOUD_SHORTCUTS_DIR`, `ICLOUD_JOURNALSYNC_DIR`

## Data and Cache Files

- carried-goals cache: `~/.cache/journal/carried_goals.json`
- goal-sync state cache: `~/.cache/journal/goal_sync_state.json`
- media cache: `~/.cache/journal/media_dates.json`
- training cache: `~/.cache/journal/training_entries.json`
- screen-time cache: `~/.cache/journal/screen_time_entries.json`

## LaunchAgents

- Journal sync: `~/Library/LaunchAgents/com.edo.journalsync.plist`
- Flow skip automation: `~/Library/LaunchAgents/com.edo.flow-skip.plist`

Reload:

```bash
launchctl unload ~/Library/LaunchAgents/com.edo.journalsync.plist
launchctl load ~/Library/LaunchAgents/com.edo.journalsync.plist

launchctl unload ~/Library/LaunchAgents/com.edo.flow-skip.plist
launchctl load ~/Library/LaunchAgents/com.edo.flow-skip.plist
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
