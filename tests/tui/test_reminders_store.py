from __future__ import annotations

from sync.models import ReminderRule
from tui.data.reminders_store import RemindersStore


def _write_rules(path):
    path.write_text(
        "\n".join(
            [
                "| ID | ENABLED | SCHEDULE | BODY |",
                "| -- | ------- | -------- | ---- |",
                "| weekly_review | true | WEEKLY:SUN | Review Week |",
                "",
            ]
        ),
        encoding="utf-8",
    )


def test_reminders_store_add_toggle_delete(tmp_path):
    reminders_path = tmp_path / "REMINDERS.md"
    _write_rules(reminders_path)

    store = RemindersStore(str(reminders_path))

    added = store.add(
        ReminderRule(
            id="restart_mac",
            enabled=True,
            schedule_kind="BIWEEKLY_ODD_ISO",
            schedule_value="SUN",
            body="Restart MacBook",
        )
    )
    assert any(rule.id == "restart_mac" for rule in added)

    toggled = store.toggle("restart_mac")
    restart = next(rule for rule in toggled if rule.id == "restart_mac")
    assert restart.enabled is False

    deleted = store.delete("restart_mac")
    assert all(rule.id != "restart_mac" for rule in deleted)
