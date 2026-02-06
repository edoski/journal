"""
Daily sync package for journal synchronization.

This package provides the daily sync functionality for the journal system,
reading Flow sessions from the database, processing training and sleep data
from iCloud status files, and updating daily markdown notes.

Usage:
    python -m sync.daily
"""

from __future__ import annotations

__all__: list[str] = []
