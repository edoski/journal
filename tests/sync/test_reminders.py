"""Tests for markdown-configured reminder rule loading and evaluation."""

from __future__ import annotations

import datetime

import pytest

from sync.goals.reminders import get_reminders_for_date, load_reminder_rules


HEADER = [
    "| ID | ENABLED | SCHEDULE | BODY |",
    "| -- | ------- | -------- | ---- |",
]


def _write_rules(tmp_path, rows: list[str]) -> str:
    path = tmp_path / "REMINDERS.md"
    lines = HEADER + rows + [""]
    path.write_text("\n".join(lines), encoding="utf-8")
    return str(path)


def test_load_reminder_rules_parses_valid_table(tmp_path):
    path = _write_rules(
        tmp_path,
        [
            "| weekly_review | true | WEEKLY:SUN | Review [[2026-W05]] + Goals |",
            "| monthly_review | true | MONTHLY:LAST_DAY | Review [[2026-02]] + Goals |",
            "| yearly_review | true | YEARLY:12-31 | Review [[2026]] + Goals |",
            "| restart_mac | true | BIWEEKLY_ODD_ISO:SUN | Restart MacBook |",
            "| vacuum_room | true | BIWEEKLY_EVEN_ISO:SUN | Vacuum room |",
        ],
    )

    rules = load_reminder_rules(path)

    assert len(rules) == 5
    assert rules[0].id == "weekly_review"
    assert rules[0].enabled is True
    assert rules[0].schedule_kind == "WEEKLY"
    assert rules[0].schedule_value == "SUN"


def test_load_reminder_rules_requires_existing_file(tmp_path):
    missing_path = tmp_path / "REMINDERS.md"
    with pytest.raises(FileNotFoundError):
        load_reminder_rules(str(missing_path))


def test_load_reminder_rules_invalid_table_fails(tmp_path):
    path = tmp_path / "REMINDERS.md"
    path.write_text("not a table\n", encoding="utf-8")

    with pytest.raises(ValueError, match="must contain a markdown table header"):
        load_reminder_rules(str(path))


def test_load_reminder_rules_invalid_schedule_fails(tmp_path):
    path = _write_rules(
        tmp_path,
        [
            "| bad | true | WEEKLY:FUNDAY | Invalid |",
        ],
    )

    with pytest.raises(ValueError, match="invalid weekday"):
        load_reminder_rules(path)


def test_load_reminder_rules_legacy_extra_column_fails(tmp_path):
    path = _write_rules(
        tmp_path,
        [
            "| legacy | true | WEEKLY:SUN | Invalid | 0 |",
        ],
    )

    with pytest.raises(ValueError, match="expected 4 cells, got 5"):
        load_reminder_rules(path)


def test_get_reminders_for_date_evaluates_schedules(tmp_path):
    path = _write_rules(
        tmp_path,
        [
            "| weekly_sun | true | WEEKLY:SUN | Weekly Checkpoint |",
            "| monthly_last | true | MONTHLY:LAST_DAY | Monthly Review |",
            "| yearly_dec31 | true | YEARLY:12-31 | Yearly Review |",
            "| biweekly_sun | true | BIWEEKLY_ODD_ISO:SUN | Restart MacBook |",
            "| biweekly_even | true | BIWEEKLY_EVEN_ISO:SUN | Vacuum room |",
            "| disabled_rule | false | WEEKLY:SUN | Should Not Appear |",
        ],
    )
    rules = load_reminder_rules(path)

    sunday_odd = datetime.date(2026, 2, 1)  # Sunday, ISO week 5 (odd)
    reminders = get_reminders_for_date(sunday_odd, rules)
    bodies = {r.body for r in reminders}

    assert "Weekly Checkpoint" in bodies
    assert "Restart MacBook" in bodies
    assert "Vacuum room" not in bodies
    assert "Should Not Appear" not in bodies

    sunday_even = datetime.date(2026, 2, 8)  # Sunday, ISO week 6 (even)
    reminders_even = get_reminders_for_date(sunday_even, rules)
    bodies_even = {r.body for r in reminders_even}
    assert "Restart MacBook" not in bodies_even
    assert "Vacuum room" in bodies_even

    monthly_date = datetime.date(2026, 2, 28)
    monthly = get_reminders_for_date(monthly_date, rules)
    assert any(r.body == "Monthly Review" for r in monthly)

    yearly_date = datetime.date(2026, 12, 31)
    yearly = get_reminders_for_date(yearly_date, rules)
    assert any(r.body == "Yearly Review" for r in yearly)


def test_get_reminders_for_date_is_deterministic(tmp_path):
    path = _write_rules(
        tmp_path,
        [
            "| weekly_sun | true | WEEKLY:SUN | Weekly Checkpoint |",
        ],
    )
    rules = load_reminder_rules(path)
    date = datetime.date(2026, 2, 1)

    first = get_reminders_for_date(date, rules)
    second = get_reminders_for_date(date, rules)

    assert len(first) == len(second) == 1
    assert first[0].id == second[0].id
    assert first[0].body == second[0].body


def test_get_reminders_for_date_renders_body_tokens(tmp_path):
    path = _write_rules(
        tmp_path,
        [
            "| weekly_review | true | WEEKLY:SUN | Review [[{{iso_week}}]] + Goals |",
            "| monthly_review | true | MONTHLY:LAST_DAY | Review [[{{month}}]] + Goals |",
            "| yearly_review | true | YEARLY:12-31 | Review [[{{year}}]] + Goals |",
        ],
    )
    rules = load_reminder_rules(path)

    weekly = get_reminders_for_date(datetime.date(2026, 2, 1), rules)
    assert any(r.body == "Review [[2026-W05]] + Goals" for r in weekly)

    monthly = get_reminders_for_date(datetime.date(2026, 2, 28), rules)
    assert any(r.body == "Review [[2026-02]] + Goals" for r in monthly)

    yearly = get_reminders_for_date(datetime.date(2026, 12, 31), rules)
    assert any(r.body == "Review [[2026]] + Goals" for r in yearly)
