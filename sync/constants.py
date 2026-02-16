"""
Constants for the journal sync system.

Contains directory paths, template paths, study intensity thresholds,
symbols for rendering, and chart dimension constants.
"""

from __future__ import annotations

from dataclasses import dataclass

from sync.config import PATHS

# Directory paths
JOURNAL_DIR = PATHS.journal_dir
VAULT_DIR = PATHS.vault_dir
BOOKS_DIR = PATHS.books_dir
PODCASTS_DIR = PATHS.podcasts_dir

# Template paths
WEEKLY_TEMPLATE_PATH = PATHS.weekly_template_path
MONTHLY_TEMPLATE_PATH = PATHS.monthly_template_path
QUARTERLY_TEMPLATE_PATH = PATHS.quarterly_template_path
YEARLY_TEMPLATE_PATH = PATHS.yearly_template_path

# Reminder rules markdown path (required, user-managed)
REMINDERS_PATH = PATHS.reminders_path
SCHEDULE_PATH = PATHS.schedule_path

# Cache directories
JOURNAL_CACHE_DIR = PATHS.journal_cache_dir
GOAL_CACHE_DIR = PATHS.goal_cache_dir
MEDIA_CACHE_DIR = PATHS.media_cache_dir
DAILY_CACHE_DIR = PATHS.daily_cache_dir
TRAINING_CACHE_DIR = PATHS.daily_training_cache_dir
SCREEN_TIME_CACHE_DIR = PATHS.daily_screen_time_cache_dir

# Lock directories
LOCK_DIR = PATHS.lock_dir
NOTE_LOCK_DIR = PATHS.note_lock_dir
STATE_LOCK_DIR = PATHS.state_lock_dir

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

    study_minutes_daily: int = 360  # 6h/day
    sleep_minutes_nightly: int = 480  # 8h/night
    workout_days_weekly: int = 7  # 7/7
    stretch_days_weekly: int = 7  # 7/7
    mindful_days_weekly: int = 7  # 7/7 daily meditation target
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
