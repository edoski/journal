"""Screen-time contracts."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScreenTimeEntry:
    """A single app screen time entry."""

    app: str
    minutes: float


@dataclass(frozen=True)
class DailyScreenTimeData:
    """Container for screen time entries with computed properties."""

    entries: list[ScreenTimeEntry]
    shortcut_ran: bool = True

    @property
    def total_minutes(self) -> float:
        """Total screen time across all apps."""
        return sum(entry.minutes for entry in self.entries)

    @property
    def sorted_entries(self) -> list[ScreenTimeEntry]:
        """Entries sorted by duration descending."""
        return sorted(self.entries, key=lambda entry: entry.minutes, reverse=True)
