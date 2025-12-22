# Repository Guidelines

This repository hosts a single automation script that syncs daily focus data from the Flow macOS app into an Obsidian vault, enriching the day's note with sessions, breaks, workouts, stretching, and sleep summaries. It also carries forward yesterday's incomplete Goals into today's note once per day.

## Project Structure & Data Flow
- `journal_sync.py`: main entry point; reads Flow CoreData at `DB_PATH`, merges break defaults from `defaults` CLI, pulls workout/stretch/sleep JSON from `~/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/JournalSync`, writes/updates today's markdown file in `JOURNAL_DIR`, and copies unfinished Goals from yesterday into today (idempotent + single run per day).
- `__pycache__/`: generated Python bytecode; safe to ignore.
- Configuration constants at top of script: `DB_PATH`, `JOURNAL_DIR`, `TEMPLATE_PATH`, `ICLOUD_JOURNALSYNC_DIR`, `TRAINING_CACHE_PATH`, `CARRY_FORWARD_GUARD_PATH`, `LUNCH_WINDOW_BASE`, `REGULAR_DAY_END`.

## Architecture
The script is organized into focused helper functions:
- **Goal management**: `_canonical_goal`, `_parse_goal_tasks_from_lines`, `_load_goals_for_date`, `_carry_forward_goals`, `_normalize_goals_section`
- **Section builders**: `_build_study_section`, `_build_training_section`, `_build_sleep_section`
- **Training data**: `_load_training_cache`, `_save_training_cache`, `_activity_entries_from_data`, `_merge_training_entries`, `_render_training_entries`, `_parse_training_table`
- **Status file handling**: `_load_status_file` (resilient iCloud sync with retry logic)
- **Frontmatter**: `_parse_frontmatter`, `_update_frontmatter`
- **Flow database**: `get_todays_sessions`, `dedupe_sessions`, `get_expected_break_minutes`
- **Main orchestrator**: `update_markdown`

## Build, Test, and Run
- Requires Python 3.10+ on macOS with Flow and Obsidian installed; uses only stdlib.
- Run once: `python3 journal_sync.py` (read-only to SQLite; writes the current day's note).
- Quick syntax check: `python3 -m compileall journal_sync.py`.
- The carry-forward guard at `~/.cache/journal_sync/carry_forward_goals.last_run` prevents re-importing yesterday's Goals more than once per day; delete it only if you need to re-run the carry-forward the same day.
- The training cache at `~/.cache/journal_sync/training_entries.json` stores workout/stretch entries for the current day to handle status files arriving across separate runs.
- Diagnostic log at `/tmp/journal_sync.log` records goal carry-forward events with timestamps.

## Coding Style & Naming Conventions
- 4-space indentation, snake_case functions, UPPER_SNAKE constants at top.
- Private helper functions prefixed with `_` (e.g., `_build_study_section`, `_load_status_file`).
- Prefer f-strings; keep logic in small helpers.
- Use docstrings with concise intent; stay stdlib-only unless a new dependency is clearly justified.
- Preserve idempotency: table builders should yield stable output on consecutive runs.

## Testing Guidelines
- No automated suite; test manually against a copy of the Flow database and a scratch Obsidian vault when possible.
- After changes, run the script twice and confirm the daily note remains stable (no duplicate rows) and preserves existing notes by start time.
- Validate edge cases: open sessions (no `completed_at`), missing JSON payloads, and dynamic lunch window shifting.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (e.g., `feat: add lunch window override`) and wrap body lines at ~72 chars.
- Document environment assumptions (paths, defaults) in the PR description and list the manual commands you ran.
- Include before/after snippets of the generated markdown tables when behavior changes; note any impact on LaunchAgents/Shortcuts configurations.

## Security & Configuration Tips
- Paths point to personal data; avoid committing real journal files or iCloud payloads. Use redacted examples when sharing.
- Keep `DB_PATH` read-only; the script only reads SQLite but writes to the vault—test on copies to avoid accidental edits to your primary notes.
