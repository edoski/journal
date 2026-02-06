"""Reminder rule store port."""

from __future__ import annotations

from typing import Protocol

from sync.models.reminders import ReminderRule


class ReminderRuleStore(Protocol):
    """Read/write interface for reminder rules."""

    def load(self) -> list[ReminderRule]:
        """Load reminder rules."""

    def save(self, rules: list[ReminderRule]) -> None:
        """Persist reminder rules."""
