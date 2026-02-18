"""
Goal rendering for the journal sync system.
"""

from __future__ import annotations

import datetime

from sync.goals.identity import generate_goal_id
from sync.contracts.goals import Goal


def format_countdown(
    deadline: datetime.date | None,
    today: datetime.date,
    is_done: bool,
) -> str:
    """
    Format countdown string for a goal.

    Args:
        deadline: The goal's deadline date (or None if no deadline)
        today: Current date for comparison
        is_done: Whether the goal is completed

    Returns:
        Formatted countdown string like "— `43d`", "— `TODAY`", "— `LATE +5d`"
        Returns empty string if no deadline or goal is done.
    """
    if deadline is None or is_done:
        return ""

    days_left = (deadline - today).days

    if days_left > 0:
        return f"— `{days_left}d`"
    elif days_left == 0:
        return "— `TODAY`"
    else:
        return f"— `LATE +{-days_left}d`"


def _format_reminder_offset(days: int) -> str:
    """Convert reminder offset days back to shortest human-readable format."""
    if days % 90 == 0 and days >= 90:
        return f"!{days // 90}q"
    if days % 30 == 0 and days >= 30:
        return f"!{days // 30}m"
    if days % 7 == 0 and days >= 7:
        return f"!{days // 7}w"
    return f"!{days}d"


def render_goal_lines(
    goals: list[Goal],
    today: datetime.date | None = None,
) -> list[str]:
    """
    Render Goal dataclasses back to markdown checkbox lines.

    Args:
        goals: List of Goal dataclasses
        today: Current date for countdown calculation (if None, no countdowns)

    Returns:
        List of rendered markdown checkbox lines
    """
    rendered: list[str] = []
    for goal in goals:
        mark = "x" if goal.done else " "
        body = goal.body.strip()
        gid = goal.id or generate_goal_id()

        # Include date ONLY in source notes (when today is None)
        # Mirror notes (today provided) show countdown only
        if goal.date_str and today is None:
            if goal.reminder_offset:
                offset_str = _format_reminder_offset(goal.reminder_offset)
                body = f"{body} `{goal.date_str} {offset_str}`"
            else:
                body = f"{body} `{goal.date_str}`"

        # Add countdown if today is provided and goal has a deadline
        countdown = format_countdown(goal.deadline, today, goal.done) if today else ""

        if countdown:
            rendered.append(f"- [{mark}] {body} {countdown} ^{gid}")
        else:
            rendered.append(f"- [{mark}] {body} ^{gid}")

    return rendered


def build_goals_block(subsections: list[tuple[str, list[str]]]) -> list[str]:
    """
    Render a complete Goals block given ordered subsections.

    Args:
        subsections: List of (title, tasks_lines) where tasks_lines are already
                     rendered checkbox lines (not parsed tasks).

    Returns:
        List of markdown lines for the complete Goals section
    """
    lines = ["## Goals", "---"]
    for title, task_lines in subsections:
        lines.append(f"### **{title}**")
        if task_lines:
            lines.extend(task_lines)
        lines.append("")
    if not subsections:
        lines.append("")
    return lines
