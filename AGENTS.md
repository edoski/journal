# Repository Guidelines

This repository hosts a single automation script that syncs daily focus data from the Flow macOS app into an Obsidian vault, enriching the day’s note with sessions, breaks, workouts, stretching, and sleep summaries.

## Project Structure & Data Flow
- `journal_sync.py`: main entry point; reads Flow CoreData at `DB_PATH`, merges break defaults from `defaults` CLI, pulls workout/stretch/sleep JSON from `~/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/JournalSync`, and writes/updates today’s markdown file in `JOURNAL_DIR`.
- `__pycache__/`: generated Python bytecode; safe to ignore.
- Configuration: tune `DB_PATH`, `JOURNAL_DIR`, `RUN_GUARD_PATH`, and env vars `LOG_SYNC_BREAK_GAP_CAP` (seconds) and `LOG_SYNC_LUNCH_WINDOW` (`HH:MM-HH:MM` or `off`).

## Build, Test, and Run
- Requires Python 3.10+ on macOS with Flow and Obsidian installed; uses only stdlib.
- Run once: `python3 journal_sync.py` (read-only to SQLite; writes the current day’s note).
- Override timings: `LOG_SYNC_BREAK_GAP_CAP=120 LOG_SYNC_LUNCH_WINDOW="13:00-14:30" python3 journal_sync.py`.
- Quick syntax check: `python3 -m compileall journal_sync.py`.
- The run guard at `/tmp/journal_sync.last_run` prevents rapid re-entry; delete it if you intentionally need back-to-back runs.

## Coding Style & Naming Conventions
- 4-space indentation, snake_case functions, UPPER_SNAKE constants at top.
- Prefer f-strings; keep logic in small helpers (see `_read_lunch_window`, `dedupe_sessions`, `activity_entries_from_data`).
- Use docstrings with concise intent; stay stdlib-only unless a new dependency is clearly justified.
- Preserve idempotency: table builders should yield stable output on consecutive runs.

## Testing Guidelines
- No automated suite; test manually against a copy of the Flow database and a scratch Obsidian vault when possible.
- After changes, run the script twice and confirm the daily note remains stable (no duplicate rows) and preserves existing notes by start time.
- Validate edge cases: open sessions (no `completed_at`), missing JSON payloads, and lunch/break overrides.

## Commit & Pull Request Guidelines
- No prior history here; follow Conventional Commits (e.g., `feat: add lunch window override`) and wrap body lines at ~72 chars.
- Document environment assumptions (paths, defaults) in the PR description and list the manual commands you ran.
- Include before/after snippets of the generated markdown tables when behavior changes; note any impact on LaunchAgents/Shortcuts configurations.

## Security & Configuration Tips
- Paths point to personal data; avoid committing real journal files or iCloud payloads. Use redacted examples when sharing.
- Keep `DB_PATH` read-only; the script only reads SQLite but writes to the vault—test on copies to avoid accidental edits to your primary notes.
