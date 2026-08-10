"""Contract tests for MarkdownScheduleSource adapter."""

from __future__ import annotations

import datetime

import pytest

from sync.adapters.markdown_schedule import MarkdownScheduleSource


def _write_protocol(tmp_path) -> str:
    path = tmp_path / "PROTOCOL.md"
    path.write_text(
        "\n".join(
            [
                "## SCHEDULE",
                "",
                "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |",
                "| ---- | ----------- | --------- | ----------- | --------- | ------------- |",
                "| DEFAULT | 08:00 | 18:00 | 13:30 | 14:30 | 18:00 |",
                "| WEEKDAY:WED,FRI | 14:30 | | | | |",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return str(path)


def test_resolve_day_reads_protocol_schedule(tmp_path):
    path = _write_protocol(tmp_path)
    source = MarkdownScheduleSource(path)

    monday = source.resolve_day(datetime.date(2026, 2, 16))
    friday = source.resolve_day(datetime.date(2026, 2, 20))

    assert monday.study_start == datetime.time(8, 0)
    assert friday.study_start == datetime.time(14, 30)


def test_resolve_day_raises_for_missing_protocol(tmp_path):
    source = MarkdownScheduleSource(str(tmp_path / "missing.md"))
    with pytest.raises(FileNotFoundError):
        source.resolve_day(datetime.date(2026, 2, 16))


def test_resolve_day_adds_source_path_to_schema_errors(tmp_path):
    path = tmp_path / "PROTOCOL.md"
    path.write_text("## OTHER\n", encoding="utf-8")
    source = MarkdownScheduleSource(str(path))

    with pytest.raises(ValueError) as excinfo:
        source.resolve_day(datetime.date(2026, 2, 16))

    assert str(path) in str(excinfo.value)
    assert "must contain a '## SCHEDULE' section" in str(excinfo.value)


def test_resolve_day_adds_source_path_to_invalid_override_errors(tmp_path):
    path = tmp_path / "PROTOCOL.md"
    path.write_text(
        "\n".join(
            [
                "## SCHEDULE",
                "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |",
                "| ---- | ----------- | --------- | ----------- | --------- | ------------- |",
                "| DEFAULT | 08:00 | 18:00 | 13:30 | 14:30 | 18:00 |",
                "| DATE:2026-02-16 | 19:00 | | | | |",
            ]
        ),
        encoding="utf-8",
    )
    source = MarkdownScheduleSource(str(path))

    with pytest.raises(ValueError) as excinfo:
        source.resolve_day(datetime.date(2026, 2, 16))

    assert str(path) in str(excinfo.value)
    assert "STUDY_START must be earlier than STUDY_END" in str(excinfo.value)
