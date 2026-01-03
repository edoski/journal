"""
Constants for the journal sync system.

Contains directory paths, template paths, study intensity thresholds,
symbols for rendering, and chart dimension constants.
"""

from __future__ import annotations

import os

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

# Default directories (can be overridden via environment)
DEFAULT_WEEKLY_DIR = os.environ.get("WEEKLY_DIR", JOURNAL_DIR)
DEFAULT_MONTHLY_DIR = os.environ.get("MONTHLY_DIR", JOURNAL_DIR)
DEFAULT_QUARTERLY_DIR = os.environ.get("QUARTERLY_DIR", JOURNAL_DIR)
DEFAULT_YEARLY_DIR = os.environ.get("YEARLY_DIR", JOURNAL_DIR)

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

# Symbols for study intensity (binary default; yearly overrides with partial)
STUDY_SYMBOL_DEEP = "█"  # target met
STUDY_SYMBOL_NONE = "·"  # target not met or no study
STUDY_LEGEND_LINE = "1 POMODORO = 90m → █ ≥ 4 POM. | · < 4 POM."
YEARLY_STUDY_LEGEND_LINE = (
    "1 POMODORO = 90m → █ all days ≥ 4 POM | ░ some days | · none"
)

# Chart dimension constants
CHART_HEIGHT_DEFAULT = 10
CHART_HEIGHT_QUARTERLY = 12
CHART_HEIGHT_YEARLY = 12
CHART_Y_MAX_WEEKLY_STUDY = 10  # 10 hours
CHART_Y_MAX_MONTHLY_STUDY = 40  # 40 hours per week
CHART_Y_MAX_QUARTERLY_STUDY = 240  # 240 hours per month
CHART_Y_MAX_YEARLY_STUDY = 720  # 720 hours per quarter

# Ideal targets (weekly base values)
IDEAL_STUDY_MINUTES_DAILY = 360  # 6h/day
IDEAL_SLEEP_MINUTES_NIGHTLY = 480  # 8h/night
IDEAL_WORKOUT_WEEKLY = 7  # 7/7 days
IDEAL_STRETCH_WEEKLY = 7  # 7/7 days

# Progress bar settings
IDEAL_PROGRESS_BAR_WIDTH = 30
IDEAL_PROGRESS_FILLED = "█"
IDEAL_PROGRESS_EMPTY = "░"
