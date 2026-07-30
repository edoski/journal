"""
Characterization tests for daily parser behavior.
"""

from __future__ import annotations

import pytest

from sync.readers.daily import (
    _parse_training_table_rows,
    parse_daily_note,
)
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
            "| 09:00 - 11:00 | `coding` | `2h00m` | `+10m` | `15m (+5m)` |",
            "| 14:00 - 15:30 | `reading` | `1h30m` | `+1h30m` | `10m (+1h)` |",
            "",
            "### **SLEEP**",
            "",
            "| TIME | ASLEEP | AWAKE |",
            "| ---- | -------- | ----- |",
            "| 23:00-07:00 | `8h00m` | `20m` |",
            "| 07:30-08:30 | `1h00m` | `5m` |",
            "",
        ],
    )

    parsed = parse_daily_note(note_path)

    assert parsed == {
        "study_minutes": 210.0,
        "sleep_minutes": 435.0,  # frontmatter overrides sleep table sum
        "workout": True,
        "stretch": False,
        "awake_minutes": 25.0,
        "sleep_asleep_time": "23:00",
        "sleep_awake_time": "07:00",
        "activity_totals": {"coding": 120.0, "reading": 90.0},
        "interrupt_minutes": 100.0,
        "overrun_minutes": 65,
        "planned_break_minutes": 25,
        "training_type_minutes": {},
        "training_type_sessions": {},
        "training_type_duration_minutes": {},
        "training_type_interrupt_minutes": {},
        "training_type_start_minutes": {},
        "training_type_end_minutes": {},
    }


def test_parse_study_table_interrupt_hour_format_characterization():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
            "| ---- | -------- | -------- | --------- | ----- |",
            "| 09:00 | `coding` | `1h00m` | `+1h30m` | `5m` |",
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
                "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | EXTRA |",
                "| ---- | -------- | -------- | --------- | ----- | ----- |",
                "| 09:00 | `coding` | `1h00m` | `+00m` | `5m` | extra |",
                "",
            ]
        )


def test_parse_daily_note_error_includes_path_for_non_canonical_study(tmp_path):
    note_path = _write_note(
        tmp_path,
        [
            "---",
            "sleep: 7h",
            "workout: false",
            "stretch: false",
            "---",
            "",
            "## Metrics",
            "---",
            "### **STUDY**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | EXTRA |",
            "| ---- | -------- | -------- | --------- | ----- | ----- |",
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+00m` | `5m` | extra |",
            "",
        ],
        name="2025-12-23.md",
    )

    with pytest.raises(ValueError) as excinfo:
        parse_daily_note(note_path)

    message = str(excinfo.value)
    assert f"Invalid daily note schema in {note_path}:" in message
    assert "Non-canonical STUDY table header" in message


def test_parse_daily_note_returns_none_for_missing_file(tmp_path):
    missing = tmp_path / "missing.md"
    assert parse_daily_note(str(missing)) is None


def test_parse_daily_note_training_type_aggregates(tmp_path):
    note_path = _write_note(
        tmp_path,
        [
            "---",
            "sleep: 7h",
            "workout: true",
            "stretch: true",
            "---",
            "",
            "## Metrics",
            "---",
            "### **TRAINING**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00 - 08:00` | Traditional Strength Training | `1h00m` | `+05m` |",
            "| `18:00 - 18:30` | Stretching | `30m` | `+00m` |",
            "| `22:00 - 22:00` | Traditional Strength Training | `` | `+00m` |",
            "",
        ],
    )

    parsed = parse_daily_note(note_path)

    assert parsed is not None
    assert parsed["training_type_minutes"] == {
        "Traditional Strength Training": 60.0,
        "Stretching": 30.0,
    }
    assert parsed["training_type_sessions"] == {
        "Traditional Strength Training": 1,
        "Stretching": 1,
    }
    assert parsed["training_type_duration_minutes"] == {
        "Traditional Strength Training": (60.0,),
        "Stretching": (30.0,),
    }
    assert parsed["training_type_interrupt_minutes"] == {
        "Traditional Strength Training": (5.0,),
        "Stretching": (0.0,),
    }
    assert parsed["training_type_start_minutes"] == {
        "Traditional Strength Training": (420,),
        "Stretching": (1080,),
    }
    assert parsed["training_type_end_minutes"] == {
        "Traditional Strength Training": (480,),
        "Stretching": (1110,),
    }
    assert parsed["workout"] is True
    assert parsed["stretch"] is True


def test_parse_daily_note_rejects_non_canonical_training_time(tmp_path):
    note_path = _write_note(
        tmp_path,
        [
            "---",
            "sleep: 7h",
            "workout: true",
            "stretch: false",
            "---",
            "",
            "## Metrics",
            "---",
            "### **TRAINING**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00-07:30` | Lift | `30m` | `+00m` |",
        ],
    )

    with pytest.raises(ValueError) as excinfo:
        parse_daily_note(note_path)

    message = str(excinfo.value)
    assert f"Invalid daily note schema in {note_path}:" in message
    assert "Non-canonical TRAINING TIME value" in message


def test_parse_training_table_rows_handles_edge_cases():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00 - 08:00` | Lift | `1h00m` | `+00m` |",
            "| no training sessions |",
            "| malformed | row |",
            "| `08:00 - 08:30` | Lift | `` | `+00m` |",
            "not a table row",
            "| `09:00 - 09:30` | Run | `30m` | `+00m` |",
        ]
    )

    assert rows == [("Lift", 60.0, 0.0, 420, 480)]


def test_parse_training_table_rows_returns_empty_when_header_missing():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "",
            "| SOMETHING | ELSE |",
            "| --------- | ---- |",
            "| a | b |",
        ]
    )
    assert rows == []


def test_parse_training_table_rows_header_missing_without_blank_still_empty():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| APP | TIME |",
            "| --- | ---- |",
            "| Lift | `1h00m` |",
        ]
    )
    assert rows == []


def test_parse_training_table_rows_header_missing_no_blank_with_full_columns():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| APP | TIME |",
            "| --- | ---- |",
            "| 07:00 | Lift | `1h00m` | `+00m` |",
        ]
    )
    assert rows == []


def test_parse_training_table_rows_skips_no_training_message_case_insensitively():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| NO TRAINING SESSIONS |",
            "| `07:00 - 07:01` | `Lift` | `1m` | `+00m` |",
        ]
    )
    assert rows == [("Lift", 1.0, 0.0, 420, 421)]


def test_parse_training_table_rows_skips_no_training_message_even_if_row_shape_is_valid():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| 00:00 - 00:01 | no training sessions | 1m | +00m |",
            "| `07:00 - 07:01` | `Lift` | `1m` | `+00m` |",
        ]
    )
    assert rows == [("Lift", 1.0, 0.0, 420, 421)]


def test_parse_training_table_rows_activity_strip_keeps_non_backtick_edge_chars():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00 - 08:00` | `XLiftX` | `1h00m` | `+00m` |",
        ]
    )
    assert rows == [("XLiftX", 60.0, 0.0, 420, 480)]


def test_parse_training_table_rows_header_match_is_case_insensitive():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| time | activity | duration | interrupt |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00 - 07:10` | Lift | `10m` | `+00m` |",
        ]
    )
    assert rows == [("Lift", 10.0, 0.0, 420, 430)]


def test_parse_training_table_rows_short_row_does_not_break_following_rows():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| short | row |",
            "| `07:00 - 07:05` | Lift | `5m` | `+00m` |",
        ]
    )
    assert rows == [("Lift", 5.0, 0.0, 420, 425)]


def test_parse_training_table_rows_accepts_rows_without_trailing_pipe():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00 - 07:01` | Lift | `1m` | `+00m`",
        ]
    )
    assert rows == [("Lift", 1.0, 0.0, 420, 421)]


def test_parse_training_table_rows_rejects_non_canonical_time_range():
    with pytest.raises(ValueError, match="Non-canonical TRAINING TIME value"):
        _parse_training_table_rows(
            [
                "### **TRAINING**",
                "| TIME | ACTIVITY | DURATION | INTERRUPT |",
                "| ---- | -------- | -------- | --------- |",
                "| `07:00-07:01` | Lift | `1m` | `+00m` |",
            ]
        )


def test_parse_daily_note_uses_sleep_table_when_frontmatter_sleep_missing(tmp_path):
    note_path = _write_note(
        tmp_path,
        [
            "---",
            "workout: false",
            "stretch: false",
            "---",
            "",
            "## Metrics",
            "---",
            "### **SLEEP**",
            "",
            "| TIME | ASLEEP | AWAKE |",
            "| ---- | -------- | ----- |",
            "| 23:00-07:00 | `8h00m` | `15m` |",
            "| 08:00-09:00 | `1h00m` | `` |",
        ],
    )

    parsed = parse_daily_note(note_path)
    assert parsed is not None
    assert parsed["sleep_minutes"] == 540.0
    assert parsed["awake_minutes"] == 15.0


def test_parse_daily_note_sleep_absent_defaults(tmp_path):
    note_path = _write_note(
        tmp_path,
        [
            "---",
            "workout: no",
            "stretch: yes",
            "---",
            "",
            "## Metrics",
            "---",
            "### **STUDY**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
            "| ---- | -------- | -------- | --------- | ----- |",
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+00m` | `0m` |",
        ],
        name="2025-03-01.md",
    )

    parsed = parse_daily_note(note_path)
    assert parsed is not None
    assert parsed["sleep_minutes"] == 0
    assert parsed["awake_minutes"] is None
    assert parsed["workout"] is False
    assert parsed["stretch"] is False


def test_parse_daily_note_sleep_table_zero_duration_stays_zero(tmp_path):
    note_path = _write_note(
        tmp_path,
        [
            "---",
            "workout: false",
            "stretch: false",
            "---",
            "",
            "## Metrics",
            "---",
            "### **SLEEP**",
            "",
            "| TIME | ASLEEP | AWAKE |",
            "| ---- | -------- | ----- |",
            "| 23:00-23:00 | `` | `` |",
        ],
        name="2025-03-05.md",
    )
    parsed = parse_daily_note(note_path)
    assert parsed is not None
    assert parsed["sleep_minutes"] == 0


def test_parse_daily_note_aggregates_duplicate_keys_across_sections(tmp_path):
    note_path = _write_note(
        tmp_path,
        [
            "---",
            "sleep: 6h00m",
            "workout: true",
            "stretch: true",
            "---",
            "",
            "## Metrics",
            "---",
            "### **STUDY**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
            "| ---- | -------- | -------- | --------- | ----- |",
            "| 09:00 - 09:30 | `coding` | `30m` | `+00m` | `0m` |",
            "| 10:00 - 10:45 | `coding` | `45m` | `+00m` | `0m` |",
            "",
            "### **TRAINING**",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00 - 07:20` | Lift | `20m` | `+00m` |",
            "| `08:00 - 08:10` | Lift | `10m` | `+00m` |",
        ],
        name="2025-03-06.md",
    )
    parsed = parse_daily_note(note_path)
    assert parsed is not None
    assert parsed["activity_totals"] == {"coding": 75.0}
    assert parsed["training_type_minutes"] == {"Lift": 30.0}
    assert parsed["training_type_sessions"] == {"Lift": 2}
    assert parsed["training_type_duration_minutes"] == {"Lift": (20.0, 10.0)}
    assert parsed["training_type_interrupt_minutes"] == {"Lift": (0.0, 0.0)}
    assert parsed["training_type_start_minutes"] == {"Lift": (420, 480)}
    assert parsed["training_type_end_minutes"] == {"Lift": (440, 490)}
