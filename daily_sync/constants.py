"""
Constants for the daily sync module.

Contains database paths, timing constants, and configuration values
specific to daily synchronization with the Flow app.
"""
from __future__ import annotations

import datetime
import os

# Flow database path
DB_PATH = "/Users/edo/Library/Containers/design.yugen.Flow/Data/Library/Application Support/Flow/CoreData.sqlite"

# CoreData uses an epoch starting at 2001-01-01 instead of 1970-01-01.
# This offset converts between CoreData timestamps and Unix timestamps.
CORE_DATA_EPOCH_OFFSET = 978307200  # Seconds between 1970-01-01 and 2001-01-01

# Break linking constants
BREAK_GAP_CAP_SECONDS = 60  # 1 minute; breaks auto-start, so keep this tight
# Maximum allowed gap (seconds) between a flow end and the next break start
# to consider them linked (5 minutes).
BREAK_LINK_MAX_GAP_SECONDS = 300

# Regular study day cutoff: sessions past this time incur no overrun.
REGULAR_DAY_END = datetime.time(18, 0)

# Base daily lunch window (dynamically shifted by _compute_dynamic_lunch_window
# when a flow session straddles the nominal start).
LUNCH_WINDOW_BASE = (datetime.time(13, 30), datetime.time(14, 30))

# iCloud paths for Shortcuts status files
ICLOUD_SHORTCUTS_DIR = "/Users/edo/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents"
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
CONTEXT_SESSION_BUFFER_MINUTES = 5

# Files to exclude from context tracking (AI/meta files)
CONTEXT_EXCLUDED_FILES = (
    "GEMINI",
    "AGENTS",
    "PROTOCOL",
    "TODO",
)

