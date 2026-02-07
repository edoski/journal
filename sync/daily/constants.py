"""
Constants for the daily sync module.

Contains daily-note orchestration paths and context-tracking configuration.
"""

from __future__ import annotations

from sync.config import PATHS

# iCloud paths for Shortcuts status files
ICLOUD_SHORTCUTS_DIR = PATHS.icloud_shortcuts_dir
ICLOUD_JOURNALSYNC_DIR = PATHS.icloud_journalsync_dir

# Daily note template path
TEMPLATE_PATH = PATHS.daily_template_path

# Context tracking: directories to exclude from file modification tracking
# (relative to vault root, with trailing slash for directories)
CONTEXT_EXCLUDED_DIRS = (
    "journal/",
    ".obsidian/",
    "excalidraw/",
)

# Buffer minutes after session end to still attribute a file modification
# to that session (accounts for saves shortly after timer stops)
CONTEXT_SESSION_BUFFER_MINUTES = 0

# Files to exclude from context tracking (AI/meta files)
CONTEXT_EXCLUDED_FILES = (
    "GEMINI",
    "AGENTS",
    "PROTOCOL",
    "TODO",
)
