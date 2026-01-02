"""
Sleep entry models for the journal sync system.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SleepEntry:
    """A single sleep entry from the daily SLEEP table."""

    duration_minutes: float
    awake_minutes: float | None = None
    awakenings: int | None = None


@dataclass
class DailySleepData:
    """Container for sleep entries with computed properties."""

    entries: list[SleepEntry]

    @property
    def total_minutes(self) -> float:
        """Total sleep duration across all entries."""
        return sum(e.duration_minutes for e in self.entries)

    @property
    def total_awake(self) -> float | None:
        """Total awake time across all entries, or None if no data."""
        awake_vals = [
            e.awake_minutes for e in self.entries if e.awake_minutes is not None
        ]
        return sum(awake_vals) if awake_vals else None

    @property
    def total_awakenings(self) -> int | None:
        """Total awakenings across all entries, or None if no data."""
        awakening_vals = [
            e.awakenings for e in self.entries if e.awakenings is not None
        ]
        return sum(awakening_vals) if awakening_vals else None
