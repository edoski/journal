"""
Goal rendering for the journal sync system.
"""

from __future__ import annotations

import datetime
import uuid

from sync.models import Goal


def generate_goal_id() -> str:
    """Return a short goal id (gid-xxxxxxxxxx)."""
    return f"gid-{uuid.uuid4().hex[:10]}"


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

        # Add countdown if today is provided and goal has a deadline
        countdown = ""
        if today is not None:
            countdown = format_countdown(goal.deadline, today, goal.done)

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
    for idx, (title, task_lines) in enumerate(subsections):
        lines.append(f"### **{title}**")
        if task_lines:
            lines.extend(task_lines)
        if idx != len(subsections) - 1:
            lines.append("")
    # Ensure a blank line after the Goals block
    if lines and lines[-1].strip() != "":
        lines.append("")
    return lines
