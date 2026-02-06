"""Mutable reminder-rule storage for the TUI reminders editor."""

from __future__ import annotations

from dataclasses import replace

from sync.constants import REMINDERS_PATH
from sync.goals.reminders import load_reminder_rules, save_reminder_rules
from sync.models import ReminderRule


class RemindersStore:
    """CRUD-like wrapper around REMINDERS.md rule parsing/persistence."""

    def __init__(self, reminders_path: str = REMINDERS_PATH) -> None:
        self.reminders_path = reminders_path

    def load(self) -> list[ReminderRule]:
        return load_reminder_rules(self.reminders_path)

    def save(self, rules: list[ReminderRule]) -> None:
        save_reminder_rules(self.reminders_path, rules)

    def add(self, rule: ReminderRule) -> list[ReminderRule]:
        rules = self.load()
        if any(existing.id == rule.id for existing in rules):
            raise ValueError(f"Reminder rule with ID {rule.id!r} already exists")
        updated = rules + [rule]
        self.save(updated)
        return updated

    def delete(self, rule_id: str) -> list[ReminderRule]:
        rules = self.load()
        updated = [rule for rule in rules if rule.id != rule_id]
        if len(updated) == len(rules):
            raise ValueError(f"No reminder rule found for ID {rule_id!r}")
        self.save(updated)
        return updated

    def toggle(self, rule_id: str) -> list[ReminderRule]:
        rules = self.load()
        updated: list[ReminderRule] = []
        found = False
        for rule in rules:
            if rule.id == rule_id:
                updated.append(replace(rule, enabled=not rule.enabled))
                found = True
            else:
                updated.append(rule)

        if not found:
            raise ValueError(f"No reminder rule found for ID {rule_id!r}")

        self.save(updated)
        return updated
