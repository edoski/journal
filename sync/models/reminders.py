"""Reminder rule models and schedule parsing/formatting helpers."""

from __future__ import annotations

import datetime
import re
from dataclasses import dataclass
from typing import Literal, cast

Weekday = Literal["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
_WEEKDAYS: tuple[str, ...] = ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
_YEARLY_PATTERN = re.compile(r"\d{2}-\d{2}")


def _validate_weekday(weekday: str, *, kind: str) -> Weekday:
    if weekday not in _WEEKDAYS:
        raise ValueError(f"invalid weekday {weekday!r} for {kind}")
    return cast(Weekday, weekday)


@dataclass(frozen=True)
class DailySchedule:
    """Run the reminder every day."""


@dataclass(frozen=True)
class WeeklySchedule:
    """Run the reminder weekly on a weekday."""

    weekday: Weekday

    def __post_init__(self) -> None:
        _validate_weekday(self.weekday, kind="WEEKLY")


@dataclass(frozen=True)
class WeeklyOddSchedule:
    """Run the reminder on odd ISO weeks for a weekday."""

    weekday: Weekday

    def __post_init__(self) -> None:
        _validate_weekday(self.weekday, kind="WEEKLY_ODD")


@dataclass(frozen=True)
class WeeklyEvenSchedule:
    """Run the reminder on even ISO weeks for a weekday."""

    weekday: Weekday

    def __post_init__(self) -> None:
        _validate_weekday(self.weekday, kind="WEEKLY_EVEN")


@dataclass(frozen=True)
class MonthlyLastDaySchedule:
    """Run the reminder on the last day of each month."""


@dataclass(frozen=True)
class YearlySchedule:
    """Run the reminder yearly on an MM-DD date."""

    month: int
    day: int

    def __post_init__(self) -> None:
        try:
            datetime.date(2000, self.month, self.day)
        except ValueError as exc:
            token = f"{self.month:02d}-{self.day:02d}"
            raise ValueError(f"invalid YEARLY date {token!r}") from exc


ReminderSchedule = (
    DailySchedule
    | WeeklySchedule
    | WeeklyOddSchedule
    | WeeklyEvenSchedule
    | MonthlyLastDaySchedule
    | YearlySchedule
)


@dataclass(frozen=True)
class ReminderRule:
    """A single reminder rule parsed from REMINDERS.md."""

    schedule: ReminderSchedule
    body: str


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
            return YearlySchedule(month=month, day=day)
        except ValueError as exc:
            raise ValueError(f"invalid YEARLY date {value!r}") from exc

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
            # Defensive guard in case external callers bypass typing.
            raise ValueError(f"Unsupported reminder schedule object: {schedule!r}")
