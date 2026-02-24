"""Typed schedule contracts shared across sync layers."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Literal

Weekday = Literal["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


@dataclass(frozen=True)
class DayScheduleProfile:
    """Canonical day-level schedule profile used by sync orchestration."""

    study_start: datetime.time
    study_end: datetime.time
    lunch_start: datetime.time
    lunch_end: datetime.time
    workout_start: datetime.time
    is_off_day: bool
