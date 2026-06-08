"""
Constants for the daily sync module.

Contains daily-note orchestration paths.
"""

from __future__ import annotations

from sync.config import PATHS

# iCloud paths for Shortcuts status files
ICLOUD_SHORTCUTS_DIR = PATHS.icloud_shortcuts_dir
ICLOUD_JOURNALSYNC_DIR = PATHS.icloud_journalsync_dir

# Daily note template path
TEMPLATE_PATH = PATHS.daily_template_path
