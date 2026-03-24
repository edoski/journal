"""Canonical goal note read/write helpers."""

from __future__ import annotations

import datetime

from sync.contracts.goals import Goal
from sync.notes.sections import (
    extract_subsection_tasks,
    goals_section_bounds,
    splice_goals_section,
)
from sync.readers.goals import ensure_goal_ids
from sync.writers.goals import build_goals_block, render_goal_lines

EMPTY_SUBSECTION_MESSAGES: dict[str, str] = {
    "DAILY": "_No daily goals have been defined yet._",
    "WEEKLY": "_No weekly goals have been defined yet._",
    "MONTHLY": "_No monthly goals have been defined yet._",
    "QUARTERLY": "_No quarterly goals have been defined yet._",
    "YEARLY": "_No yearly goals have been defined yet._",
}


def empty_subsection_lines(subsection: str) -> list[str]:
    """Return canonical placeholder lines for an empty goal subsection."""
    message = EMPTY_SUBSECTION_MESSAGES.get(
        subsection.upper(), "_No goals have been defined yet._"
    )
    return ["", message]


def extract_goals(
    lines: list[str],
    subsection: str,
    *,
    horizon: str | None = None,
    period_key: str | None = None,
) -> list[Goal]:
    """Extract tasks from a goals subsection with optional ID normalization."""
    g_start, g_end = goals_section_bounds(lines)
    tasks = extract_subsection_tasks(lines, g_start, g_end, subsection)
    if horizon and period_key:
        tasks = ensure_goal_ids(tasks, horizon, period_key)
    return tasks


def render_goals_or_empty(
    subsection: str,
    goals: list[Goal],
    *,
    today: datetime.date | None = None,
) -> list[str]:
    """Render goals for a subsection, or canonical placeholder when empty."""
    if goals:
        return render_goal_lines(goals, today=today)
    return empty_subsection_lines(subsection)


def apply_goals_sections(
    lines: list[str],
    sections: list[tuple[str, list[str]]],
    *,
    insert_if_missing: bool = True,
) -> list[str]:
    """Return updated note lines with a rebuilt Goals block."""
    updated = lines[:]
    new_block = build_goals_block(sections)
    splice_goals_section(updated, new_block, insert_if_missing=insert_if_missing)
    return updated
