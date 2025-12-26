# Repository Guidelines

This repository hosts automation scripts that sync daily focus data from the Flow macOS app into an Obsidian vault, generate weekly, monthly, quarterly, and yearly aggregated metrics, and carry forward incomplete Goals between days.

## Project Structure & Data Flow

```
journal/
  sync_utils/          # Modular utility package (see Architecture below)
    __init__.py        # Re-exports all functions for backward compatibility
    constants.py       # Directory paths, study thresholds, chart dimensions
    dates.py           # Date range calculations (weeks, months, quarters, years)
    parsing.py         # Duration parsing, value formatting, percent changes
    goals.py           # Goal parsing, ID generation, markdown rendering
    metrics.py         # Period aggregation, delta computation
    charts.py          # All chart/table rendering functions
    notes.py           # File I/O, locking, markdown section manipulation
  daily_sync.py        # Daily sync (Flow sessions, training, sleep, goals)
  weekly_sync.py       # Weekly metrics aggregation
  monthly_sync.py      # Monthly metrics aggregation
  quarterly_sync.py    # Quarterly metrics aggregation
  yearly_sync.py       # Yearly metrics aggregation
  sync_all.sh          # Wrapper script that runs all syncs (called by LaunchAgent)
  AGENTS.md            # This file
  __pycache__/         # Generated Python bytecode; safe to ignore
```

### Scripts Overview

- **`sync_utils/`**: Modular utility package containing shared constants, formatting helpers, date utilities, chart rendering, and file operations. All functions are re-exported from `__init__.py` for backward-compatible imports like `from sync_utils import render_bar_chart`.

- **`daily_sync.py`**: Main entry point for daily syncing; reads Flow CoreData at `DB_PATH`, merges break defaults from `defaults` CLI, pulls workout/stretch/sleep JSON from `~/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/JournalSync`, writes/updates today's markdown file in `JOURNAL_DIR`, and copies unfinished Goals from yesterday into today (idempotent via goal IDs; safe to run multiple times per day).

- **`weekly_sync.py`**: Aggregates daily notes into weekly metrics (study time, sleep, mood, training) with bar charts for study/sleep/mood and a compact frequency grid for training data. Includes a **Summary Table** with 4-week moving averages for trend tracking.

- **`monthly_sync.py`**: Aggregates daily notes into monthly metrics with weekly breakdowns, including bar charts for study/sleep/mood and a compact frequency grid. Includes a **Summary Table** with 3-month moving averages.

- **`quarterly_sync.py`**: Aggregates daily notes into quarterly metrics with month-level breakdowns. Charts roll up by month. Goals section mirrors yearly + quarterly goals. Includes a **Summary Table** with 4-quarter moving averages.

- **`yearly_sync.py`**: Aggregates daily notes into yearly metrics with quarter-level breakdowns. Charts show 4 bars (one per quarter). Includes a **Summary Table** with 3-year moving averages (once sufficient data exists).

- **`sync_all.sh`**: Wrapper script that runs daily, weekly, monthly, quarterly, and yearly syncs in sequence. Called by the LaunchAgent to keep all notes fresh.

### Configuration Constants

All configuration constants are centralized in `sync_utils/constants.py`:
- **Directory paths**: `JOURNAL_DIR`, `VAULT_DIR`, `LOCK_DIR`
- **Template paths**: `WEEKLY_TEMPLATE_PATH`, `MONTHLY_TEMPLATE_PATH`, `QUARTERLY_TEMPLATE_PATH`, `YEARLY_TEMPLATE_PATH`
- **Defaults**: `DEFAULT_WEEKLY_DIR`, `DEFAULT_MONTHLY_DIR`, `DEFAULT_QUARTERLY_DIR`, `DEFAULT_YEARLY_DIR`
- **Study thresholds**: `STUDY_TARGET_MIN`, `STUDY_SYMBOL_DEEP`, `STUDY_SYMBOL_NONE`
- **Chart dimensions**: `CHART_HEIGHT_*`, `CHART_Y_MAX_*`
- **Labels**: `DAYS`, `MONTH_ABBR`

Daily sync has additional constants in `daily_sync.py`: `DB_PATH`, `TEMPLATE_PATH`, `ICLOUD_JOURNALSYNC_DIR`, `TRAINING_CACHE_PATH`

## Architecture

### Utility Package (`sync_utils/`)

The utilities are organized into focused modules with clear dependencies:

```
constants.py (no deps)
     ↓
  dates.py (→ constants)
     ↓
parsing.py (no deps)    goals.py (no deps)
     ↓                       ↓
metrics.py (→ dates, parsing, notes)
     ↓
charts.py (→ constants, parsing, dates)
     ↓
notes.py (→ constants, parsing, goals)
```

**Module responsibilities:**

- **`constants.py`**: All configuration values. No function definitions.

- **`dates.py`**: Date range calculations
  - `daterange`, `iso_week_range`, `month_range`, `quarter_range`, `quarter_months`
  - `quarter_of_date`, `year_range`, `year_quarters`, `month_week_ranges`
  - `format_week_label`, `quarter_id`

- **`parsing.py`**: Value parsing and formatting
  - `parse_frontmatter`, `parse_duration_to_minutes`, `format_minutes`, `format_minutes_seconds`
  - `ceil_minutes`, `round_half_up`, `parse_bool`
  - `compute_percent_change`, `format_percent_change`, `format_training_ratio`, `format_mood_with_scale`
  - `format_ma_training_ratio`

- **`goals.py`**: Goal management
  - `canonical_goal`, `parse_goal_tasks`, `render_goal_lines`
  - `generate_goal_id`, `generate_goal_id_for`, `extract_goal_id`, `ensure_goal_ids`
  - `find_subheader_idx`, `build_goals_block`

- **`metrics.py`**: Period aggregation
  - `load_daily_data`, `compute_period_metrics`
  - `aggregate_activity_totals`, `aggregate_interrupt_overrun`
  - `compute_period_deltas`, `compute_moving_average`

- **`charts.py`**: All rendering functions
  - **Unified chart**: `render_bar_chart` (consolidated from 4 previous functions)
  - **Tables**: `render_summary_table`, `render_sleep_stats_table`, `render_activity_table`, `render_interrupts_table`
  - **Grids**: `render_training_frequency_grid`, `render_weekly_training_grid`, `render_weekly_study_grid`, `render_monthly_study_grid`
  - **Coverage**: `render_quarterly_study_coverage`, `render_yearly_study_coverage`, `render_training_quarter_block`
  - **Helpers**: `wrap_code_block`, `study_intensity_symbol`, `_compress_symbols`, `_compress_days_time_order`, `compress_activity_time_order`

- **`notes.py`**: File I/O and markdown manipulation
  - **Locking**: `locked_note` (context manager for atomic writes)
  - **Parsing**: `parse_daily_note`, `parse_study_table`, `parse_sleep_table`
  - **Section finding**: `find_header_idx`, `section_bounds`, `subsection_bounds`, `extract_block`
  - **Section manipulation**: `ensure_section_with_divider`, `goals_section_bounds`, `extract_subsection_tasks`
  - **File ops**: `ensure_note`, `replace_metrics_block`, `trim_blank_lines`, `join_sections`

### Daily Sync (`daily_sync.py`)
- **Goal management**: `_parse_daily_goal_subsections`, `_carry_forward_daily_tasks`; goal IDs (`^gid-…`) are mandatory and deterministic per period
- **Section builders**: `_build_study_section`, `_build_training_section`, `_build_sleep_section`
- **Training data**: `_load_training_cache`, `_save_training_cache`, `_activity_entries_from_data`, `_merge_training_entries`, `_render_training_entries`, `_parse_training_table`
- **Status file handling**: `_load_status_file` (resilient iCloud sync with retry logic)
- **Frontmatter**: `_parse_frontmatter`, `_update_frontmatter`
- **Flow database**: `get_todays_sessions`, `dedupe_sessions`, `get_expected_break_minutes`
- **Main orchestrator**: `update_markdown`
  - Ensures top-level sections (`## Goals`, `## Metrics`, `## Reflections`) exist and each is followed by `---` via `ensure_section_with_divider`
  - Rebuilds Goals block with weekly mirror + daily goals using `build_goals_block` and `goals_section_bounds`
  - Builds Metrics subsections and splices them with `replace_metrics_block`, leaving later content untouched
  - Updates frontmatter (study/workout/stretch/sleep) and writes atomically with temp-file swap under `locked_note`

### Weekly/Monthly/Quarterly/Yearly Sync
- `build_weekly_metrics` / `build_monthly_metrics` / `build_quarterly_metrics` / `build_yearly_metrics`: Generate aggregated metrics blocks
- All import shared utilities from `sync_utils/` package
- Goals and Metrics are built as discrete blocks and spliced into existing notes (surgical updates), with atomic temp-file writes under `locked_note`

### Training Visualizations
Weekly and monthly notes use compact frequency grids to display training data:
- **Monthly grid**: Uses `■` (completed) and `·` (skipped) with week grouping, dynamically adjusts for 28-31 day months, shows inline counts like `(06/31)` with zero-padding
- **Weekly grid**: Uses `███` (completed) and `░░░` (skipped) for better visibility, shows inline counts like `(2/7)` without zero-padding
- Both formats include vertical bars (`│`) for visual consistency, separator lines, and day labels
- No legends or summary tables—visual patterns and inline counts make totals immediately apparent

Quarterly and yearly notes use per-period bar rows for workout and stretch with percent deltas; counts are right-aligned and zero-padded.

## Build, Test, and Run

- Requires Python 3.10+ on macOS with Flow and Obsidian installed; uses only stdlib.
- Run all syncs: `./sync_all.sh` (recommended; runs daily, weekly, monthly, quarterly, yearly in sequence)
- Run individual syncs:
  - `python3 daily_sync.py` (read-only to SQLite; writes the current day's note)
  - `python3 weekly_sync.py [--date YYYY-MM-DD] [--file PATH]`
  - `python3 monthly_sync.py [--month YYYY-MM] [--file PATH]`
  - `python3 quarterly_sync.py [--quarter YYYY-Q#] [--file PATH]`
  - `python3 yearly_sync.py [--year YYYY] [--file PATH]`
- Quick syntax check: `python3 -m compileall daily_sync.py weekly_sync.py monthly_sync.py quarterly_sync.py yearly_sync.py sync_utils/`
- Goal carry-forward is ID-based (no guard files). Each goal line ends with a hidden block ID `^gid-xxxxxxxxxx` used for mirroring across daily/weekly/monthly notes.
- The training cache at `~/.cache/journal_sync/training_entries.json` stores workout/stretch entries for the current day to handle status files arriving across separate runs.

## LaunchAgent

All syncs (daily, weekly, monthly, quarterly, yearly) are triggered automatically via LaunchAgent at `~/Library/LaunchAgents/com.edo.journalsync.plist`:
- Runs `sync_all.sh` which executes all syncs in sequence
- Watches Flow's CoreData database and iCloud status files for changes
- Runs every 15 minutes as a fail-safe
- Throttles to prevent rapid-fire execution (10-second minimum between runs)
- Logs to `/tmp/journalsync.out` and `/tmp/journalsync.err`

To reload after changes:
```bash
launchctl unload ~/Library/LaunchAgents/com.edo.journalsync.plist
launchctl load ~/Library/LaunchAgents/com.edo.journalsync.plist
```

## Coding Style & Naming Conventions

- 4-space indentation, snake_case functions, UPPER_SNAKE constants.
- Private helper functions prefixed with `_` (e.g., `_build_study_section`, `_load_status_file`).
- Prefer f-strings; keep logic in small helpers.
- Use docstrings with concise intent; stay stdlib-only unless a new dependency is clearly justified.
- Preserve idempotency: table builders should yield stable output on consecutive runs.
- Shared utilities go in the appropriate `sync_utils/` module; script-specific logic stays in respective scripts.
- Constants belong in `sync_utils/constants.py`; date functions in `dates.py`, etc.

## Testing Guidelines

- No automated suite; test manually against a copy of the Flow database and a scratch Obsidian vault when possible.
- After changes, run the script twice and confirm the daily note remains stable (no duplicate rows) and preserves existing notes by start time.
- Validate edge cases: open sessions (no `completed_at`), missing JSON payloads, and dynamic lunch window shifting.
- Test weekly/monthly/quarterly/yearly scripts with `--date`, `--month`, `--quarter`, or `--year` flags to verify historical aggregation.
- For training visualizations: test with periods containing zero training days, full training days, and mixed patterns to verify proper rendering.
- Verify formatting consistency: study SUM should always show `0h00m` (not `0m`), training counts should be zero-padded in monthly/quarterly/yearly notes only (`06/31` vs `2/7`).

## Commit & Pull Request Guidelines

- Follow Conventional Commits (e.g., `feat: add lunch window override`) and wrap body lines at ~72 chars.
- Document environment assumptions (paths, defaults) in the PR description and list the manual commands you ran.
- Include before/after snippets of the generated markdown tables when behavior changes; note any impact on LaunchAgents/Shortcuts configurations.

## Security & Configuration Tips

- Paths point to personal data; avoid committing real journal files or iCloud payloads. Use redacted examples when sharing.
- Keep `DB_PATH` read-only; the script only reads SQLite but writes to the vault—test on copies to avoid accidental edits to your primary notes.
