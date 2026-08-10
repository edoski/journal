"""
Characterization tests for daily parser behavior.
"""

from __future__ import annotations

import pytest

from sync.contracts.metrics import TrainingOccurrence
from sync.readers.daily import (
    _parse_training_table_rows,
    parse_daily_note,
)
from sync.readers.study import parse_study_table


def _note_lines(lines: list[str]) -> list[str]:
    return lines


def test_parse_daily_note_characterization():
    note_lines = _note_lines(
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

    parsed = parse_daily_note(note_lines)

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
        "training_occurrences": (),
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


def test_parse_daily_note_reports_non_canonical_study_content():
    note_lines = _note_lines(
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
    )

    with pytest.raises(ValueError, match="Non-canonical STUDY table header"):
        parse_daily_note(note_lines)


def test_parse_daily_note_training_type_aggregates():
    note_lines = _note_lines(
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

    parsed = parse_daily_note(note_lines)

    assert parsed["training_occurrences"] == (
        TrainingOccurrence(
            activity="Traditional Strength Training",
            duration_minutes=60.0,
            interrupt_minutes=5.0,
            start_minutes=420,
            end_minutes=480,
        ),
        TrainingOccurrence(
            activity="Stretching",
            duration_minutes=30.0,
            interrupt_minutes=0.0,
            start_minutes=1080,
            end_minutes=1110,
        ),
    )
    assert parsed["workout"] is True
    assert parsed["stretch"] is True


def test_parse_daily_note_rejects_non_canonical_training_time():
    note_lines = _note_lines(
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
        parse_daily_note(note_lines)

    message = str(excinfo.value)
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

    assert rows == [TrainingOccurrence("Lift", 60.0, 0.0, 420, 480)]


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
    assert rows == [TrainingOccurrence("Lift", 1.0, 0.0, 420, 421)]


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
    assert rows == [TrainingOccurrence("Lift", 1.0, 0.0, 420, 421)]


def test_parse_training_table_rows_activity_strip_keeps_non_backtick_edge_chars():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00 - 08:00` | `XLiftX` | `1h00m` | `+00m` |",
        ]
    )
    assert rows == [TrainingOccurrence("XLiftX", 60.0, 0.0, 420, 480)]


def test_parse_training_table_rows_header_match_is_case_insensitive():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| time | activity | duration | interrupt |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00 - 07:10` | Lift | `10m` | `+00m` |",
        ]
    )
    assert rows == [TrainingOccurrence("Lift", 10.0, 0.0, 420, 430)]


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
    assert rows == [TrainingOccurrence("Lift", 5.0, 0.0, 420, 425)]


def test_parse_training_table_rows_accepts_rows_without_trailing_pipe():
    rows = _parse_training_table_rows(
        [
            "### **TRAINING**",
            "| TIME | ACTIVITY | DURATION | INTERRUPT |",
            "| ---- | -------- | -------- | --------- |",
            "| `07:00 - 07:01` | Lift | `1m` | `+00m`",
        ]
    )
    assert rows == [TrainingOccurrence("Lift", 1.0, 0.0, 420, 421)]


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


def test_parse_daily_note_uses_sleep_table_when_frontmatter_sleep_missing():
    note_lines = _note_lines(
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

    parsed = parse_daily_note(note_lines)
    assert parsed["sleep_minutes"] == 540.0
    assert parsed["awake_minutes"] == 15.0


def test_parse_daily_note_sleep_absent_defaults():
    note_lines = _note_lines(
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
    )

    parsed = parse_daily_note(note_lines)
    assert parsed["sleep_minutes"] == 0
    assert parsed["awake_minutes"] is None
    assert parsed["workout"] is False
    assert parsed["stretch"] is False


def test_parse_daily_note_sleep_table_zero_duration_stays_zero():
    note_lines = _note_lines(
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
    )
    parsed = parse_daily_note(note_lines)
    assert parsed["sleep_minutes"] == 0


def test_parse_daily_note_aggregates_duplicate_keys_across_sections():
    note_lines = _note_lines(
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
    )
    parsed = parse_daily_note(note_lines)
    assert parsed["activity_totals"] == {"coding": 75.0}
    assert parsed["training_occurrences"] == (
        TrainingOccurrence("Lift", 20.0, 0.0, 420, 440),
        TrainingOccurrence("Lift", 10.0, 0.0, 480, 490),
    )
