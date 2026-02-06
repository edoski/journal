"""
Constants for the daily sync module.

Contains daily-note orchestration paths and context-tracking configuration.
"""

from __future__ import annotations

import os

# iCloud paths for Shortcuts status files
ICLOUD_SHORTCUTS_DIR = (
    "/Users/edo/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents"
)
ICLOUD_JOURNALSYNC_DIR = os.path.join(ICLOUD_SHORTCUTS_DIR, "JournalSync")

# Daily note template path
TEMPLATE_PATH = "/Users/edo/Documents/Obsidian/the-vault/notes/templates/daily.md"

# Cache for training entries so workout/stretch files can arrive in separate
# runs without losing earlier entries for the same day.
TRAINING_CACHE_PATH = os.path.expanduser("~/.cache/journal/training_entries.json")

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
