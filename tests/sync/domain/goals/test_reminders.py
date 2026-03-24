"""Tests for reminder rule parsing and evaluation."""

from __future__ import annotations

import datetime

import pytest

from sync.contracts.reminders import DailySchedule
from sync.goals.reminders import (
    get_reminders_for_date,
    parse_reminder_rules_lines,
)

HEADER = [
    "| SCHEDULE | BODY |",
    "| -------- | ---- |",
]


def _rules(rows: list[str]) -> list[str]:
    return [*HEADER, *rows, ""]


def test_parse_reminder_rules_lines_parses_valid_table() -> None:
    rules = parse_reminder_rules_lines(
        _rules(
            [
                "| DAILY | Daily planning |",
                "| WEEKLY:SUN | Review [[2026-W05]] + Goals |",
                "| MONTHLY:LAST_DAY | Review [[2026-02]] + Goals |",
                "| YEARLY:12-31 | Review [[2026]] + Goals |",
                "| WEEKLY_ODD:SUN | Restart MacBook |",
                "| WEEKLY_EVEN:SUN | Vacuum room |",
            ]
        )
    )

    assert len(rules) == 6
    assert rules[0].schedule == DailySchedule()
    assert rules[0].body == "Daily planning"


def test_parse_reminder_rules_lines_invalid_table_fails() -> None:
    with pytest.raises(ValueError, match=r"\| SCHEDULE \| BODY \|"):
        parse_reminder_rules_lines(["not a table"])


def test_parse_reminder_rules_lines_invalid_schedule_fails() -> None:
    with pytest.raises(ValueError, match="invalid weekday"):
        parse_reminder_rules_lines(_rules(["| WEEKLY:FUNDAY | Invalid |"]))


def test_parse_reminder_rules_lines_invalid_daily_schedule_fails() -> None:
    with pytest.raises(ValueError, match="DAILY schedule must be DAILY"):
        parse_reminder_rules_lines(_rules(["| DAILY:MON | Invalid |"]))


def test_parse_reminder_rules_lines_malformed_yearly_schedule_fails() -> None:
    with pytest.raises(ValueError, match="YEARLY schedule must be YEARLY:MM-DD"):
        parse_reminder_rules_lines(_rules(["| YEARLY:1231 | Invalid |"]))


def test_parse_reminder_rules_lines_impossible_yearly_schedule_fails() -> None:
    with pytest.raises(ValueError, match="invalid YEARLY date"):
        parse_reminder_rules_lines(_rules(["| YEARLY:02-30 | Invalid |"]))


def test_parse_reminder_rules_lines_extra_column_fails() -> None:
    with pytest.raises(ValueError, match="expected 2 cells, got 3"):
        parse_reminder_rules_lines(_rules(["| WEEKLY:SUN | Invalid | extra |"]))


def test_parse_reminder_rules_lines_duplicate_fails() -> None:
    with pytest.raises(ValueError, match="duplicate rule"):
        parse_reminder_rules_lines(
            _rules(
                [
                    "| WEEKLY:SUN | Same task |",
                    "| WEEKLY:SUN | Same task |",
                ]
            )
        )


def test_get_reminders_for_date_evaluates_schedules() -> None:
    rules = parse_reminder_rules_lines(
        _rules(
            [
                "| DAILY | Daily planning |",
                "| WEEKLY:SUN | Weekly Checkpoint |",
                "| MONTHLY:LAST_DAY | Monthly Review |",
                "| YEARLY:12-31 | Yearly Review |",
                "| WEEKLY_ODD:SUN | Restart MacBook |",
                "| WEEKLY_EVEN:SUN | Vacuum room |",
            ]
        )
    )

    sunday_odd = datetime.date(2026, 2, 1)
    reminders = get_reminders_for_date(sunday_odd, rules)
    bodies = {reminder.body for reminder in reminders}
    assert all(reminder.id.startswith("gid-r") for reminder in reminders)
    assert "Daily planning" in bodies
    assert "Weekly Checkpoint" in bodies
    assert "Restart MacBook" in bodies
    assert "Vacuum room" not in bodies

    sunday_even = datetime.date(2026, 2, 8)
    reminders_even = get_reminders_for_date(sunday_even, rules)
    bodies_even = {reminder.body for reminder in reminders_even}
    assert all(reminder.id.startswith("gid-r") for reminder in reminders_even)
    assert "Restart MacBook" not in bodies_even
    assert "Vacuum room" in bodies_even

    assert any(
        reminder.body == "Monthly Review"
        for reminder in get_reminders_for_date(datetime.date(2026, 2, 28), rules)
    )
    assert any(
        reminder.body == "Yearly Review"
        for reminder in get_reminders_for_date(datetime.date(2026, 12, 31), rules)
    )


def test_get_reminders_for_date_is_deterministic() -> None:
    rules = parse_reminder_rules_lines(_rules(["| WEEKLY:SUN | Weekly Checkpoint |"]))
    date = datetime.date(2026, 2, 1)

    first = get_reminders_for_date(date, rules)
    second = get_reminders_for_date(date, rules)

    assert len(first) == len(second) == 1
    assert first[0].id == second[0].id
    assert first[0].id.startswith("gid-r")
    assert first[0].body == second[0].body


def test_get_reminders_for_date_renders_body_tokens() -> None:
    rules = parse_reminder_rules_lines(
        _rules(
            [
                "| DAILY | Plan {{date}} |",
                "| WEEKLY:SUN | Review [[{{iso_week}}]] + Goals |",
                "| MONTHLY:LAST_DAY | Review [[{{month}}]] + Goals |",
                "| YEARLY:12-31 | Review [[{{year}}]] + Goals |",
            ]
        )
    )

    assert any(
        reminder.body == "Plan 2026-02-01"
        for reminder in get_reminders_for_date(datetime.date(2026, 2, 1), rules)
    )
    assert any(
        reminder.body == "Review [[2026-W05]] + Goals"
        for reminder in get_reminders_for_date(datetime.date(2026, 2, 1), rules)
    )
    assert any(
        reminder.body == "Review [[2026-02]] + Goals"
        for reminder in get_reminders_for_date(datetime.date(2026, 2, 28), rules)
    )
    assert any(
        reminder.body == "Review [[2026]] + Goals"
        for reminder in get_reminders_for_date(datetime.date(2026, 12, 31), rules)
    )
