"""
Periodic review reminder generation for daily notes.

Generates review reminder goals for weekly, monthly, and yearly reviews
on their respective due dates (Sunday, last day of month, Dec 31).
"""

from __future__ import annotations

import calendar
import datetime

from sync.readers.goals import generate_goal_id_for


def get_review_reminders_for_date(date: datetime.date) -> list[dict]:
    """
    Generate review reminder task dicts for reviews due on the given date.

    Reviews are due on:
    - Weekly: Sunday (last day of ISO week)
    - Monthly: Last day of month
    - Yearly: December 31

    Each returned dict contains:
    - body: e.g., "Review [[2025-W52]]"
    - date_str: The due date in YYYY-MM-DD format
    - deadline: Resolved deadline as date object
    - id: Deterministic hex goal ID
    - done: False

    Args:
        date: Date to check for due reviews

    Returns:
        List of task dicts for reviews due on that date (may be empty)
    """
    reminders: list[dict] = []

    # Weekly review: due on Sunday (weekday 6 in Python, day 7 in ISO)
    if date.weekday() == 6:  # Sunday
        year, week_num, _ = date.isocalendar()
        period_key = f"{year}-W{week_num:02d}"
        body = f"Review [[{period_key}]]"
        reminders.append(
            {
                "body": body,
                "date_str": date.isoformat(),
                "deadline": date,
                "reminder_offset": 0,
                "id": generate_goal_id_for("review", period_key, body, 0),
                "done": False,
            }
        )

    # Monthly review: due on last day of month
    _, last_day = calendar.monthrange(date.year, date.month)
    if date.day == last_day:
        period_key = f"{date.year}-{date.month:02d}"
        body = f"Review [[{period_key}]]"
        reminders.append(
            {
                "body": body,
                "date_str": date.isoformat(),
                "deadline": date,
                "reminder_offset": 0,
                "id": generate_goal_id_for("review", period_key, body, 0),
                "done": False,
            }
        )

    # Yearly review: due on December 31
    if date.month == 12 and date.day == 31:
        period_key = str(date.year)
        body = f"Review [[{period_key}]]"
        reminders.append(
            {
                "body": body,
                "date_str": date.isoformat(),
                "deadline": date,
                "reminder_offset": 0,
                "id": generate_goal_id_for("review", period_key, body, 0),
                "done": False,
            }
        )

    return reminders
