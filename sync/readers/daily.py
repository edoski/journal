"""
Daily note reader adapter.

This module owns parsing of daily note files into aggregate metric dictionaries.
"""

from __future__ import annotations

from sync.notes_parsing import parse_daily_note as _parse_daily_note


def parse_daily_note(path: str) -> dict | None:
    """Parse a daily note file and return extracted metrics."""
    return _parse_daily_note(path)
