"""
Study session models for the journal sync system.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StudySession:
    """A single study session from the daily STUDY table."""

    start_time: str  # e.g., "09:00"
    end_time: str | None  # e.g., "11:30" or None if ongoing
    activity: str
    duration_minutes: float
    interrupt_minutes: float
    break_minutes: float  # planned break
    overrun_minutes: float  # break overrun
    context: str  # wikilinks to modified files
    notes: str  # user notes


@dataclass
class DailyStudyData:
    """Container for study sessions with computed properties."""

    sessions: list[StudySession]

    @property
    def total_minutes(self) -> float:
        """Total study duration across all sessions."""
        return sum(s.duration_minutes for s in self.sessions)

    @property
    def total_interrupts(self) -> float:
        """Total interrupt minutes across all sessions."""
        return sum(s.interrupt_minutes for s in self.sessions)

    @property
    def total_breaks(self) -> float:
        """Total planned break minutes across all sessions."""
        return sum(s.break_minutes for s in self.sessions)

    @property
    def total_overruns(self) -> float:
        """Total break overrun minutes across all sessions."""
        return sum(s.overrun_minutes for s in self.sessions)

    @property
    def activity_totals(self) -> dict[str, float]:
        """Total minutes per activity."""
        totals: dict[str, float] = {}
        for s in self.sessions:
            totals[s.activity] = totals.get(s.activity, 0) + s.duration_minutes
        return totals

    @property
    def session_count(self) -> int:
        """Number of study sessions."""
        return len(self.sessions)
