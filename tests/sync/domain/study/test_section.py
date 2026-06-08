"""Tests for canonical STUDY section rendering."""

from __future__ import annotations

import datetime

from sync.study.section import build_study_section


def _session_for(
    day: datetime.date,
    start_hour: int,
    start_minute: int,
    end_hour: int,
    end_minute: int,
) -> dict[str, object]:
    start = datetime.datetime.combine(day, datetime.time(start_hour, start_minute))
    end = datetime.datetime.combine(day, datetime.time(end_hour, end_minute))
    return {
        "start": start,
        "end": end,
        "title": "Study",
        "actual_elapsed": 60.0,
        "interruptions_duration": 0,
        "break_expected": 5,
        "break_overrun": 0,
        "is_open": False,
        "completed_at": end,
    }


def test_build_study_section_renders_explicit_zero_minute_break():
    day = datetime.date(2026, 3, 2)
    sessions = [_session_for(day, 9, 0, 10, 0)]
    sessions[0]["break_expected"] = 0
    sessions[0]["break_duration"] = 0
    sessions[0]["break_missing"] = False

    lines, _ = build_study_section(sessions)

    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `0m` |" in lines


def test_build_study_section_renders_zero_minute_break_when_gap_is_known():
    day = datetime.date(2026, 3, 2)
    sessions = [_session_for(day, 9, 0, 10, 0)]
    sessions[0]["break_expected"] = 0
    sessions[0]["break_duration"] = 0
    sessions[0]["break_missing"] = True

    lines, _ = build_study_section(sessions)

    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `0m` |" in lines
