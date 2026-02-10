"""
Characterization tests for daily parser behavior.
"""

from __future__ import annotations

import pytest

from sync.readers.daily import parse_daily_note
from sync.readers.study import parse_study_table


def _write_note(tmp_path, lines: list[str], name: str = "2025-01-15.md") -> str:
    path = tmp_path / name
    path.write_text("\n".join(lines) + "\n")
    return str(path)


def test_parse_daily_note_characterization(tmp_path):
    note_path = _write_note(
        tmp_path,
        [
            "---",
            "sleep: 7h15m",
            "mood: 7.5",
            "workout: true",
            "stretch: false",
            "meditate: true",
            "---",
            "",
            "## Metrics",
            "---",
            "### **STUDY**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |",
            "| ---- | -------- | -------- | --------- | ----- | ------- | ----- |",
            "| 09:00 - 11:00 | `coding` | `2h00m` | `+10m` | `15m (+5m)` | [[code.md]] | – |",
            "| 14:00 - 15:30 | `reading` | `1h30m` | `+1h30m` | `10m (+1h)` | [[read.md]] | – |",
            "",
            "### **SLEEP**",
            "",
            "| TIME | DURATION | AWAKE | AWAKENINGS |",
            "| ---- | -------- | ----- | ---------- |",
            "| 23:00-07:00 | `8h00m` | `20m` | `2` |",
            "| 07:30-08:30 | `1h00m` | `5m` | `1` |",
            "",
            "### **PROCRASTINATION**",
            "",
            "| SOURCE | DURATION |",
            "| ------ | -------- |",
            "| YouTube | `1h30m` |",
            "| X | `30m` |",
            "| **TOTAL** | `2h00m` |",
            "",
        ],
    )

    parsed = parse_daily_note(note_path)

    assert parsed == {
        "study_minutes": 210.0,
        "sleep_minutes": 435.0,  # frontmatter overrides sleep table sum
        "mood": 7.5,
        "workout": True,
        "stretch": False,
        "meditate": True,
        "awake_minutes": 25.0,
        "awakenings": 3,
        "activity_totals": {"coding": 120.0, "reading": 90.0},
        "interrupt_minutes": 100.0,
        "overrun_minutes": 65,
        "planned_break_minutes": 25,
        "training_type_minutes": {},
        "training_type_sessions": {},
        "screen_time_totals": {"YouTube": 90.0, "X": 30.0},
    }


def test_parse_study_table_interrupt_hour_format_characterization():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |",
            "| ---- | -------- | -------- | --------- | ----- | ------- | ----- |",
            "| 09:00 | `coding` | `1h00m` | `+1h30m` | `5m` | – | – |",
            "",
        ]
    )

    assert len(sessions) == 1
    assert sessions[0].activity == "coding"
    assert sessions[0].duration_minutes == 60.0
    assert sessions[0].interrupt_minutes == 90.0
    assert sessions[0].overrun_minutes == 0
    assert sessions[0].break_minutes == 5


def test_parse_study_table_rejects_non_canonical_header():
    with pytest.raises(ValueError, match="Non-canonical STUDY table header"):
        parse_study_table(
            [
                "### **STUDY**",
                "",
                "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | NOTES |",
                "| ---- | -------- | -------- | --------- | ----- | ----- |",
                "| 09:00 | `coding` | `1h00m` | `+00m` | `5m` | note |",
                "",
            ]
        )


def test_parse_daily_note_returns_none_for_missing_file(tmp_path):
    missing = tmp_path / "missing.md"
    assert parse_daily_note(str(missing)) is None


def test_parse_daily_note_training_type_aggregates(tmp_path):
    note_path = _write_note(
        tmp_path,
        [
            "---",
            "sleep: 7h",
            "mood: 7.0",
            "workout: true",
            "stretch: true",
            "meditate: true",
            "---",
            "",
            "## Metrics",
            "---",
            "### **TRAINING**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00 - 08:00` | Traditional Strength Training | `1h00m` | `+00m` |",
            "| `18:00 - 18:30` | Stretching | `30m` | `+00m` |",
            "| `21:00 - 21:15` | Meditation | `15m` | `+00m` |",
            "| `22:00 - 22:00` | Traditional Strength Training | `` | `+00m` |",
            "",
        ],
    )

    parsed = parse_daily_note(note_path)

    assert parsed is not None
    assert parsed["training_type_minutes"] == {
        "Traditional Strength Training": 60.0,
        "Stretching": 30.0,
        "Meditation": 15.0,
    }
    assert parsed["training_type_sessions"] == {
        "Traditional Strength Training": 1,
        "Stretching": 1,
        "Meditation": 1,
    }
