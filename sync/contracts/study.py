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
