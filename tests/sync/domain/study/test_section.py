"""Tests for canonical STUDY section extraction."""

from __future__ import annotations

import datetime

import pytest

from sync.study.section import build_study_section, extract_existing_data


def test_extract_existing_data_uses_canonical_context_and_notes_columns():
    lines = [
        "### **STUDY**",
        "",
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |",
        "| ---- | -------- | -------- | --------- | ----- | ------- | ----- |",
        "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` | [[Foo]] | kept note |",
    ]

    notes, context = extract_existing_data(lines)
    assert notes == {"09:00": "kept note"}
    assert context == {"09:00": "[[Foo]]"}


def test_extract_existing_data_rejects_legacy_header_without_context():
    lines = [
        "### **STUDY**",
        "",
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | NOTES |",
        "| ---- | -------- | -------- | --------- | ----- | ----- |",
        "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` | kept note |",
    ]

    with pytest.raises(
        ValueError,
        match="Non-canonical STUDY table header",
    ):
        extract_existing_data(lines)


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


def test_build_study_section_warns_for_unmapped_existing_user_notes(monkeypatch):
    day = datetime.date(2026, 3, 2)
    sessions = [_session_for(day, 8, 0, 9, 0)]
    existing_notes = {
        "08:00": "kept",
        "12:46": "manual note should warn",
        "12:47": "–",
    }
    warnings: list[str] = []

    def fake_warning(message: str, *args: object, **_kwargs: object) -> None:
        rendered = message % args if args else message
        warnings.append(rendered)

    monkeypatch.setattr("sync.study.section.logger.warning", fake_warning)
    build_study_section(sessions, existing_notes)

    assert any(
        "start-key preservation missed session starts: 12:46" in warning
        for warning in warnings
    )


def test_build_study_section_does_not_warn_for_placeholder_only_unmapped_notes(
    monkeypatch,
):
    day = datetime.date(2026, 3, 2)
    sessions = [_session_for(day, 8, 0, 9, 0)]
    existing_notes = {
        "12:45": "",
        "12:46": "–",
        "12:47": "—",
        "12:48": "❌",
    }
    warnings: list[str] = []

    def fake_warning(message: str, *args: object, **_kwargs: object) -> None:
        rendered = message % args if args else message
        warnings.append(rendered)

    monkeypatch.setattr("sync.study.section.logger.warning", fake_warning)
    build_study_section(sessions, existing_notes)

    assert warnings == []


def test_build_study_section_renders_explicit_zero_minute_break():
    day = datetime.date(2026, 3, 2)
    sessions = [_session_for(day, 9, 0, 10, 0)]
    sessions[0]["break_expected"] = 0
    sessions[0]["break_duration"] = 0
    sessions[0]["break_missing"] = False

    lines, _ = build_study_section(sessions, {})

    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `0m` | – | – |" in lines
