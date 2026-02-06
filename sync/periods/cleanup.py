"""
Helpers for one-time cleanup re-sync of prior period notes.
"""

from __future__ import annotations

import os
import subprocess
import sys

from sync.logging import get_logger

logger = get_logger()


def _repo_root() -> str:
    """Return repository root based on this module location."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def resync_if_marker(
    previous_note_path: str,
    module_name: str,
    module_args: list[str],
    marker: str = "↓",
) -> bool:
    """
    Re-sync a prior period note if it contains marker text.

    Args:
        previous_note_path: Path to prior period note.
        module_name: Module to execute (for example, ``sync.periods.weekly``).
        module_args: Additional module arguments.
        marker: Marker text that triggers cleanup resync.

    Returns:
        True if a re-sync command was launched, otherwise False.
    """
    if not os.path.exists(previous_note_path):
        return False

    try:
        with open(previous_note_path, "r") as f:
            if marker not in f.read():
                return False

        subprocess.run(
            [sys.executable, "-m", module_name, *module_args],
            cwd=_repo_root(),
            check=False,
        )
        return True
    except (PermissionError, OSError, subprocess.SubprocessError) as exc:
        logger.debug("Cleanup subprocess failed: %s", exc)
        return False
