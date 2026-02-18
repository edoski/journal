"""Typed study-session contracts."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import TypedDict


@dataclass(frozen=True)
class StudySession:
    """A single study session from the daily STUDY table."""

    start_time: str
    end_time: str | None
    activity: str
    duration_minutes: float
    interrupt_minutes: float
    break_minutes: float
    overrun_minutes: float
    context: str
    notes: str


@dataclass(frozen=True)
class DailyStudyData:
    """Container for study sessions with computed properties."""

    sessions: list[StudySession]

    @property
    def total_minutes(self) -> float:
        """Total study duration across all sessions."""
        return sum(session.duration_minutes for session in self.sessions)

    @property
    def total_interrupts(self) -> float:
        """Total interrupt minutes across all sessions."""
        return sum(session.interrupt_minutes for session in self.sessions)

    @property
    def total_breaks(self) -> float:
        """Total planned break minutes across all sessions."""
        return sum(session.break_minutes for session in self.sessions)

    @property
    def total_overruns(self) -> float:
        """Total break overrun minutes across all sessions."""
        return sum(session.overrun_minutes for session in self.sessions)

    @property
    def activity_totals(self) -> dict[str, float]:
        """Total minutes per activity."""
        totals: dict[str, float] = {}
        for session in self.sessions:
            totals[session.activity] = (
                totals.get(session.activity, 0.0) + session.duration_minutes
            )
        return totals

    @property
    def session_count(self) -> int:
        """Number of study sessions."""
        return len(self.sessions)


class StudySessionRecord(TypedDict, total=False):
    """Canonical session payload used across sync orchestration."""

    pk: int
    pks: list[int]
    interrupt_pks: list[int]
    phase: str
    title: str
    start: datetime.datetime
    end: datetime.datetime
    completed_at: datetime.datetime | None
    planned_duration: float
    duration: float
    actual_elapsed: float
    actual_duration: float
    interruptions_count: int
    interruptions_duration: float
    break_duration: float
    break_expected: float
    break_overrun: int
    break_missing: bool
    break_reason: str | None
    anchored_lunch_window: tuple[datetime.time, datetime.time] | None
    linked_break_start: datetime.datetime | None
    is_open: bool
    focus_minutes: int
    focus_minutes_rounded: int
