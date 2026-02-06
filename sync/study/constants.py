"""
Constants for study-session ingestion from the Flow app.
"""

from __future__ import annotations

import datetime

# External integration identifiers for the Flow app.
FLOW_APP_DEFAULTS_DOMAIN = "design.yugen.Flow"
FLOW_PHASE_STUDY = "flow"
FLOW_PHASE_SHORT_BREAK = "shortBreak"
FLOW_PHASE_LONG_BREAK = "longBreak"
FLOW_BREAK_PHASES = (FLOW_PHASE_SHORT_BREAK, FLOW_PHASE_LONG_BREAK)
FLOW_BREAK_DEFAULT_KEYS = (FLOW_PHASE_LONG_BREAK, FLOW_PHASE_SHORT_BREAK)

# Flow database path.
DB_PATH = "/Users/edo/Library/Containers/design.yugen.Flow/Data/Library/Application Support/Flow/CoreData.sqlite"

# CoreData uses an epoch starting at 2001-01-01 instead of 1970-01-01.
CORE_DATA_EPOCH_OFFSET = 978307200

# Break-linking and overrun boundaries.
BREAK_LINK_MAX_GAP_SECONDS = 300
REGULAR_DAY_END = datetime.time(18, 0)

# Base daily lunch window (dynamically shifted when a study session straddles start).
LUNCH_WINDOW_BASE = (datetime.time(13, 30), datetime.time(14, 30))
