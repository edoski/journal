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
    shortcut_ran: bool = True  # True if data came from shortcut (even if empty)

    # Study deviation fields (populated during daily sync)
    interrupt_minutes: float = 0.0
    overrun_minutes: float = 0.0
    late_start_minutes: float = 0.0

    @property
    def total_minutes(self) -> float:
        """Total screen time across all apps."""
        return sum(e.minutes for e in self.entries)

    @property
    def deviation_minutes(self) -> float:
        """Non-phone procrastination = lost time not covered by screen time."""
        return max(
            0.0,
            self.interrupt_minutes
            + self.overrun_minutes
            + self.late_start_minutes
            - self.total_minutes,
        )

    @property
    def sorted_entries(self) -> list[ScreenTimeEntry]:
        """Entries sorted by duration descending."""
        return sorted(self.entries, key=lambda e: e.minutes, reverse=True)
