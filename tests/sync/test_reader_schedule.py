"""Tests for strict PROTOCOL.md schedule parsing and day resolution."""

from __future__ import annotations

import datetime

import pytest

from sync.readers.schedule import load_schedule_rules


def _write_protocol(tmp_path, table_lines: list[str]) -> str:
    path = tmp_path / "PROTOCOL.md"
    lines = [
        "## SUPPLEMENTS",
        "",
        "## SCHEDULE",
        "",
        *table_lines,
        "",
        "## WORKOUT",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")
    return str(path)


def test_schedule_rules_resolve_default_weekday_and_date_precedence(tmp_path):
    path = _write_protocol(
        tmp_path,
        [
            "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |",
            "| ---- | ----------- | --------- | ----------- | --------- | ------------- |",
            "| DEFAULT | 08:00 | 18:00 | 13:30 | 14:30 | 18:00 |",
            "| WEEKDAY:WED,FRI | 14:30 | | | | |",
            "| DATE:2026-02-20 | 15:00 | | | | |",
        ],
    )

    rules = load_schedule_rules(path)

    monday = rules.resolve_day(datetime.date(2026, 2, 16))
    wednesday = rules.resolve_day(datetime.date(2026, 2, 18))
    friday_with_date_override = rules.resolve_day(datetime.date(2026, 2, 20))

    assert monday.study_start == datetime.time(8, 0)
    assert monday.study_end == datetime.time(18, 0)
    assert wednesday.study_start == datetime.time(14, 30)
    assert wednesday.study_end == datetime.time(18, 0)
    assert friday_with_date_override.study_start == datetime.time(15, 0)


def test_schedule_rules_reject_noncanonical_header(tmp_path):
    path = _write_protocol(
        tmp_path,
        [
            "| TIME | ACTIVITY |",
            "| ---- | -------- |",
            "| `08:00 - 09:30` | Study |",
        ],
    )

    with pytest.raises(ValueError, match="table header must be exactly"):
        load_schedule_rules(path)


def test_schedule_rules_reject_duplicate_weekday_selector(tmp_path):
    path = _write_protocol(
        tmp_path,
        [
            "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |",
            "| ---- | ----------- | --------- | ----------- | --------- | ------------- |",
            "| DEFAULT | 08:00 | 18:00 | 13:30 | 14:30 | 18:00 |",
            "| WEEKDAY:WED | 14:30 | | | | |",
            "| WEEKDAY:WED | 15:00 | | | | |",
        ],
    )

    with pytest.raises(ValueError, match="duplicate WEEKDAY selector"):
        load_schedule_rules(path)


def test_schedule_rules_reject_invalid_time_format(tmp_path):
    path = _write_protocol(
        tmp_path,
        [
            "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |",
            "| ---- | ----------- | --------- | ----------- | --------- | ------------- |",
            "| DEFAULT | 8:00 | 18:00 | 13:30 | 14:30 | 18:00 |",
        ],
    )

    with pytest.raises(ValueError, match="must be HH:MM"):
        load_schedule_rules(path)


def test_schedule_rules_reject_resolved_invalid_study_window(tmp_path):
    path = _write_protocol(
        tmp_path,
        [
            "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |",
            "| ---- | ----------- | --------- | ----------- | --------- | ------------- |",
            "| DEFAULT | 08:00 | 18:00 | 13:30 | 14:30 | 18:00 |",
            "| DATE:2026-02-20 | 19:00 | | | | |",
        ],
    )
    rules = load_schedule_rules(path)

    with pytest.raises(ValueError, match="STUDY_START must be earlier than STUDY_END"):
        rules.resolve_day(datetime.date(2026, 2, 20))
