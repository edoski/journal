"""
Helpers for one-time cleanup re-sync of prior period notes.
"""

from __future__ import annotations

import os
from collections.abc import Callable

from sync.log import get_logger

logger = get_logger(__name__)
CLEANUP_MARKER = "↓"


def resync_if_marker(
    previous_note_path: str,
    rerun: Callable[[], None],
    marker: str = CLEANUP_MARKER,
) -> bool:
    """
    Re-sync a prior period note if it contains marker text.

    Args:
        previous_note_path: Path to prior period note.
        rerun: Callback that performs the prior-period re-sync.
        marker: Marker text that triggers cleanup resync.

    Returns:
        True if a re-sync callback was invoked, otherwise False.
    """
    if not os.path.exists(previous_note_path):
        logger.debug("Previous note missing; cleanup skipped: %s", previous_note_path)
        return False

    try:
        with open(previous_note_path, "r") as f:
            has_marker = any(line.strip() == marker for line in f)
            if not has_marker:
                logger.debug(
                    "Cleanup marker not present; cleanup skipped: %s",
                    previous_note_path,
                )
                return False

        logger.info(
            "Cleanup marker found in %s; running cleanup callback",
            previous_note_path,
        )
        rerun()
        return True
    except Exception as exc:
        logger.debug("Cleanup callback failed: %s", exc)
        return False
