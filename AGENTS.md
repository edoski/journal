# Repository Guidelines

This repository hosts automation scripts that sync daily focus data from the Flow macOS app into an Obsidian vault, generate weekly, monthly, quarterly, and yearly aggregated metrics, and carry forward incomplete Goals between days.

## Project Structure & Data Flow

```
journal/
  sync/                       # Unified sync package with layered architecture
    __init__.py               # Package entry point
    models/                   # Dataclass models (Goal, Book, Podcast, StudySession, etc.)
    readers/                  # Parsing functions and shared reader helpers
      common.py               # Reader parsing helpers (duration parsing + shared markdown wrappers)
      daily.py                # Daily note aggregate parser (canonical metrics parser)
      frontmatter.py          # YAML frontmatter parsing
      goals.py                # Goal parsing, deadline handling, proximity filtering
      media.py                # Book/Podcast scanners
      sleep.py                # Sleep-table parser
      study.py                # Study-table parser
      screen_time.py          # Procrastination-table parser
    writers/                  # Rendering functions (render_goal_lines, charts, tables)
    daily/                    # Daily note orchestration (run with: python -m sync.daily)
      orchestrator/           # Orchestrator package (runner + focused pipelines)
        __init__.py           # Re-exports update_markdown
        runner.py             # Main update_markdown orchestration
        frontmatter.py        # YAML frontmatter update logic
        note_io.py            # Daily note read/create + core section guards
        goal_pipeline.py      # Daily goals synchronization/reconciliation pipeline
        metrics_pipeline.py   # Metrics section build/splice pipeline
      training.py             # Training/workout/stretch handling
      sleep.py                # Sleep section building
      context.py              # Context tracking for CONTEXT column
      goals.py                # Daily/weekly goal carry-forward and note updates
      icloud.py               # Resilient iCloud status file loading
      screen_time.py          # Screen time data loading and PROCRASTINATION section
      constants.py            # Daily-specific constants
    study/                    # Study ingestion domain (Flow DB + breaks + STUDY section)
      __init__.py             # Study domain exports
      constants.py            # Flow integration constants + break window config
      labels.py               # Activity label normalization constants
      db.py                   # Flow database access + session deduplication/enrichment
      breaks.py               # Break linking + overrun calculations
      section.py              # STUDY table extraction/building
    periods/                  # Weekly/monthly/quarterly/yearly sync entrypoints + helpers
      __init__.py             # Period package marker
      windows.py              # Typed period-window builders (current/previous/prior bounds)
      runtime.py              # Shared period runtime helpers (path/lock/write/cleanup)
      weekly.py               # Weekly metrics aggregation
      monthly.py              # Monthly metrics aggregation
      quarterly.py            # Quarterly metrics aggregation
      yearly.py               # Yearly metrics aggregation
      sections.py             # Shared periodic section assembly helpers
      cleanup.py              # Shared cleanup re-sync helper for prior periods
      media.py                # MEDIA section orchestration (reader scan + writer render)
    goals/                    # Goal domain logic (identity, carry-forward, reconcile, note I/O, reminders)
      __init__.py             # Goal domain public exports
      identity.py             # Goal canonicalization + deterministic/random IDs
      tombstones.py           # Carry-forward offered-ID cache + deleted-goal tombstones
      carry_forward.py        # Shared carry-forward/tombstone suppression engine
      state.py                # Bidirectional source/mirror goal state reconciliation cache
      reconcile.py            # Goal piercing + mirror/source reconciliation helpers
      note_store.py           # Canonical Goals-section read/write helpers for notes
      period_pipeline.py      # Shared period-goal orchestration pipeline
      reminders.py            # Periodic review and maintenance reminder generation
    constants.py              # Shared constants (paths, thresholds, dimensions)
    dates.py                  # Date range + period-shift calculations
    formatting.py             # Value parsing and formatting
    metrics/                  # Period metrics package (loading, aggregation, comparison)
      __init__.py             # Public metrics API exports
      loading.py              # Daily-note loading and prior-period metrics helpers
      aggregation.py          # Period aggregation + grouped totals helpers
      comparison.py           # Moving averages, deltas, percentage regrouping
    notes/                    # Note infrastructure (locking + markdown/section helpers)
      __init__.py             # Notes package exports
      locking.py              # File-locking primitives
      markdown.py             # Shared header normalization + section block extraction
      sections.py             # Markdown section extraction/manipulation
    io.py                     # Low-level file I/O utilities (safe_read_file, atomic_write_note, JSON cache helpers)
    logging.py                # Logging utilities
  tui/                        # Interactive terminal UI + CLI utilities
    __main__.py               # Runs full-screen curses app (`python -m tui`)
    app.py                    # App loop and key handling
    cli.py                    # Non-interactive commands (`python -m tui.cli ...`)
    state.py                  # Shared UI state model
    keymap.py                 # Key mapping helpers
    data/                     # Query + edit stores
    views/                    # Screen renderers
  sync_all.sh             # Wrapper script that runs all syncs
  AGENTS.md               # This file
  tests/                  # Pytest suite split by domain
    sync/                 # Sync package tests and architecture guards
    tui/                  # TUI package tests
    fixtures/             # Shared render baselines
  __pycache__/            # Generated Python bytecode; safe to ignore
```

### Scripts Overview

- **`sync/`**: Unified sync package with layered architecture:
  - **`models/`**: Dataclass models (Goal, Book, Podcast, StudySession, ScreenTimeEntry, etc.)
  - **`readers/`**: Parsing functions and shared parsing helpers (`common.py`, `daily.py`)
  - **`writers/`**: Rendering functions that convert models to markdown
  - **`daily/`**: Daily note orchestration (run with `python -m sync.daily`)
  - **`study/`**: Study ingestion package (Flow DB access, break logic, STUDY section rendering)
  - **`goals/`**: Goal domain package (identity, carry-forward, reconciliation, canonical note I/O, period-goal pipeline, reminders)
  - **`periods/`**: Weekly/monthly/quarterly/yearly sync modules + shared period helpers

- **`sync/periods/weekly.py`**: Aggregates daily notes into weekly metrics with bar charts, training grids + training type table (`TYPE | SESSIONS | AVERAGE`), and procrastination trend tables. Includes **Summary Table** with 4-week moving averages and **IDEALS Progress** tracking.

- **`sync/periods/monthly.py`**: Aggregates daily notes into monthly metrics with weekly breakdowns. Includes **Summary Table** with 3-month moving averages.

- **`sync/periods/quarterly.py`**: Aggregates daily notes into quarterly metrics with month-level breakdowns. Includes **Summary Table** with 4-quarter moving averages.

- **`sync/periods/yearly.py`**: Aggregates daily notes into yearly metrics with quarter-level breakdowns. Includes **Summary Table** with 3-year moving averages.

- **`sync_all.sh`**: Wrapper script that runs daily, weekly, monthly, quarterly, and yearly syncs in sequence.

- **`tui/`**: Terminal UI and CLI utilities:
  - `python3 -m tui`: Full-screen interactive TUI (query by period/metric + source editing)
  - `python3 -m tui.cli session-preview [-n COUNT] [--all-phases]`: View session stats
  - `python3 -m tui.cli rename-session "Title" [--confirm]`: Rename most recent focus session
  - `python3 -m tui.cli undo-last-session [--confirm]`: Delete most recent focus session (+ break)
  - `python3 -m tui.cli skip-now`: Execute skip automation immediately (uses config)
  - `python3 -m tui.cli skip-toggle [on|off]`: Toggle skip automation state

### Linting & Testing

First, activate the virtual environment (required for `pytest` and `ruff`):
```bash
source .venv/bin/activate
```

Then run linting and tests using `python3`:
```bash
# Linting
ruff check .              # Check for issues
ruff check . --fix        # Auto-fix what's possible
ruff format .             # Format all files

# Type checking
mypy sync/ --ignore-missing-imports

# Dead code detection
vulture sync/ --min-confidence 80

# Testing
python3 -m pytest tests/ -v               # Run all tests
python3 -m pytest tests/sync/test_reminders.py -v  # Run specific sync test file
python3 -m pytest tests/sync/test_architecture_guards.py -v  # Enforce guardrails
python3 -m pytest tests/tui -v            # Run TUI tests
```

### Configuration Constants

Shared constants are in `sync/constants.py`, organized into frozen dataclasses:

**Config Dataclasses** (use `IDEAL.`, `CHART.`, `RENDER.`, `SCREEN_TIME.` singletons):
- **`IdealSchedule`** (`IDEAL`): Schedule targets — `study_start_hour`, `workout_start_hour`, `study_minutes_daily`, `sleep_minutes_nightly`, `workout_days_weekly`, `stretch_days_weekly`, `mood_target`
- **`ChartConfig`** (`CHART`): Chart dimensions — `height_default`, `height_quarterly`, `height_yearly`, `y_max_*_study`
- **`RenderConfig`** (`RENDER`): Progress bars & symbols — `progress_bar_width`, `progress_filled`, `progress_empty`, `study_symbol_*`, `study_legend`
- **`ScreenTimeConfig`** (`SCREEN_TIME`): Thresholds — `min_minutes`, `percent_threshold`, `misc_label`

**Bar Chart Presets** (in `sync/writers/charts/presets.py`):
- **`BarChartPreset`** dataclass: Encapsulates all bar chart parameters (`height`, `y_max`, `bar_width`, `col_spacing`, `label_prefix`, `axis_trim`, `left_pad`, `center_labels_on_bars`)
- **Named presets**: `WEEKLY_7DAY_CHART`, `WEEKLY_7DAY_MOOD`, `MONTHLY_WEEK_STUDY`, `MONTHLY_WEEK_METRIC`, `MONTHLY_WEEK_MOOD`, `QUARTERLY_3MONTH_STUDY`, `QUARTERLY_3MONTH_METRIC`, `QUARTERLY_3MONTH_MOOD`, `YEARLY_4QTR_STUDY`, `YEARLY_4QTR_METRIC`, `YEARLY_4QTR_MOOD`

**Other constants** (not in dataclasses):
- **Paths**: `JOURNAL_DIR`, `VAULT_DIR`, `LOCK_DIR`, template paths
- **Labels**: `DAYS`, `MONTH_ABBR`
- **Study threshold**: `STUDY_TARGET_MIN` (360 min)

Daily-specific constants are in `sync/daily/constants.py`:
- **Database**: `DB_PATH`, `CORE_DATA_EPOCH_OFFSET`
- **Break timing**: `BREAK_GAP_CAP_SECONDS`, `LUNCH_WINDOW_BASE`
- **Paths**: `TEMPLATE_PATH`, `ICLOUD_SHORTCUTS_DIR`, `TRAINING_CACHE_PATH`

## Architecture

### Layered Architecture (`sync/`)

The sync package uses a clean layered architecture with clear separation of concerns:

```
sync/
├── models/           # Dataclass definitions (no dependencies)
│   ├── goals.py      # Goal dataclass
│   ├── media.py      # Book, Podcast dataclasses
│   ├── study.py      # StudySession, DailyStudyData
│   ├── sleep.py      # SleepEntry, DailySleepData
│   ├── training.py   # TrainingEntry, DailyTrainingData
│   ├── screen_time.py # ScreenTimeEntry, DailyScreenTimeData
│   ├── deviation.py  # DailyDeviationData (schedule adherence metrics)
│   ├── daily.py      # DailyData aggregate
│   └── period.py     # PeriodMetrics
│
├── readers/          # Parsing: markdown → models
│   ├── common.py       # normalize_header, extract_block, parse_duration_to_minutes
│   ├── daily.py        # parse_daily_note (canonical aggregate parser)
│   ├── frontmatter.py  # parse_frontmatter
│   ├── goals.py        # parse_goal_tasks, resolve_deadline, filter_by_proximity
│   ├── media.py        # scan_books, scan_podcasts
│   ├── sleep.py        # parse_sleep_table
│   ├── study.py        # parse_study_table
│   └── screen_time.py  # parse_procrastination_table
│
├── writers/          # Rendering: models → markdown
│   ├── charts/         # Chart package (presets, bars, study/training grids, screen-time charts)
│   │   ├── __init__.py
│   │   ├── presets.py
│   │   ├── bar.py
│   │   ├── grid.py
│   │   ├── training.py
│   │   ├── study.py
│   │   └── screen_time.py
│   ├── tables.py       # render_summary_table, render_sleep_stats_table
│   ├── goals.py        # render_goal_lines, build_goals_block, format_countdown
│   └── media.py        # render_media_table
│
├── daily/            # Daily note orchestration
│   ├── orchestrator/
│   │   ├── __init__.py    # update_markdown re-export
│   │   ├── runner.py      # main orchestration entrypoint
│   │   ├── frontmatter.py # YAML frontmatter updates
│   │   ├── note_io.py     # note read/create + section guards
│   │   ├── goal_pipeline.py # goals synchronization pipeline
│   │   └── metrics_pipeline.py # metrics section pipeline
│   ├── training.py     # Training/workout/stretch handling
│   ├── sleep.py        # Sleep section building
│   ├── context.py      # Context tracking
│   ├── goals.py        # Goal management (carry-forward, weekly/daily parsing)
│   ├── icloud.py       # iCloud status file loading and study times export
│   └── screen_time.py  # Screen time data loading and procrastination section
│
├── study/            # Study ingestion domain
│   ├── constants.py    # Flow integration constants + break window config
│   ├── labels.py       # Activity label normalization constants
│   ├── db.py           # Flow session fetch/dedupe/enrichment
│   ├── breaks.py       # Break linking + overrun calculations
│   └── section.py      # STUDY section extraction/building
│
├── goals/            # Goal domain logic
│   ├── identity.py     # canonical_goal_text + goal ID helpers
│   ├── tombstones.py   # carried-goal cache + deleted-goal tombstones
│   ├── carry_forward.py # shared carry-forward/tombstone engine
│   ├── state.py        # cache-backed source/mirror done-state reconciliation
│   ├── reconcile.py    # goal piercing + mirror/source reconciliation
│   ├── note_store.py   # canonical goal subsection read/write helpers
│   ├── period_pipeline.py # shared period-goal orchestration configs + helpers
│   └── reminders.py    # markdown-configured reminder parsing/evaluation
│
├── periods/          # Weekly/monthly/quarterly/yearly sync + shared helpers
│   ├── windows.py      # Typed period windows + prior-period bound callbacks
│   ├── runtime.py      # Common path resolution, note lock/read/write, cleanup wrapper
│   ├── weekly.py       # Weekly note sync entrypoint
│   ├── monthly.py      # Monthly note sync entrypoint
│   ├── quarterly.py    # Quarterly note sync entrypoint
│   ├── yearly.py       # Yearly note sync entrypoint
│   ├── sections.py     # Shared periodic section assembly helpers
│   ├── cleanup.py      # Prior-period cleanup re-sync helper
│   └── media.py        # MEDIA section orchestration (scan + render composition)
│
└── [shared modules]
    ├── constants.py    # Configuration values
    ├── dates.py        # Date ranges + period shifting
    ├── formatting.py   # Value parsing and formatting
    ├── metrics/
    │   ├── loading.py      # Daily-note loading + prior-period metrics helper
    │   ├── aggregation.py  # Period aggregation + grouped totals
    │   └── comparison.py   # Moving averages + delta/threshold helpers
    ├── notes/
    │   ├── locking.py    # Advisory file locking
    │   ├── markdown.py   # Shared markdown header normalization + extract_block
    │   └── sections.py   # Markdown section extraction/manipulation
    ├── io.py            # Low-level file I/O (safe_read_file, atomic_write_note, JSON cache)
    └── logging.py      # Logging utilities
```

**Data flow**: `markdown → readers → models → writers → markdown`

### Interface-First Layer Rules

The architecture is now interface-first and enforces strict layering:

- **`sync/contracts/`**: typed DTO/contracts only (no I/O, no adapter logic)
- **`sync/ports/`**: stable `Protocol` interfaces consumed by application services
- **`sync/adapters/`**: concrete integrations for Flow DB, iCloud, markdown/file system
- **`sync/application/`**: orchestration services that depend on ports/contracts, never adapters directly
- **Composition roots only**: `sync/daily/__main__.py`, `sync/periods/{weekly,monthly,quarterly,yearly}.py`, `tui/app.py`, and `tui/cli.py` may wire adapters into application services

Dependency rules:
- `sync/application` must not import `sync/adapters`
- `sync/writers` must not import `sync/ports` or `sync/adapters`
- Non-composition modules must not import `sync/application` or `sync/adapters`

Canonical interface contracts (phase 2):
- `sync.ports.sessions.StudySessionSource.load_sessions(day)` returns `list[sync.contracts.study.StudySessionRecord]`
- `sync.ports.status.DailyStatusSource` is the only interface for daily training/sleep/screen-time status + study-times writeback
- `sync.adapters.flow_sessions.FlowStudySessionSource` is the Flow DB adapter implementation
- `sync.adapters.icloud_status.ICloudDailyStatusSource` is the iCloud status adapter implementation
- `sync.study.db.get_sessions_for_day(day)` is the canonical day-scoped Flow fetch API (with `get_todays_sessions()` as a today convenience wrapper)

Canonical interface contracts (phase 3):
- `sync.ports.notes.NoteStore` is the only interface for note read/create/write operations
- `sync.ports.goals.GoalStore` is the canonical goals extraction/apply/write interface
- `sync.ports.reminders.ReminderRuleStore` is the canonical reminder rule persistence interface
- `sync.adapters.markdown_notes.MarkdownNoteStore`, `sync.adapters.markdown_goals.MarkdownGoalStore`, and `sync.adapters.markdown_reminders.MarkdownReminderRuleStore` are the markdown-backed implementations
- `sync/daily/orchestrator/note_io.py`, `sync/periods/runtime.py`, and `tui/data/daily_store.py` must consume `NoteStore` instead of direct filesystem helpers

### Module Responsibilities

**Models (`sync/models/`):**
- `Goal`: Checkbox task with optional deadline, reminder offset, canonical form
- `Book`, `Podcast`: Media items with dates and metadata
- `StudySession`, `SleepEntry`, `TrainingEntry`: Daily activity records
- `ScreenTimeEntry`, `DailyScreenTimeData`: Screen time tracking
- `DailyDeviationData`: Schedule adherence (interrupts, overruns, late study/workout start)
- `PeriodMetrics`: Aggregated metrics for weekly/monthly/quarterly/yearly

**Readers (`sync/readers/`):**
- `parse_goal_tasks(lines)` → `list[Goal]`
- `scan_books(start, end, dir)` → `list[Book]`
- `parse_study_table(lines)` → `list[StudySession]`
- `parse_procrastination_table(lines)` → `DailyScreenTimeData`
- `parse_daily_note(path)` → `dict | None` (canonical daily aggregate parser)
  - includes `training_type_minutes` and `training_type_sessions` from daily TRAINING rows
- Shared helpers: `normalize_header`, `extract_block`, `parse_duration_to_minutes`
- Dated goals: `resolve_deadline`, `parse_goal_date`, `filter_by_proximity`
- Piercing: `filter_by_proximity` excludes completed goals from piercing into child periods

**Writers (`sync/writers/`):**
- `render_goal_lines(goals, today)` → `list[str]`
- `render_bar_chart(...)` → `list[str]`
- `render_summary_table(...)` → `list[str]` (includes TARGET and PROGRESS columns)
- `render_training_type_sessions_table(...)` → `list[str]`
- `render_waterfall_chart(...)` → `list[str]` (screen time by app)
- `render_screen_time_trend_table(...)` → `list[str]`
- `format_countdown(deadline, today, is_done)` → `str`

**Shared Modules:**
- `dates.py`: `daterange`, `iso_week_range`, `month_range`, `quarter_range`, `shift_month`, `shift_quarter`, `previous_month`, `previous_quarter`
- `formatting.py`: `format_minutes`, `compute_percent_change`, `format_percent_change`
- `metrics/loading.py`: `load_daily_data`, `load_daily_data_for_dates`, `load_prior_period_metrics`
- `metrics/aggregation.py`: `compute_period_metrics`, `aggregate_activity_totals`, `aggregate_interrupt_overrun`, `aggregate_screen_time`, `aggregate_training_type_session_stats`
- `metrics/comparison.py`: `group_screen_time_by_percent`, `compute_period_deltas`, `compute_moving_average`
- `study/constants.py`: Flow app integration constants + study break boundaries
- `study/db.py`: `get_sessions_for_day`, `get_todays_sessions`, `dedupe_sessions`, `core_data_to_datetime`
- `study/breaks.py`: expected-break calculation, lunch window shifting, overrun clamping
- `study/section.py`: STUDY table extraction/building with default activity label normalization (`Study`)
- `notes/locking.py`: lockfile lifecycle + `locked_note`
- `notes/markdown.py`: `normalize_header`, `extract_block` (single-source markdown matching helpers)
- `notes/sections.py`: header lookup, section bounds, goal splicing, section joining
- `periods/windows.py`: typed current/previous period windows + moving-average prior-bound callbacks
- `periods/runtime.py`: period note path resolution, lock lifecycle, NoteStore-backed read/write helpers, optional prior-period cleanup wrapper
- `periods/sections.py`: `append_summary_section`, `append_interrupts_table`, `append_training_type_table`, `build_procrastination_section`, `append_media_section`
- `goals/identity.py`: `canonical_goal_text`, `generate_goal_id`, `generate_goal_id_for`
- `goals/carry_forward.py`: `carry_forward_with_tombstones` (shared carry-forward + tombstone suppression)
- `periods/media.py`: `build_media_section` (scans via readers, renders via writers)
- `goals/reconcile.py`: `reconcile_goal_lists`, `process_pierced_goals`, `merge_mirror_goals`
- `goals/note_store.py`: `extract_goals`, `render_goals_or_empty`, `apply_goals_sections`, `write_goals_sections`
- `goals/period_pipeline.py`: typed configs for carry-forward/mirror/piercing/source-write flows used by period sync entrypoints
- `goals/tombstones.py`: offered-ID cache + deleted-goal tombstones (`_deleted`) with bounded retention pruning (`daily=120`, `weekly=52`, `monthly=36`, `quarterly=20`, `yearly=12`)
- `goals/state.py`: `load_goal_sync_state`, `save_goal_sync_state`, `reconcile_pair`, `record_note_state` (mtime tie-break: source wins)
- `periods/cleanup.py`: `resync_if_marker`
- `io.py`: `safe_read_file`, `atomic_write_note`, `safe_load_json`, `safe_save_json`, `safe_load_dated_cache`
- `goals/reminders.py`: `load_reminder_rules(path)` + `get_reminders_for_date(date, rules)` from `REMINDERS.md`

### Dated Goals

Goals support inline deadlines with countdown rendering:
- **Date formats**: `` `2025-02-12` ``, `` `2025-W01` ``, `` `2025-01` ``, `` `2025-Q1` ``
- **Countdown**: `— `43d``, `— `TODAY``, `— `LATE +5d``
- **Early reminder**: `` `2025-02-12 !14d` `` shows goal 14 days before deadline

### Periodic Reminders

Reminder generation is file-driven and injected into DAILY goals:
- **Source of truth**: `REMINDERS.md` in `JOURNAL_DIR`
- **Parser**: `sync/goals/reminders.py` (`load_reminder_rules`, `get_reminders_for_date`)
- **Schema**: strict markdown table with columns `ID | ENABLED | SCHEDULE | BODY`
- **Supported schedules**: `WEEKLY:<WEEKDAY>`, `MONTHLY:LAST_DAY`, `YEARLY:MM-DD`, `BIWEEKLY_ODD_ISO:<WEEKDAY>`, `BIWEEKLY_EVEN_ISO:<WEEKDAY>`
- **Behavior**: due date is always the trigger date (no configurable offset column)
- Missing or invalid `REMINDERS.md` is a hard error (no fallback defaults)

### Training Table

The training table tracks workout and stretch sessions:
- **Columns**: START, END, ACTIVITY, DURATION, INTERRUPT
- **INTERRUPT**: Time elapsed beyond actual workout duration
- **Visualizations**: Weekly grid (`███`/`░░░`), monthly grid (`■`/`·`), frequency counts
- **Periodic breakdown table**: Weekly/monthly/quarterly/yearly TRAINING sections append:
  - **Columns**: `TYPE | SESSIONS | AVERAGE`
  - **SESSIONS**: Backticked `x/y` where `x` is raw session count and `y` is target count scaled from weekly `IDEAL` targets for the period
  - **Target mapping**: `meditat*` → mindful target, `stretch*` → stretch target, otherwise workout target
  - **AVERAGE**: Backticked per-session duration (e.g., `` `58m/session` ``), sorted by highest average first

### Procrastination Tracking

Screen time data from iOS Shortcuts is tracked in the PROCRASTINATION section:
- **Data source**: iCloud JSON from iOS Shortcuts (iPad and iPhone)
- **Segmented parsing**: Handles comma-separated activity entries per device
- **Dual-threshold grouping**: Apps need `≥10 min AND >5%` to stay individual; others go to "Miscellaneous"
- **Periodic re-grouping**: Weekly/monthly/quarterly/yearly charts re-apply 5% threshold after aggregation
- **Waterfall chart**: Horizontal bars showing app usage breakdown with percentages (largest remainder method ensures 100% sum)
- **Deviation tracking**: Calculates non-phone procrastination (interrupts + overruns + late study start + late workout start − screen time)
- **Ideal schedule**: Study 8:00 AM (`IDEAL_STUDY_START_HOUR`), Workout 6:00 PM (`IDEAL_WORKOUT_START_HOUR`)
- **Trend tables**: Daily/weekly/monthly screen time trends with wikilinks to periodic notes

### Summary Table with IDEALS Progress

The summary table includes target tracking and progress visualization:
- **Columns**: METRIC, AVG (or period label), PREV, MA, Δ, TARGET, PROGRESS
- **Progress bars**: 25-character ASCII bars (`█`/`░`) showing % of ideal
- **Ideal targets**:
  - Study: 6h/day (scales by period)
  - Sleep: 8h/night (constant)
  - Workout: 6/7 days (scales by period)
  - Stretch: 7/7 days (scales by period)
  - Mindful: 7/7 days (scales by period)
  - Mood: 7.0/10.0 (constant)
- **Pace-based training comparison**: For workout/stretch, CHANGE column compares *completion rates* (count/elapsed days for current period, count/total days for previous period). This answers "What is my current pace vs last period's pace?" and provides meaningful mid-period comparisons. Example: on day 4 of a week, `3/4` (75%) vs `5/7` (71%) → +6%.

## Build, Test, and Run

- Requires Python 3.10+ on macOS with Flow and Obsidian installed; uses only stdlib.
- Run all syncs: `./sync_all.sh`
- Run individual syncs:
  - `python -m sync.daily`
  - `python -m sync.periods.weekly [--date YYYY-MM-DD]`
  - `python -m sync.periods.monthly [--month YYYY-MM]`
  - `python -m sync.periods.quarterly [--quarter YYYY-Q#]`
  - `python -m sync.periods.yearly [--year YYYY]`
- Goal carry-forward cache: `~/.cache/journal/carried_goals.json`
  - Stores offered goal IDs per period key (for same-period delete suppression)
  - Stores deleted-goal tombstones in `_deleted` for cross-period suppression
  - Tombstones are pruned by period window (`daily=120`, `weekly=52`, `monthly=36`, `quarterly=20`, `yearly=12`)
- Goal sync reconciliation cache: `~/.cache/journal/goal_sync_state.json`
  - Stores per-goal per-note done snapshots for bidirectional reopen/completion sync across mirrors
  - Conflict rule: source-only change wins, mirror-only change wins, dual-edit uses newer note mtime (source on ties)
- Training cache: `~/.cache/journal/training_entries.json`
- Screen time cache: `~/.cache/journal/screen_time_entries.json`
- **Frontmatter**: Only daily notes may have YAML frontmatter properties.

## LaunchAgent

All syncs are triggered via LaunchAgent at `~/Library/LaunchAgents/com.edo.journalsync.plist`:
- Runs `sync_all.sh` which executes all syncs in sequence
- Watches Flow's CoreData database and iCloud status files
- Runs every 15 minutes as a fail-safe
- Logs to `/tmp/com.edo.journal.out` and `/tmp/com.edo.journal.err`

To reload:
```bash
launchctl unload ~/Library/LaunchAgents/com.edo.journalsync.plist
launchctl load ~/Library/LaunchAgents/com.edo.journalsync.plist
```

## Flow Skip Automation

Automatically skips Flow sessions at scheduled times and starts the break. Configured via `~/.config/journal/skip_schedule.json`:
```json
{
  "skip_times": ["09:30", "11:30", "13:30", "16:00"],
  "enabled": true
}
```

**Toggle on/off:**
```bash
python3 -m tui.cli skip-toggle       # Toggle
python3 -m tui.cli skip-toggle on    # Enable
python3 -m tui.cli skip-toggle off   # Disable
```

**LaunchAgent:** `~/Library/LaunchAgents/com.edo.flow-skip.plist`
- Runs at each skip time defined in the plist
- Executes `python3 -m tui.cli skip-now`
- Logs to `/tmp/flow-skip.log`
- Only skips if Flow is in an active "Flow" phase
- Shows the Flow UI after skipping (reminder to start next session)

To reload:
```bash
launchctl unload ~/Library/LaunchAgents/com.edo.flow-skip.plist
launchctl load ~/Library/LaunchAgents/com.edo.flow-skip.plist
```

## Coding Style & Naming Conventions

- 4-space indentation, snake_case functions, UPPER_SNAKE constants
- Private helper functions prefixed with `_`
- Prefer f-strings; keep logic in small helpers
- Use docstrings with concise intent; stay stdlib-only
- Preserve idempotency: builders should yield stable output
- Models in `sync/models/`, readers in `sync/readers/`, writers in `sync/writers/`

## Testing Guidelines

Run the test suite before committing:
```bash
pytest tests/ -v              # Full suite (sync + tui)
ruff check . && ruff format --check .  # Linting
vulture sync/ --min-confidence 80      # Dead code
```

Validate:
- Idempotency: run twice, confirm stable output
- Edge cases: open sessions, missing JSON, dynamic lunch windows
- Historical aggregation with `--date`/`--month`/`--quarter`/`--year` flags
- Architecture: `tests/sync/test_architecture_guards.py` enforces domain package layout and bans removed legacy imports/APIs
- Render diff gates: `tests/sync/test_render_baseline_snapshots.py` enforces line-for-line period metrics + goals block snapshots, including newline/spacing invariance

## Commit & Pull Request Guidelines

- Follow Conventional Commits (e.g., `feat: add lunch window override`)
- Document environment assumptions in PR description
- Include before/after snippets when behavior changes

## Security & Configuration Tips

- Paths point to personal data; avoid committing real journal files
- Keep `DB_PATH` read-only; test on copies to avoid accidental edits
