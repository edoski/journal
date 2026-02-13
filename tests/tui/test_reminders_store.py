from __future__ import annotations

from sync.adapters.markdown_reminders import MarkdownReminderRuleStore
from sync.models import ReminderRule, WeeklyEvenSchedule, WeeklyOddSchedule
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
            schedule=WeeklyOddSchedule(weekday="SUN"),
            body="Restart MacBook",
        )
    )
    assert any(
        rule.schedule == WeeklyOddSchedule(weekday="SUN")
        and rule.body == "Restart MacBook"
        for rule in added
    )

    deleted = store.delete(
        ReminderRule(
            schedule=WeeklyOddSchedule(weekday="SUN"),
            body="Restart MacBook",
        )
    )
    assert all(
        not (
            rule.schedule == WeeklyOddSchedule(weekday="SUN")
            and rule.body == "Restart MacBook"
        )
        for rule in deleted
    )


def test_reminders_store_preview_add_and_delete(tmp_path):
    reminders_path = tmp_path / "REMINDERS.md"
    _write_rules(reminders_path)
    store = RemindersStore(rule_store=MarkdownReminderRuleStore(str(reminders_path)))

    candidate = ReminderRule(
        schedule=WeeklyEvenSchedule(weekday="SUN"),
        body="Rotate workspace setup",
    )

    before_text = reminders_path.read_text(encoding="utf-8")
    before_add, after_add, updated_rules = store.preview_add(candidate)
    assert reminders_path.read_text(encoding="utf-8") == before_text
    assert "| WEEKLY_EVEN:SUN | Rotate workspace setup |" not in "\n".join(before_add)
    assert "| WEEKLY_EVEN:SUN | Rotate workspace setup |" in "\n".join(after_add)

    store.save(updated_rules)
    assert "| WEEKLY_EVEN:SUN | Rotate workspace setup |" in reminders_path.read_text(
        encoding="utf-8"
    )

    before_delete, after_delete, deleted_rules = store.preview_delete(candidate)
    assert "| WEEKLY_EVEN:SUN | Rotate workspace setup |" in "\n".join(before_delete)
    assert "| WEEKLY_EVEN:SUN | Rotate workspace setup |" not in "\n".join(after_delete)
    store.save(deleted_rules)
    assert (
        "| WEEKLY_EVEN:SUN | Rotate workspace setup |"
        not in reminders_path.read_text(encoding="utf-8")
    )
