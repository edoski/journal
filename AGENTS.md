# Repository Guidelines

This repository hosts automation scripts that sync daily focus data from the Flow macOS app into an Obsidian vault, generate weekly and monthly aggregated metrics, and carry forward incomplete Goals between days.

## Project Structure & Data Flow

```
journal/
  sync_utils.py      # Shared utilities for all sync scripts
  daily_sync.py      # Daily sync (Flow sessions, training, sleep, goals)
  weekly_sync.py     # Weekly metrics aggregation
  monthly_sync.py    # Monthly metrics aggregation
  quarterly_sync.py  # Quarterly metrics aggregation
  sync_all.sh        # Wrapper script that runs all syncs (called by LaunchAgent)
  AGENTS.md          # This file
  __pycache__/       # Generated Python bytecode; safe to ignore
```

### Scripts Overview

- **`sync_utils.py`**: Shared utilities including constants (`JOURNAL_DIR`, template paths), formatting helpers (`format_minutes`, `format_minutes_seconds`, `ceil_minutes`, `round_half_up`), frontmatter/block parsing, date range utilities, and chart rendering functions.

- **`daily_sync.py`**: Main entry point for daily syncing; reads Flow CoreData at `DB_PATH`, merges break defaults from `defaults` CLI, pulls workout/stretch/sleep JSON from `~/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/JournalSync`, writes/updates today's markdown file in `JOURNAL_DIR`, and copies unfinished Goals from yesterday into today (idempotent via goal IDs; safe to run multiple times per day).

- **`weekly_sync.py`**: Aggregates daily notes into weekly metrics (study time, sleep, mood, training) with bar charts for study/sleep/mood and a compact frequency grid for training data showing completed/skipped days using visual blocks.

- **`monthly_sync.py`**: Aggregates daily notes into monthly metrics with weekly breakdowns, including bar charts for study/sleep/mood and a compact frequency grid showing entire month's training patterns at a glance.

- **`quarterly_sync.py`**: Aggregates daily notes into quarterly metrics with month-level breakdowns. Charts roll up by month (3 bars per chart). Goals section mirrors yearly + quarterly goals. Training uses per-month bars (workout and stretch) plus a percent table; study/sleep/mood charts mirror monthly styling.

- **`sync_all.sh`**: Wrapper script that runs daily, weekly, and monthly syncs in sequence. Called by the LaunchAgent to keep all notes fresh.

### Configuration Constants

- **In `sync_utils.py`**: `JOURNAL_DIR`, `VAULT_DIR`, `WEEKLY_TEMPLATE_PATH`, `MONTHLY_TEMPLATE_PATH`, `QUARTERLY_TEMPLATE_PATH`, `DEFAULT_WEEKLY_DIR`, `DEFAULT_MONTHLY_DIR`, `DEFAULT_QUARTERLY_DIR`
- **In `daily_sync.py`**: `DB_PATH`, `TEMPLATE_PATH`, `ICLOUD_JOURNALSYNC_DIR`, `TRAINING_CACHE_PATH`, `LUNCH_WINDOW_BASE`, `REGULAR_DAY_END`

## Architecture

### Shared Utilities (`sync_utils.py`)
- **Formatting**: `format_minutes`, `format_minutes_seconds`, `ceil_minutes`, `round_half_up`, `format_training_ratio`, `format_mood_with_scale`, `format_percent_change`, `compute_percent_change`
- **Parsing**: `parse_frontmatter`, `parse_duration_to_minutes`, `parse_bool`, `extract_block`, `parse_study_table`, `parse_sleep_table`, `parse_daily_note`
- **Date utilities**: `daterange`, `iso_week_range`, `month_range`, `month_week_ranges`, `quarter_range`, `quarter_months`, `quarter_of_date`, `format_week_label`
- **Chart rendering**: `render_summary_table`, `render_monthly_chart`, `render_weekly_chart`, `render_training_frequency_grid`, `render_weekly_training_grid`, `wrap_code_block`
- **File handling**: `ensure_note`, `replace_metrics_block`, `ensure_section_with_divider`, `section_bounds`

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

### Weekly/Monthly Sync
- `build_weekly_metrics` / `build_monthly_metrics`: Generate aggregated metrics blocks
- Both import shared utilities from `sync_utils.py`
- Goals and Metrics are built as discrete blocks and spliced into existing notes (surgical updates), with atomic temp-file writes under `locked_note`

- `build_quarterly_metrics` (in `quarterly_sync.py`): Month-level aggregation into quarterly notes. Generates summary (this vs last quarter), study/sleep/mood monthly bars (3 columns), training per-month bars + percent table, and mirrors yearly + quarterly goals.

### Training Visualizations
Weekly and monthly notes use compact frequency grids to display training data:
- **Monthly grid**: Uses `■` (completed) and `·` (skipped) with week grouping, dynamically adjusts for 28-31 day months, shows inline counts like `(06/31)` with zero-padding
- **Weekly grid**: Uses `███` (completed) and `░░░` (skipped) for better visibility, shows inline counts like `(2/7)` without zero-padding
- Both formats include vertical bars (`│`) for visual consistency, separator lines, and day labels
- No legends or summary tables—visual patterns and inline counts make totals immediately apparent

Quarterly notes use per-month bar rows for workout and stretch (in a unified code block) plus a percent table; counts are right-aligned and zero-padded.

## Build, Test, and Run

- Requires Python 3.10+ on macOS with Flow and Obsidian installed; uses only stdlib.
- Run all syncs: `./sync_all.sh` (recommended; runs daily, weekly, and monthly in sequence)
- Run daily sync: `python3 daily_sync.py` (read-only to SQLite; writes the current day's note)
- Run weekly sync: `python3 weekly_sync.py [--date YYYY-MM-DD] [--file PATH]`
- Run monthly sync: `python3 monthly_sync.py [--month YYYY-MM] [--file PATH]`
- Quick syntax check: `python3 -m compileall daily_sync.py weekly_sync.py monthly_sync.py sync_utils.py`
- Goal carry-forward is ID-based (no guard files). Each goal line ends with a hidden block ID `^gid-xxxxxxxxxx` used for mirroring across daily/weekly/monthly notes.
- The training cache at `~/.cache/journal_sync/training_entries.json` stores workout/stretch entries for the current day to handle status files arriving across separate runs.

## LaunchAgent

All syncs (daily, weekly, monthly, quarterly) are triggered automatically via LaunchAgent at `~/Library/LaunchAgents/com.edo.journalsync.plist`:
- Runs `sync_all.sh` which executes daily, weekly, monthly, and quarterly syncs in sequence
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

- 4-space indentation, snake_case functions, UPPER_SNAKE constants at top.
- Private helper functions prefixed with `_` (e.g., `_build_study_section`, `_load_status_file`).
- Prefer f-strings; keep logic in small helpers.
- Use docstrings with concise intent; stay stdlib-only unless a new dependency is clearly justified.
- Preserve idempotency: table builders should yield stable output on consecutive runs.
- Shared utilities go in `sync_utils.py`; script-specific logic stays in respective scripts.

## Testing Guidelines

- No automated suite; test manually against a copy of the Flow database and a scratch Obsidian vault when possible.
- After changes, run the script twice and confirm the daily note remains stable (no duplicate rows) and preserves existing notes by start time.
- Validate edge cases: open sessions (no `completed_at`), missing JSON payloads, and dynamic lunch window shifting.
- Test weekly/monthly scripts with `--date` or `--month` flags to verify historical aggregation.
- For training visualizations: test with weeks/months containing zero training days, full training days, and mixed patterns to verify proper rendering.
- Verify formatting consistency: study SUM should always show `0h00m` (not `0m`), training counts should be zero-padded in monthly notes only (`06/31` vs `2/7`).

## Commit & Pull Request Guidelines

- Follow Conventional Commits (e.g., `feat: add lunch window override`) and wrap body lines at ~72 chars.
- Document environment assumptions (paths, defaults) in the PR description and list the manual commands you ran.
- Include before/after snippets of the generated markdown tables when behavior changes; note any impact on LaunchAgents/Shortcuts configurations.

## Security & Configuration Tips

- Paths point to personal data; avoid committing real journal files or iCloud payloads. Use redacted examples when sharing.
- Keep `DB_PATH` read-only; the script only reads SQLite but writes to the vault—test on copies to avoid accidental edits to your primary notes.
