"""
Periodic review reminder generation for daily notes.

Generates review reminder goals for weekly, monthly, and yearly reviews
on their respective due dates (Sunday, last day of month, Dec 31).
"""

from __future__ import annotations

import calendar
import datetime

from sync.goal_identity import generate_goal_id_for
from sync.models import Goal


def get_periodic_reminders_for_date(date: datetime.date) -> list[Goal]:
    """
    Generate periodic maintenance reminder Goals for the given date.

    Current periodic reminders:
    - Restart MacBook: Every 2 weeks on odd ISO weeks (Sundays)

    Args:
        date: Date to check for due periodic reminders

    Returns:
        List of Goal objects for periodic reminders due on that date (may be empty)
    """
    reminders: list[Goal] = []

    # Bi-weekly restart: Sunday of odd ISO weeks
    # (ISO week 1, 3, 5, ... gives every-other-Sunday cadence)
    year, week_num, weekday = date.isocalendar()
    if weekday == 7 and week_num % 2 == 1:  # Sunday = ISO weekday 7, odd weeks
        body = "Restart MacBook"
        reminders.append(
            Goal(
                id=generate_goal_id_for("periodic", "restart-macbook", body, 0),
                body=body,
                done=False,
                date_str=date.isoformat(),
                deadline=date,
                reminder_offset=0,
            )
        )

    return reminders


def get_review_reminders_for_date(date: datetime.date) -> list[Goal]:
    """
    Generate review reminder Goals for reviews due on the given date.

    Reviews are due on:
    - Weekly: Sunday (last day of ISO week)
    - Monthly: Last day of month
    - Yearly: December 31

    Args:
        date: Date to check for due reviews

    Returns:
        List of Goal objects for reviews due on that date (may be empty)
    """
    reminders: list[Goal] = []

    # Weekly review: due on Sunday (weekday 6 in Python, day 7 in ISO)
    if date.weekday() == 6:  # Sunday
        year, week_num, _ = date.isocalendar()
        period_key = f"{year}-W{week_num:02d}"
        body = f"Review [[{period_key}]] + Goals"
        reminders.append(
            Goal(
                id=generate_goal_id_for("review", period_key, body, 0),
                body=body,
                done=False,
                date_str=date.isoformat(),
                deadline=date,
                reminder_offset=0,
            )
        )

    # Monthly review: due on last day of month
    _, last_day = calendar.monthrange(date.year, date.month)
    if date.day == last_day:
        period_key = f"{date.year}-{date.month:02d}"
        body = f"Review [[{period_key}]] + Goals"
        reminders.append(
            Goal(
                id=generate_goal_id_for("review", period_key, body, 0),
                body=body,
                done=False,
                date_str=date.isoformat(),
                deadline=date,
                reminder_offset=0,
            )
        )

    # Yearly review: due on December 31
    if date.month == 12 and date.day == 31:
        period_key = str(date.year)
        body = f"Review [[{period_key}]] + Goals"
        reminders.append(
            Goal(
                id=generate_goal_id_for("review", period_key, body, 0),
                body=body,
                done=False,
                date_str=date.isoformat(),
                deadline=date,
                reminder_offset=0,
            )
        )

    return reminders
