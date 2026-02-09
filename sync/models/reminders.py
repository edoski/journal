"""Reminder rule model for markdown-configured reminder generation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ScheduleKind = Literal[
    "WEEKLY",
    "MONTHLY",
    "YEARLY",
    "WEEKLY_ODD",
    "WEEKLY_EVEN",
]


@dataclass(frozen=True)
class ReminderRule:
    """A single reminder rule parsed from REMINDERS.md."""

    schedule_kind: ScheduleKind
    schedule_value: str
    body: str
