from __future__ import annotations

from sync.adapters.markdown_reminders import MarkdownReminderRuleStore
from sync.models import ReminderRule
from tui.data.reminders_store import RemindersStore


def _write_rules(path):
    path.write_text(
        "\n".join(
            [
                "| SCHEDULE | BODY |",
                "| -------- | ---- |",
                "| WEEKLY:SUN | Review Week |",
                "",
            ]
        ),
        encoding="utf-8",
    )


def test_reminders_store_add_and_delete(tmp_path):
    reminders_path = tmp_path / "REMINDERS.md"
    _write_rules(reminders_path)

    store = RemindersStore(rule_store=MarkdownReminderRuleStore(str(reminders_path)))

    added = store.add(
        ReminderRule(
            schedule_kind="WEEKLY_ODD",
            schedule_value="SUN",
            body="Restart MacBook",
        )
    )
    assert any(
        rule.schedule_kind == "WEEKLY_ODD" and rule.body == "Restart MacBook"
        for rule in added
    )

    deleted = store.delete("WEEKLY_ODD", "SUN", "Restart MacBook")
    assert all(
        not (rule.schedule_kind == "WEEKLY_ODD" and rule.body == "Restart MacBook")
        for rule in deleted
    )
