"""
Constants for the journal sync system.

Contains directory paths, template paths, study intensity thresholds,
symbols for rendering, and chart dimension constants.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# Directory paths
JOURNAL_DIR = "/Users/edo/Documents/Obsidian/the-vault/journal"
VAULT_DIR = "/Users/edo/Documents/Obsidian/the-vault"
BOOKS_DIR = "/Users/edo/Documents/Obsidian/the-vault/notes/books"
PODCASTS_DIR = "/Users/edo/Documents/Obsidian/the-vault/notes/podcasts"

# Template paths
WEEKLY_TEMPLATE_PATH = (
    "/Users/edo/Documents/Obsidian/the-vault/notes/templates/weekly.md"
)
MONTHLY_TEMPLATE_PATH = (
    "/Users/edo/Documents/Obsidian/the-vault/notes/templates/monthly.md"
)
QUARTERLY_TEMPLATE_PATH = (
    "/Users/edo/Documents/Obsidian/the-vault/notes/templates/quarterly.md"
)
YEARLY_TEMPLATE_PATH = (
    "/Users/edo/Documents/Obsidian/the-vault/notes/templates/yearly.md"
)

# Lock directory for note writes
LOCK_DIR = os.path.expanduser("~/.cache/journal/locks")

# Cache file for tracking carried-forward goal IDs
CARRIED_GOALS_PATH = os.path.expanduser("~/.cache/journal/carried_goals.json")

# Day and month labels
DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
MONTH_ABBR = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
]

# Study intensity thresholds (minutes)
STUDY_TARGET_MIN = 360  # 4 pomodoros (4 * 90m) – daily target threshold


# ─────────────────────────────────────────────────────────────────────────────
# Configuration Dataclasses
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class IdealSchedule:
    """Ideal daily/weekly targets for tracking schedule adherence."""

    study_start_hour: int = 8  # 8:00 AM
    workout_start_hour: int = 18  # 6:00 PM
    study_minutes_daily: int = 360  # 6h/day
    sleep_minutes_nightly: int = 480  # 8h/night
    workout_days_weekly: int = 6  # 6/7
    stretch_days_weekly: int = 7  # 7/7
    mood_target: float = 6.0  # 6.0/10


@dataclass(frozen=True)
class ChartConfig:
    """Chart dimension constants for bar charts and grids."""

    height_default: int = 10
    height_quarterly: int = 12
    height_yearly: int = 12
    y_max_weekly_study: int = 10  # 10 hours
    y_max_monthly_study: int = 40  # 40 hours/week
    y_max_quarterly_study: int = 240  # 240 hours/month
    y_max_yearly_study: int = 720  # 720 hours/quarter


@dataclass(frozen=True)
class RenderConfig:
    """Rendering symbols and progress bar settings."""

    progress_bar_width: int = 25
    progress_filled: str = "█"
    progress_empty: str = "░"
    study_symbol_deep: str = "█"  # target met
    study_symbol_none: str = "·"  # target not met
    study_legend: str = "1 POMODORO = 90m | █ ≥ 4 POM. | · < 4 POM."
    yearly_study_legend: str = (
        "1 POMODORO = 90m | █ all days ≥ 4 POM | ░ some days | · none"
    )


@dataclass(frozen=True)
class ScreenTimeConfig:
    """Screen time grouping thresholds."""

    min_minutes: int = 10  # Apps < 10 min → Miscellaneous
    percent_threshold: float = 0.05  # Apps ≤ 5% → Miscellaneous
    misc_label: str = "Miscellaneous"


# Singleton instances
IDEAL = IdealSchedule()
CHART = ChartConfig()
RENDER = RenderConfig()
SCREEN_TIME = ScreenTimeConfig()
