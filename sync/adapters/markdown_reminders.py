"""Markdown reminder rule store adapter."""

from __future__ import annotations

from sync.constants import REMINDERS_PATH
from sync.goals.reminders import load_reminder_rules, save_reminder_rules
from sync.contracts.reminders import ReminderRule
from sync.ports.reminders import ReminderRuleStore


class MarkdownReminderRuleStore(ReminderRuleStore):
    """Markdown table-backed reminder-rule store."""

    def __init__(self, path: str = REMINDERS_PATH) -> None:
        self.path = path

    def load(self) -> list[ReminderRule]:
        """Load reminder rules from configured markdown file."""
        return load_reminder_rules(self.path)

    def save(self, rules: list[ReminderRule]) -> None:
        """Persist reminder rules to configured markdown file."""
        save_reminder_rules(self.path, rules)
