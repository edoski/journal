"""
Periodic review reminder generation for daily notes.

Generates review reminder goals for weekly, monthly, and yearly reviews
on their respective due dates (Sunday, last day of month, Dec 31).
"""
from __future__ import annotations

import calendar
import datetime
import hashlib


def generate_review_reminder_id(period_type: str, period_key: str) -> str:
    """
    Generate a deterministic hex-only goal ID for a review reminder.

    Uses SHA1 hash to produce a 10-character hex string compatible
    with the existing ^gid-{10 hex chars} format.

    Args:
        period_type: Type of review ("weekly", "monthly", "yearly")
        period_key: Period identifier (e.g., "2025-W52", "2025-12", "2025")

    Returns:
        Goal ID string like "gid-a3f4b2c1d0"
    """
    base = f"review|{period_type}|{period_key}"
    digest = hashlib.sha1(base.encode()).hexdigest()[:10]
    return f"gid-{digest}"


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
        date_str = date.isoformat()
        reminders.append({
            "body": f"Review [[{period_key}]]",
            "date_str": date_str,
            "deadline": date,
            "reminder_offset": 0,
            "id": generate_review_reminder_id("weekly", period_key),
            "done": False,
        })

    # Monthly review: due on last day of month
    _, last_day = calendar.monthrange(date.year, date.month)
    if date.day == last_day:
        period_key = f"{date.year}-{date.month:02d}"
        date_str = date.isoformat()
        reminders.append({
            "body": f"Review [[{period_key}]]",
            "date_str": date_str,
            "deadline": date,
            "reminder_offset": 0,
            "id": generate_review_reminder_id("monthly", period_key),
            "done": False,
        })

    # Yearly review: due on December 31
    if date.month == 12 and date.day == 31:
        period_key = str(date.year)
        date_str = date.isoformat()
        reminders.append({
            "body": f"Review [[{period_key}]]",
            "date_str": date_str,
            "deadline": date,
            "reminder_offset": 0,
            "id": generate_review_reminder_id("yearly", period_key),
            "done": False,
        })

    return reminders
