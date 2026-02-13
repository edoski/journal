"""Mutable reminder-rule storage for the TUI reminders editor."""

from __future__ import annotations

from typing import cast

from sync.goals.reminders import render_reminder_rules_markdown
from sync.models import ReminderRule, ScheduleKind
from sync.ports.reminders import ReminderRuleStore


class RemindersStore:
    """CRUD-like wrapper around REMINDERS.md rule parsing/persistence."""

    def __init__(self, rule_store: ReminderRuleStore) -> None:
        self.rule_store = rule_store

    def load(self) -> list[ReminderRule]:
        return self.rule_store.load()

    def save(self, rules: list[ReminderRule]) -> None:
        self.rule_store.save(rules)

    @staticmethod
    def _is_same_rule(left: ReminderRule, right: ReminderRule) -> bool:
        return (
            left.schedule_kind == right.schedule_kind
            and left.schedule_value == right.schedule_value
            and left.body == right.body
        )

    def preview_add(
        self,
        rule: ReminderRule,
    ) -> tuple[list[str], list[str], list[ReminderRule]]:
        """Preview adding a reminder rule without persisting changes."""
        rules = self.load()
        for existing in rules:
            if self._is_same_rule(existing, rule):
                raise ValueError(
                    "Reminder rule with same schedule and body already exists"
                )
        updated = [*rules, rule]
        before_lines = render_reminder_rules_markdown(rules)
        after_lines = render_reminder_rules_markdown(updated)
        return before_lines, after_lines, updated

    def preview_delete(
        self,
        rule: ReminderRule,
    ) -> tuple[list[str], list[str], list[ReminderRule]]:
        """Preview deleting a reminder rule without persisting changes."""
        rules = self.load()
        updated = [
            candidate for candidate in rules if not self._is_same_rule(candidate, rule)
        ]
        if len(updated) == len(rules):
            raise ValueError("No matching reminder rule found")
        before_lines = render_reminder_rules_markdown(rules)
        after_lines = render_reminder_rules_markdown(updated)
        return before_lines, after_lines, updated

    def add(self, rule: ReminderRule) -> list[ReminderRule]:
        _, _, updated = self.preview_add(rule)
        self.save(updated)
        return updated

    def delete(
        self, schedule_kind: str, schedule_value: str, body: str
    ) -> list[ReminderRule]:
        """Delete a rule by matching its schedule and body."""
        _, _, updated = self.preview_delete(
            ReminderRule(
                schedule_kind=cast(ScheduleKind, schedule_kind),
                schedule_value=schedule_value,
                body=body,
            )
        )
        self.save(updated)
        return updated
