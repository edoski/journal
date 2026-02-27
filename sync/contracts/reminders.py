"""Reminder rule contracts shared across sync layers."""

from __future__ import annotations

from dataclasses import dataclass

from .schedule import Weekday


@dataclass(frozen=True)
class DailySchedule:
    """Run the reminder every day."""


@dataclass(frozen=True)
class WeeklySchedule:
    """Run the reminder weekly on a weekday."""

    weekday: Weekday


@dataclass(frozen=True)
class WeeklyOddSchedule:
    """Run the reminder on odd ISO weeks for a weekday."""

    weekday: Weekday


@dataclass(frozen=True)
class WeeklyEvenSchedule:
    """Run the reminder on even ISO weeks for a weekday."""

    weekday: Weekday


@dataclass(frozen=True)
class MonthlyLastDaySchedule:
    """Run the reminder on the last day of each month."""


@dataclass(frozen=True)
class YearlySchedule:
    """Run the reminder yearly on an MM-DD date."""

    month: int
    day: int


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
