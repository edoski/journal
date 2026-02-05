"""
Characterization tests for daily parser behavior.

These tests lock down current parser semantics before compatibility removals.
"""

from __future__ import annotations

from sync.notes_parsing import parse_daily_note as legacy_parse_daily_note
from sync.notes_parsing import parse_study_table
from sync.readers.daily import parse_daily_note as reader_parse_daily_note


def _write_note(tmp_path, lines: list[str], name: str = "2025-01-15.md") -> str:
    path = tmp_path / name
    path.write_text("\n".join(lines) + "\n")
    return str(path)


def test_parse_daily_note_characterization_matches_legacy_output(tmp_path):
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
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
            "| ---- | -------- | -------- | --------- | ----- |",
            "| 09:00 - 11:00 | `coding` | `2h00m` | `+10m` | `15m (+5m)` |",
            "| 14:00 - 15:30 | `reading` | `1h30m` | `+1h30m` | `10m (+1h)` |",
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

    legacy = legacy_parse_daily_note(note_path)
    reader = reader_parse_daily_note(note_path)

    assert legacy == reader
    assert legacy == {
        "study_minutes": 210.0,
        "sleep_minutes": 435.0,  # frontmatter overrides sleep table sum
        "mood": 7.5,
        "workout": True,
        "stretch": False,
        "meditate": True,
        "awake_minutes": 25.0,
        "awakenings": 3,
        "activity_totals": {"coding": 120.0, "reading": 90.0},
        "interrupt_minutes": 10,  # +1h30m is intentionally not parsed here
        "overrun_minutes": 65,
        "planned_break_minutes": 25,
        "screen_time_totals": {"YouTube": 90.0, "X": 30.0},
    }


def test_parse_study_table_interrupt_hour_format_characterization():
    rows = parse_study_table(
        [
            "### **STUDY**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
            "| ---- | -------- | -------- | --------- | ----- |",
            "| 09:00 | `coding` | `1h00m` | `+1h30m` | `5m` |",
            "",
        ]
    )

    assert len(rows) == 1
    assert rows[0][0] == "coding"
    assert rows[0][1] == 60.0
    assert rows[0][2] == 0  # current parser behavior
    assert rows[0][3] == 0
    assert rows[0][4] == 5


def test_parse_daily_note_returns_none_for_missing_file(tmp_path):
    missing = tmp_path / "missing.md"
    assert legacy_parse_daily_note(str(missing)) is None
    assert reader_parse_daily_note(str(missing)) is None
