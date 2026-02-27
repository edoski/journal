"""Codec helpers for reminder schedule string serialization/parsing."""

from __future__ import annotations

import datetime
import re
from typing import cast

from sync.contracts.reminders import (
    DailySchedule,
    MonthlyLastDaySchedule,
    ReminderSchedule,
    WeeklyEvenSchedule,
    WeeklyOddSchedule,
    WeeklySchedule,
    YearlySchedule,
)
from sync.contracts.schedule import Weekday

_WEEKDAYS: tuple[str, ...] = ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
_YEARLY_PATTERN = re.compile(r"\d{2}-\d{2}")


def _validate_weekday(weekday: str, *, kind: str) -> Weekday:
    if weekday not in _WEEKDAYS:
        raise ValueError(f"invalid weekday {weekday!r} for {kind}")
    return cast(Weekday, weekday)


def parse_schedule(text: str) -> ReminderSchedule:
    """Parse strict schedule syntax from REMINDERS.md."""
    if text == "DAILY":
        return DailySchedule()

    kind, sep, value = text.partition(":")
    if not sep:
        raise ValueError(f"SCHEDULE must be DAILY or KIND:VALUE, got {text!r}")

    if kind == "DAILY":
        raise ValueError("DAILY schedule must be DAILY")

    if kind == "WEEKLY":
        return WeeklySchedule(weekday=_validate_weekday(value, kind=kind))

    if kind == "WEEKLY_ODD":
        return WeeklyOddSchedule(weekday=_validate_weekday(value, kind=kind))

    if kind == "WEEKLY_EVEN":
        return WeeklyEvenSchedule(weekday=_validate_weekday(value, kind=kind))

    if kind == "MONTHLY":
        if value != "LAST_DAY":
            raise ValueError("MONTHLY schedule must be MONTHLY:LAST_DAY")
        return MonthlyLastDaySchedule()

    if kind == "YEARLY":
        if not _YEARLY_PATTERN.fullmatch(value):
            raise ValueError("YEARLY schedule must be YEARLY:MM-DD")
        month, day = map(int, value.split("-"))
        try:
            datetime.date(2000, month, day)
        except ValueError as exc:
            raise ValueError(f"invalid YEARLY date {value!r}") from exc
        return YearlySchedule(month=month, day=day)

    raise ValueError(f"unsupported schedule kind {kind!r}")


def format_schedule(schedule: ReminderSchedule) -> str:
    """Format schedule into canonical strict token syntax."""
    match schedule:
        case DailySchedule():
            return "DAILY"
        case WeeklySchedule(weekday=weekday):
            return f"WEEKLY:{weekday}"
        case WeeklyOddSchedule(weekday=weekday):
            return f"WEEKLY_ODD:{weekday}"
        case WeeklyEvenSchedule(weekday=weekday):
            return f"WEEKLY_EVEN:{weekday}"
        case MonthlyLastDaySchedule():
            return "MONTHLY:LAST_DAY"
        case YearlySchedule(month=month, day=day):
            return f"YEARLY:{month:02d}-{day:02d}"
        case _:
            raise ValueError(f"Unsupported reminder schedule object: {schedule!r}")
