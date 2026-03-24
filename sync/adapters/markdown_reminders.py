"""Markdown reminder rule store adapter."""

from __future__ import annotations

from sync.constants import REMINDERS_PATH
from sync.goals.reminders import (
    parse_reminder_rules_lines,
    render_reminder_rules_markdown,
)
from sync.contracts.reminders import ReminderRule
from sync.io import atomic_write_note, safe_read_file
from sync.ports.reminders import ReminderRuleStore


class MarkdownReminderRuleStore(ReminderRuleStore):
    """Markdown table-backed reminder-rule store."""

    def __init__(self, path: str = REMINDERS_PATH) -> None:
        self.path = path

    def load(self) -> list[ReminderRule]:
        """Load reminder rules from configured markdown file."""
        lines = safe_read_file(self.path)
        if lines is None:
            raise FileNotFoundError(f"Required reminder config not found: {self.path}")
        return parse_reminder_rules_lines(lines)

    def save(self, rules: list[ReminderRule]) -> None:
        """Persist reminder rules to configured markdown file."""
        atomic_write_note(self.path, render_reminder_rules_markdown(rules))
