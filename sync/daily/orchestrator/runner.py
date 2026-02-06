"""Main orchestration logic for daily sync."""

from __future__ import annotations

import datetime
import os

from sync.constants import JOURNAL_DIR
from sync.logging import get_logger
from sync.notes.locking import locked_note
from sync.study.db import SessionDict

from ..context import (
    files_for_session,
    format_context_cell,
    get_vault_files_modified_on_date,
)
from .frontmatter import update_frontmatter
from .goal_pipeline import apply_goals_section
from .metrics_pipeline import apply_metrics_block, build_study_data
from .note_io import ensure_daily_sections, find_yaml_end, read_daily_note

logger = get_logger()


def update_markdown(sessions: list[SessionDict]) -> bool | None:
    """
    Update the daily markdown note with session data, goals, and metrics.

    This is the main orchestration function that:
    1. Reads or creates the daily note
    2. Ensures required sections exist
    3. Updates goals (carrying forward from yesterday, syncing with weekly)
    4. Updates metrics (study, training, sleep)
    5. Updates frontmatter
    6. Writes atomically

    Args:
        sessions: List of enriched session dictionaries from get_todays_sessions()

    Returns:
        True if note was updated, False if no changes, None on error
    """
    today = datetime.datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")
    file_path = os.path.join(JOURNAL_DIR, f"{today_str}.md")

    lines = read_daily_note(file_path)
    if not lines:
        return None

    # Discover files modified today for context tracking
    vault_files = get_vault_files_modified_on_date(today)

    def context_callback(session_start, session_end) -> str:
        """Get formatted context string for a session."""
        wikilinks = files_for_session(vault_files, session_start, session_end)
        return format_context_cell(wikilinks)

    # Build study table (also computes focus_minutes on sessions)
    new_table_lines, study_str = build_study_data(lines, sessions, context_callback)

    yaml_end_idx = find_yaml_end(lines)

    # Preserve divider after top-level sections and enforce presence
    ensure_daily_sections(lines, yaml_end_idx)

    apply_goals_section(lines, today, file_path, yaml_end_idx)

    metrics_result = apply_metrics_block(lines, sessions, today_str, new_table_lines)

    # Update YAML frontmatter and capture what changed
    updated_lines, fm_changes = update_frontmatter(
        metrics_result.updated_lines,
        study_str,
        metrics_result.workout_done,
        metrics_result.stretch_done,
        metrics_result.meditate_done,
        metrics_result.sleep_data,
    )

    new_content = "\n".join(updated_lines)

    with locked_note(file_path):
        try:
            with open(file_path, "r") as f:
                current_content = f.read()
        except FileNotFoundError:
            current_content = ""

        if new_content.strip() == current_content.strip():
            return False

        tmp_path = file_path + ".tmp"
        with open(tmp_path, "w") as f:
            f.write(new_content)
        os.replace(tmp_path, file_path)

    # Log only the metrics that changed
    if fm_changes:
        parts = []
        for key in ("study", "meditate", "workout", "stretch", "sleep"):
            if key in fm_changes:
                val = fm_changes[key]
                # Use checkmark for boolean flags
                if val == "true":
                    parts.append(f"{key}=✓")
                elif val == "false":
                    continue  # Don't log false transitions
                else:
                    parts.append(f"{key}={val}")
        if parts:
            logger.info("Updated %s — %s", today_str + ".md", ", ".join(parts))
        else:
            logger.info("Updated %s", today_str + ".md")
    else:
        logger.info("Updated %s", today_str + ".md")

    return True
