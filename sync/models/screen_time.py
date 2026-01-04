"""
Screen time entry models for the journal sync system.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScreenTimeEntry:
    """A single app screen time entry."""

    app: str
    minutes: float


@dataclass
class DailyScreenTimeData:
    """Container for screen time entries with computed properties."""

    entries: list[ScreenTimeEntry]

    @property
    def total_minutes(self) -> float:
        """Total screen time across all apps."""
        return sum(e.minutes for e in self.entries)

    @property
    def sorted_entries(self) -> list[ScreenTimeEntry]:
        """Entries sorted by duration descending."""
        return sorted(self.entries, key=lambda e: e.minutes, reverse=True)
