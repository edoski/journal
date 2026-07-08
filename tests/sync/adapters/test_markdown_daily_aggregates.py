"""Contract tests for MarkdownDailyAggregateSource adapter."""

from __future__ import annotations

import datetime

import pytest

from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource


def test_load_for_dates_parses_existing_daily_notes(tmp_path):
    day = datetime.date(2026, 2, 6)
    note_path = tmp_path / f"{day:%Y-%m-%d}.md"
    note_path.write_text(
        "\n".join(
            [
                "---",
                "sleep: 7h00m",
                "workout: true",
                "stretch: false",
                "---",
                "",
                "## Metrics",
                "---",
                "### **STUDY**",
                "",
                "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
                "| ---- | -------- | -------- | --------- | ----- |",
                "| 09:00 - 10:00 | `coding` | `1h00m` | `+10m` | `5m` |",
                "",
            ]
        ),
        encoding="utf-8",
    )

    source = MarkdownDailyAggregateSource(str(tmp_path))
    data = source.load_for_dates([day])

    assert day in data
    assert data[day]["study_minutes"] == 60.0
    assert data[day]["interrupt_minutes"] == 10.0
    assert data[day]["sleep_minutes"] == 420.0


def test_load_for_dates_skips_missing_notes(tmp_path):
    source = MarkdownDailyAggregateSource(str(tmp_path))
    data = source.load_for_dates([datetime.date(2026, 2, 6)])
    assert data == {}


def test_load_for_dates_raises_for_non_canonical_study_header(tmp_path):
    day = datetime.date(2025, 12, 23)
    note_path = tmp_path / f"{day:%Y-%m-%d}.md"
    note_path.write_text(
        "\n".join(
            [
                "---",
                "sleep: 7h00m",
                "workout: true",
                "stretch: false",
                "---",
                "",
                "## Metrics",
                "---",
                "### **STUDY**",
                "",
                "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | EXTRA |",
                "| ---- | -------- | -------- | --------- | ----- | ----- |",
                "| 09:00 - 10:00 | `coding` | `1h00m` | `+10m` | `5m` | extra |",
                "",
            ]
        ),
        encoding="utf-8",
    )

    source = MarkdownDailyAggregateSource(str(tmp_path))
    with pytest.raises(
        ValueError, match="Invalid daily note schema in requested window"
    ):
        source.load_for_dates([day])


def test_load_for_dates_aggregates_non_canonical_study_header_errors(tmp_path):
    day_one = datetime.date(2025, 12, 21)
    day_two = datetime.date(2025, 12, 23)
    shared_lines = [
        "---",
        "sleep: 7h00m",
        "workout: true",
        "stretch: false",
        "---",
        "",
        "## Metrics",
        "---",
        "### **STUDY**",
        "",
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | EXTRA |",
        "| ---- | -------- | -------- | --------- | ----- | ----- |",
        "| 09:00 - 10:00 | `coding` | `1h00m` | `+10m` | `5m` | extra |",
        "",
    ]
    (tmp_path / f"{day_one:%Y-%m-%d}.md").write_text(
        "\n".join(shared_lines),
        encoding="utf-8",
    )
    (tmp_path / f"{day_two:%Y-%m-%d}.md").write_text(
        "\n".join(shared_lines),
        encoding="utf-8",
    )

    source = MarkdownDailyAggregateSource(str(tmp_path))
    with pytest.raises(ValueError) as excinfo:
        source.load_for_dates([day_two, day_one])

    message = str(excinfo.value)
    assert "Invalid daily note schema in requested window (2 file(s))" in message
    assert (
        f"- {day_one.isoformat()} | {tmp_path / f'{day_one:%Y-%m-%d}.md'} |" in message
    )
    assert (
        f"- {day_two.isoformat()} | {tmp_path / f'{day_two:%Y-%m-%d}.md'} |" in message
    )
    assert "Required canonical STUDY header:" in message
    assert "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |" in message
    assert "Non-canonical STUDY table header" in message


def test_load_for_dates_raises_for_non_canonical_study_header_reason(tmp_path):
    day = datetime.date(2025, 12, 23)
    note_path = tmp_path / f"{day:%Y-%m-%d}.md"
    note_path.write_text(
        "\n".join(
            [
                "---",
                "sleep: 7h00m",
                "workout: true",
                "stretch: false",
                "---",
                "",
                "## Metrics",
                "---",
                "### **STUDY**",
                "",
                "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | EXTRA |",
                "| ---- | -------- | -------- | --------- | ----- | ----- |",
                "| 09:00 - 10:00 | `coding` | `1h00m` | `+10m` | `5m` | extra |",
                "",
            ]
        ),
        encoding="utf-8",
    )

    source = MarkdownDailyAggregateSource(str(tmp_path))
    with pytest.raises(ValueError, match="Non-canonical STUDY table header"):
        source.load_for_dates([day])
