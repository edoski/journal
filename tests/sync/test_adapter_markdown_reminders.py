"""Contract tests for MarkdownReminderRuleStore adapter."""

from __future__ import annotations

import pytest

from sync.adapters.markdown_reminders import MarkdownReminderRuleStore
from sync.models.reminders import ReminderRule


def test_load_raises_when_file_missing(tmp_path):
    store = MarkdownReminderRuleStore(str(tmp_path / "REMINDERS.md"))
    with pytest.raises(FileNotFoundError):
        store.load()


def test_save_then_load_round_trip(tmp_path):
    path = tmp_path / "REMINDERS.md"
    store = MarkdownReminderRuleStore(str(path))
    rules = [
        ReminderRule(
            schedule_kind="WEEKLY",
            schedule_value="SUN",
            body="Review week",
        ),
        ReminderRule(
            schedule_kind="MONTHLY",
            schedule_value="LAST_DAY",
            body="Close month",
        ),
    ]

    store.save(rules)
    loaded = store.load()

    assert loaded == rules
