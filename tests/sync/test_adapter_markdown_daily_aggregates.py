"""Contract tests for MarkdownDailyAggregateSource adapter."""

from __future__ import annotations

import datetime

from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource


def test_load_for_dates_parses_existing_daily_notes(tmp_path):
    day = datetime.date(2026, 2, 6)
    note_path = tmp_path / f"{day:%Y-%m-%d}.md"
    note_path.write_text(
        "\n".join(
            [
                "---",
                "sleep: 7h00m",
                "mood: 7.0",
                "workout: true",
                "stretch: false",
                "meditate: false",
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
