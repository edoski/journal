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

# Cache directories
JOURNAL_CACHE_DIR = PATHS.journal_cache_dir
MEDIA_CACHE_DIR = PATHS.media_cache_dir
DAILY_CACHE_DIR = PATHS.daily_cache_dir
TRAINING_CACHE_DIR = PATHS.daily_training_cache_dir

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

# Reader table/section markers
TRAINING_SECTION_HEADER = "### **TRAINING**"
STUDY_SECTION_HEADER = "### **STUDY**"
SLEEP_SECTION_HEADER = "### **SLEEP**"
TRAINING_TABLE_HEADER_RE = r"\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*DURATION\s*\|"
NO_TRAINING_SESSIONS_TOKEN = "no training sessions"
