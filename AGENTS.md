# Repository Guidelines

This repository hosts automation scripts that sync daily focus data from the Flow macOS app into an Obsidian vault, generate weekly and monthly aggregated metrics, and carry forward incomplete Goals between days.

## Project Structure & Data Flow

```
journal/
  sync_utils.py      # Shared utilities for all sync scripts
  daily_sync.py      # Daily sync (Flow sessions, training, sleep, goals)
  weekly_sync.py     # Weekly metrics aggregation
  monthly_sync.py    # Monthly metrics aggregation
  sync_all.sh        # Wrapper script that runs all syncs (called by LaunchAgent)
  AGENTS.md          # This file
  __pycache__/       # Generated Python bytecode; safe to ignore
```

### Scripts Overview

- **`sync_utils.py`**: Shared utilities including constants (`JOURNAL_DIR`, template paths), formatting helpers (`format_minutes`, `format_minutes_seconds`, `ceil_minutes`, `round_half_up`), frontmatter/block parsing, date range utilities, and chart rendering functions.

- **`daily_sync.py`**: Main entry point for daily syncing; reads Flow CoreData at `DB_PATH`, merges break defaults from `defaults` CLI, pulls workout/stretch/sleep JSON from `~/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/JournalSync`, writes/updates today's markdown file in `JOURNAL_DIR`, and copies unfinished Goals from yesterday into today (idempotent + single run per day).

- **`weekly_sync.py`**: Aggregates daily notes into weekly metrics (study time, sleep, mood, training) with charts and summary tables.

- **`monthly_sync.py`**: Aggregates daily notes into monthly metrics with weekly breakdowns.

- **`sync_all.sh`**: Wrapper script that runs daily, weekly, and monthly syncs in sequence. Called by the LaunchAgent to keep all notes fresh.

### Configuration Constants

- **In `sync_utils.py`**: `JOURNAL_DIR`, `VAULT_DIR`, `WEEKLY_TEMPLATE_PATH`, `MONTHLY_TEMPLATE_PATH`, `DEFAULT_WEEKLY_DIR`, `DEFAULT_MONTHLY_DIR`
- **In `daily_sync.py`**: `DB_PATH`, `TEMPLATE_PATH`, `ICLOUD_JOURNALSYNC_DIR`, `TRAINING_CACHE_PATH`, `CARRY_FORWARD_GUARD_PATH`, `LUNCH_WINDOW_BASE`, `REGULAR_DAY_END`

## Architecture

### Shared Utilities (`sync_utils.py`)
- **Formatting**: `format_minutes`, `format_minutes_seconds`, `format_hours_value`, `format_mood_value`, `ceil_minutes`, `round_half_up`
- **Parsing**: `parse_frontmatter`, `parse_duration_to_minutes`, `parse_bool`, `extract_block`, `parse_study_table`, `parse_sleep_table`, `parse_daily_note`
- **Date utilities**: `daterange`, `iso_week_range`, `month_range`, `month_week_ranges`, `format_week_label`
- **Rendering**: `render_summary_block`, `render_vertical_chart`, `wrap_code_block`
- **File handling**: `ensure_note`, `replace_metrics_block`

### Daily Sync (`daily_sync.py`)
- **Goal management**: `_canonical_goal`, `_parse_goal_tasks_from_lines`, `_load_goals_for_date`, `_carry_forward_goals`, `_normalize_goals_section`
- **Section builders**: `_build_study_section`, `_build_training_section`, `_build_sleep_section`
- **Training data**: `_load_training_cache`, `_save_training_cache`, `_activity_entries_from_data`, `_merge_training_entries`, `_render_training_entries`, `_parse_training_table`
- **Status file handling**: `_load_status_file` (resilient iCloud sync with retry logic)
- **Frontmatter**: `_parse_frontmatter`, `_update_frontmatter`
- **Flow database**: `get_todays_sessions`, `dedupe_sessions`, `get_expected_break_minutes`
- **Main orchestrator**: `update_markdown`

### Weekly/Monthly Sync
- `build_weekly_metrics` / `build_monthly_metrics`: Generate aggregated metrics blocks
- Both import shared utilities from `sync_utils.py`

## Build, Test, and Run

- Requires Python 3.10+ on macOS with Flow and Obsidian installed; uses only stdlib.
- Run all syncs: `./sync_all.sh` (recommended; runs daily, weekly, and monthly in sequence)
- Run daily sync: `python3 daily_sync.py` (read-only to SQLite; writes the current day's note)
- Run weekly sync: `python3 weekly_sync.py [--date YYYY-MM-DD] [--file PATH]`
- Run monthly sync: `python3 monthly_sync.py [--month YYYY-MM] [--file PATH]`
- Quick syntax check: `python3 -m compileall daily_sync.py weekly_sync.py monthly_sync.py sync_utils.py`
- The carry-forward guard at `~/.cache/journal_sync/carry_forward_goals.last_run` prevents re-importing yesterday's Goals more than once per day; delete it only if you need to re-run the carry-forward the same day.
- The training cache at `~/.cache/journal_sync/training_entries.json` stores workout/stretch entries for the current day to handle status files arriving across separate runs.
- Diagnostic log at `/tmp/journal_sync.log` records goal carry-forward events with timestamps.

## LaunchAgent

All syncs (daily, weekly, monthly) are triggered automatically via LaunchAgent at `~/Library/LaunchAgents/com.edo.journalsync.plist`:
- Runs `sync_all.sh` which executes daily, weekly, and monthly syncs in sequence
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

## Commit & Pull Request Guidelines

- Follow Conventional Commits (e.g., `feat: add lunch window override`) and wrap body lines at ~72 chars.
- Document environment assumptions (paths, defaults) in the PR description and list the manual commands you ran.
- Include before/after snippets of the generated markdown tables when behavior changes; note any impact on LaunchAgents/Shortcuts configurations.

## Security & Configuration Tips

- Paths point to personal data; avoid committing real journal files or iCloud payloads. Use redacted examples when sharing.
- Keep `DB_PATH` read-only; the script only reads SQLite but writes to the vault—test on copies to avoid accidental edits to your primary notes.
