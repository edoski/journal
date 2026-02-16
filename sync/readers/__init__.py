"""
Reader modules for the journal sync system.

This package provides parsing functions that convert markdown content
into typed dataclass models.
"""

from __future__ import annotations

from .frontmatter import parse_frontmatter
from .daily import parse_daily_note
from .study import parse_study_table
from .sleep import parse_sleep_table
from .goals import parse_goal_tasks, resolve_deadline, parse_goal_date
from .media import scan_books, scan_podcasts
from .screen_time import parse_procrastination_table
from .schedule import load_schedule_rules


__all__ = [
    # Frontmatter
    "parse_frontmatter",
    # Study
    "parse_study_table",
    # Sleep
    "parse_sleep_table",
    # Daily aggregate
    "parse_daily_note",
    # Goals
    "parse_goal_tasks",
    "resolve_deadline",
    "parse_goal_date",
    # Media
    "scan_books",
    "scan_podcasts",
    # Screen time
    "parse_procrastination_table",
    # Schedule
    "load_schedule_rules",
]
