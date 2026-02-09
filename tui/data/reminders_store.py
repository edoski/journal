"""Mutable reminder-rule storage for the TUI reminders editor."""

from __future__ import annotations

from sync.models import ReminderRule
from sync.ports.reminders import ReminderRuleStore


class RemindersStore:
    """CRUD-like wrapper around REMINDERS.md rule parsing/persistence."""

    def __init__(self, rule_store: ReminderRuleStore) -> None:
        self.rule_store = rule_store

    def load(self) -> list[ReminderRule]:
        return self.rule_store.load()

    def save(self, rules: list[ReminderRule]) -> None:
        self.rule_store.save(rules)

    def add(self, rule: ReminderRule) -> list[ReminderRule]:
        rules = self.load()
        # Check for duplicate based on schedule+body
        for existing in rules:
            if (
                existing.schedule_kind == rule.schedule_kind
                and existing.schedule_value == rule.schedule_value
                and existing.body == rule.body
            ):
                raise ValueError("Reminder rule with same schedule and body already exists")
        updated = rules + [rule]
        self.save(updated)
        return updated

    def delete(self, schedule_kind: str, schedule_value: str, body: str) -> list[ReminderRule]:
        """Delete a rule by matching its schedule and body."""
        rules = self.load()
        updated = [
            rule for rule in rules
            if not (
                rule.schedule_kind == schedule_kind
                and rule.schedule_value == schedule_value
                and rule.body == body
            )
        ]
        if len(updated) == len(rules):
            raise ValueError("No matching reminder rule found")
        self.save(updated)
        return updated
