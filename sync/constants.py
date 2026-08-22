"""
Constants for the journal sync system.

Contains directory paths, template paths, and rendering labels.
"""

from __future__ import annotations

from sync.config import PATHS

# Directory paths
JOURNAL_DIR = PATHS.journal_dir
VAULT_DIR = PATHS.vault_dir
BOOKS_DIR = PATHS.books_dir
PODCASTS_DIR = PATHS.podcasts_dir

# Template paths
DAILY_TEMPLATE_PATH = PATHS.daily_template_path
WEEKLY_TEMPLATE_PATH = PATHS.weekly_template_path
MONTHLY_TEMPLATE_PATH = PATHS.monthly_template_path
YEARLY_TEMPLATE_PATH = PATHS.yearly_template_path

SCHEDULE_PATH = PATHS.schedule_path
BSC_GRADES_PATH = PATHS.bsc_grades_path
MSC_GRADES_PATH = PATHS.msc_grades_path

# State and cache directories
APPLICATION_SUPPORT_DIR = PATHS.application_support_dir
STATE_DIR = PATHS.state_dir
MEDIA_CACHE_DIR = PATHS.media_cache_dir
DAILY_STATE_DIR = PATHS.daily_state_dir
TRAINING_STATE_DIR = PATHS.daily_training_state_dir

# Lock directory
LOCK_DIR = PATHS.lock_dir

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

# Reader table/section markers
TRAINING_SECTION_HEADER = "### **TRAINING**"
STUDY_SECTION_HEADER = "### **STUDY**"
SLEEP_SECTION_HEADER = "### **SLEEP**"
TRAINING_TABLE_HEADER_RE = r"\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*DURATION\s*\|"
NO_TRAINING_SESSIONS_TOKEN = "no training sessions"
