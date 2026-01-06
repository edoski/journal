# Repository Guidelines

This repository hosts automation scripts that sync daily focus data from the Flow macOS app into an Obsidian vault, generate weekly, monthly, quarterly, and yearly aggregated metrics, and carry forward incomplete Goals between days.

## Project Structure & Data Flow

```
journal/
  sync/                   # Unified sync package with layered architecture
    __init__.py           # Package entry point
    models/               # Dataclass models (Goal, Book, Podcast, StudySession, etc.)
    readers/              # Parsing functions (parse_goal_tasks, scan_books, etc.)
    writers/              # Rendering functions (render_goal_lines, charts, tables)
    daily/                # Daily note orchestration (run with: python -m sync.daily)
      orchestrator.py     # Main update_markdown logic and goal management
      flow_db.py          # Flow database access, session deduplication
      breaks.py           # Break linking, overrun calculations
      study.py            # Study table building
      training.py         # Training/workout/stretch handling
      sleep.py            # Sleep section building
      context.py          # Context tracking for CONTEXT column
      icloud.py           # Resilient iCloud status file loading
      screen_time.py      # Screen time data loading and PROCRASTINATION section
      constants.py        # Daily-specific constants
    weekly.py             # Weekly metrics aggregation
    monthly.py            # Monthly metrics aggregation
    quarterly.py          # Quarterly metrics aggregation
    yearly.py             # Yearly metrics aggregation
    base.py               # Cross-period utilities (goal carry-forward, atomic writes)
    constants.py          # Shared constants (paths, thresholds, dimensions)
    dates.py              # Date range calculations
    formatting.py         # Value parsing and formatting
    metrics.py            # Period aggregation and delta computation
    notes.py              # File I/O, locking, markdown section manipulation
    reminders.py          # Periodic review reminder generation
    carried_goals.py      # Goal carry-forward cache management
    logging.py            # Logging utilities
  sync_all.sh             # Wrapper script that runs all syncs
  AGENTS.md               # This file
  tests/                  # Pytest test suite (389 tests)
    test_*.py             # Tests for all sync modules
  __pycache__/            # Generated Python bytecode; safe to ignore
```

### Scripts Overview

- **`sync/`**: Unified sync package with layered architecture:
  - **`models/`**: Dataclass models (Goal, Book, Podcast, StudySession, ScreenTimeEntry, etc.)
  - **`readers/`**: Parsing functions that convert markdown to models
  - **`writers/`**: Rendering functions that convert models to markdown
  - **`daily/`**: Daily note orchestration (run with `python -m sync.daily`)

- **`sync/weekly.py`**: Aggregates daily notes into weekly metrics with bar charts, training grids, and procrastination trend tables. Includes **Summary Table** with 4-week moving averages and **IDEALS Progress** tracking.

- **`sync/monthly.py`**: Aggregates daily notes into monthly metrics with weekly breakdowns. Includes **Summary Table** with 3-month moving averages.

- **`sync/quarterly.py`**: Aggregates daily notes into quarterly metrics with month-level breakdowns. Includes **Summary Table** with 4-quarter moving averages.

- **`sync/yearly.py`**: Aggregates daily notes into yearly metrics with quarter-level breakdowns. Includes **Summary Table** with 3-year moving averages.

- **`sync_all.sh`**: Wrapper script that runs daily, weekly, monthly, quarterly, and yearly syncs in sequence.

- **`undo_last_session.py`**: Utility to delete the most recent Flow session. Run with `--confirm` to actually delete.

### Linting & Testing

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
pytest tests/ -v          # Run all 389 tests
```

### Configuration Constants

Shared constants are in `sync/constants.py`:
- **Directory paths**: `JOURNAL_DIR`, `VAULT_DIR`, `LOCK_DIR`
- **Template paths**: `WEEKLY_TEMPLATE_PATH`, `MONTHLY_TEMPLATE_PATH`, etc.
- **Study thresholds**: `STUDY_TARGET_MIN`, `STUDY_SYMBOL_DEEP`, `STUDY_SYMBOL_NONE`
- **Chart dimensions**: `CHART_HEIGHT_*`, `CHART_Y_MAX_*`
- **Labels**: `DAYS`, `MONTH_ABBR`
- **Ideal targets**: `IDEAL_STUDY_MINUTES_DAILY`, `IDEAL_SLEEP_MINUTES_NIGHTLY`, `IDEAL_WORKOUT_WEEKLY`, `IDEAL_STRETCH_WEEKLY`, `IDEAL_MOOD_TARGET`
- **Progress bar**: `IDEAL_PROGRESS_BAR_WIDTH`, `IDEAL_PROGRESS_FILLED`, `IDEAL_PROGRESS_EMPTY`
- **Screen time**: `SCREEN_TIME_MIN_MINUTES` (10 min), `SCREEN_TIME_PERCENT_THRESHOLD` (5%), `SCREEN_TIME_MISC_LABEL`, `IDEAL_STUDY_START_HOUR`

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
│   ├── daily.py      # DailyData aggregate
│   └── period.py     # PeriodMetrics
│
├── readers/          # Parsing: markdown → models
│   ├── frontmatter.py  # parse_frontmatter
│   ├── goals.py        # parse_goal_tasks, resolve_deadline, filter_by_proximity
│   ├── media.py        # scan_books, scan_podcasts
│   ├── sleep.py        # parse_sleep_table
│   ├── study.py        # parse_study_table
│   └── screen_time.py  # parse_procrastination_table
│
├── writers/          # Rendering: models → markdown
│   ├── charts.py       # render_bar_chart, training grids, study coverage, waterfall charts
│   ├── tables.py       # render_summary_table, render_sleep_stats_table
│   ├── goals.py        # render_goal_lines, build_goals_block, format_countdown
│   └── media.py        # render_media_table, build_media_section
│
├── daily/            # Daily note orchestration
│   ├── orchestrator.py # Main update_markdown logic
│   ├── flow_db.py      # Flow database access
│   ├── breaks.py       # Break linking, overrun calculations
│   ├── study.py        # Study section building
│   ├── training.py     # Training/workout/stretch handling
│   ├── sleep.py        # Sleep section building
│   ├── context.py      # Context tracking
│   ├── icloud.py       # iCloud status file loading
│   └── screen_time.py  # Screen time data loading and procrastination section
│
└── [shared modules]
    ├── constants.py    # Configuration values
    ├── dates.py        # Date range calculations
    ├── formatting.py   # Value parsing and formatting
    ├── metrics.py      # Period aggregation
    ├── notes.py        # File I/O, markdown manipulation
    ├── reminders.py    # Review reminder generation
    ├── logging.py      # Logging utilities
    └── base.py         # Cross-period utilities
```

**Data flow**: `markdown → readers → models → writers → markdown`

### Module Responsibilities

**Models (`sync/models/`):**
- `Goal`: Checkbox task with optional deadline, reminder offset, canonical form
- `Book`, `Podcast`: Media items with dates and metadata
- `StudySession`, `SleepEntry`, `TrainingEntry`: Daily activity records
- `ScreenTimeEntry`, `DailyScreenTimeData`: Screen time tracking with deviation metrics
- `PeriodMetrics`: Aggregated metrics for weekly/monthly/quarterly/yearly

**Readers (`sync/readers/`):**
- `parse_goal_tasks(lines)` → `list[Goal]`
- `scan_books(start, end, dir)` → `list[Book]`
- `parse_study_table(lines)` → `list[StudySession]`
- `parse_procrastination_table(lines)` → `DailyScreenTimeData`
- Dated goals: `resolve_deadline`, `parse_goal_date`, `filter_by_proximity`

**Writers (`sync/writers/`):**
- `render_goal_lines(goals, today)` → `list[str]`
- `render_bar_chart(...)` → `list[str]`
- `render_summary_table(...)` → `list[str]` (includes TARGET and PROGRESS columns)
- `render_waterfall_chart(...)` → `list[str]` (screen time by app)
- `render_screen_time_trend_table(...)` → `list[str]`
- `format_countdown(deadline, today, is_done)` → `str`

**Shared Modules:**
- `dates.py`: `daterange`, `iso_week_range`, `month_range`, `quarter_range`
- `formatting.py`: `format_minutes`, `compute_percent_change`, `format_percent_change`
- `metrics.py`: `load_daily_data`, `compute_period_metrics`, `compute_moving_average`
- `notes.py`: `locked_note`, `parse_daily_note`, `ensure_note`, `replace_metrics_block`
- `reminders.py`: `get_review_reminders_for_date` (weekly/monthly/yearly reviews)

### Dated Goals

Goals support inline deadlines with countdown rendering:
- **Date formats**: `` `2025-02-12` ``, `` `2025-W01` ``, `` `2025-01` ``, `` `2025-Q1` ``
- **Countdown**: `— `43d``, `— `TODAY``, `— `LATE +5d``
- **Early reminder**: `` `2025-02-12 !14d` `` shows goal 14 days before deadline

### Training Table

The training table tracks workout and stretch sessions:
- **Columns**: START, END, ACTIVITY, DURATION, INTERRUPT
- **INTERRUPT**: Time elapsed beyond actual workout duration (replaces deprecated CALORIES)
- **Visualizations**: Weekly grid (`███`/`░░░`), monthly grid (`■`/`·`), frequency counts

### Procrastination Tracking

Screen time data from iOS Shortcuts is tracked in the PROCRASTINATION section:
- **Data source**: iCloud JSON from iOS Shortcuts (iPad and iPhone)
- **Segmented parsing**: Handles comma-separated activity entries per device
- **Dual-threshold grouping**: Apps need `≥10 min AND >5%` to stay individual; others go to "Miscellaneous"
- **Periodic re-grouping**: Weekly/monthly/quarterly/yearly charts re-apply 5% threshold after aggregation
- **Waterfall chart**: Horizontal bars showing app usage breakdown with percentages (largest remainder method ensures 100% sum)
- **Deviation tracking**: Calculates non-phone procrastination (interrupts + overruns + late start − screen time)
- **Trend tables**: Daily/weekly/monthly screen time trends with wikilinks to periodic notes

### Summary Table with IDEALS Progress

The summary table includes target tracking and progress visualization:
- **Columns**: METRIC, AVG (or period label), PREV, MA, Δ, TARGET, PROGRESS
- **Progress bars**: 25-character ASCII bars (`█`/`░`) showing % of ideal
- **Ideal targets**:
  - Study: 6h/day (scales by period)
  - Sleep: 8h/night (constant)
  - Workout: 7/7 days (scales by period)
  - Stretch: 7/7 days (scales by period)
  - Mood: 7.0/10.0 (constant)

## Build, Test, and Run

- Requires Python 3.10+ on macOS with Flow and Obsidian installed; uses only stdlib.
- Run all syncs: `./sync_all.sh`
- Run individual syncs:
  - `python -m sync.daily`
  - `python sync/weekly.py [--date YYYY-MM-DD]`
  - `python sync/monthly.py [--month YYYY-MM]`
  - `python sync/quarterly.py [--quarter YYYY-Q#]`
  - `python sync/yearly.py [--year YYYY]`
- Goal carry-forward cache: `~/.cache/journal/carried_goals.json`
- Training cache: `~/.cache/journal/training_entries.json`
- Screen time cache: `~/.cache/journal/screen_time_entries.json`
- **Frontmatter**: Only daily notes may have YAML frontmatter properties.

## LaunchAgent

All syncs are triggered via LaunchAgent at `~/Library/LaunchAgents/com.edo.journalsync.plist`:
- Runs `sync_all.sh` which executes all syncs in sequence
- Watches Flow's CoreData database and iCloud status files
- Runs every 15 minutes as a fail-safe
- Logs to `/tmp/journalsync.out` and `/tmp/journalsync.err`

To reload:
```bash
launchctl unload ~/Library/LaunchAgents/com.edo.journalsync.plist
launchctl load ~/Library/LaunchAgents/com.edo.journalsync.plist
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
pytest tests/ -v              # All 389 tests
ruff check . && ruff format --check .  # Linting
vulture sync/ --min-confidence 80      # Dead code
```

Validate:
- Idempotency: run twice, confirm stable output
- Edge cases: open sessions, missing JSON, dynamic lunch windows
- Historical aggregation with `--date`/`--month`/`--quarter`/`--year` flags

## Commit & Pull Request Guidelines

- Follow Conventional Commits (e.g., `feat: add lunch window override`)
- Document environment assumptions in PR description
- Include before/after snippets when behavior changes

## Security & Configuration Tips

- Paths point to personal data; avoid committing real journal files
- Keep `DB_PATH` read-only; test on copies to avoid accidental edits
