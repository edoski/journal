"""Focused tests for SLEEP table parsing."""

from __future__ import annotations

from sync.readers.sleep import parse_sleep_table


_HEADER = "| TIME | ASLEEP | AWAKE |"
_DIVIDER = "| ---- | -------- | ----- |"


def test_returns_empty_when_sleep_block_is_missing():
    assert parse_sleep_table(["# Daily", "No sleep section"]) == []


def test_returns_empty_when_header_is_missing():
    entries = parse_sleep_table(
        [
            "### **SLEEP**",
            "",
            "| SOMETHING | ELSE |",
            "| --------- | ---- |",
            "| x | y |",
            "",
        ]
    )
    assert entries == []


def test_parses_case_insensitive_header():
    entries = parse_sleep_table(
        [
            "### **SLEEP**",
            "",
            "| time | asleep | awake |",
            _DIVIDER,
            "| 23:00-07:00 | `8h00m` | `20m` |",
            "",
        ]
    )
    assert len(entries) == 1
    entry = entries[0]
    assert entry.duration_minutes == 480.0
    assert entry.awake_minutes == 20.0
    assert entry.asleep_time == "23:00"
    assert entry.awake_time == "07:00"


def test_parses_backtick_wrapped_time_range():
    entries = parse_sleep_table(
        [
            "### **SLEEP**",
            "",
            _HEADER,
            _DIVIDER,
            "| `22:30 - 06:45` | `8h15m` | `15m` |",
            "",
        ]
    )
    assert len(entries) == 1
    assert entries[0].asleep_time == "22:30"
    assert entries[0].awake_time == "06:45"


def test_no_time_range_sets_none():
    entries = parse_sleep_table(
        [
            "### **SLEEP**",
            "",
            _HEADER,
            _DIVIDER,
            "| N/A | `8h00m` | `20m` |",
            "",
        ]
    )
    assert len(entries) == 1
    assert entries[0].asleep_time is None
    assert entries[0].awake_time is None


def test_stops_at_first_non_table_line():
    entries = parse_sleep_table(
        [
            "### **SLEEP**",
            "",
            _HEADER,
            _DIVIDER,
            "| 23:00-07:00 | `8h00m` | `20m` |",
            "not a table row",
            "| 07:30-08:00 | `30m` | `5m` |",
            "",
        ]
    )
    assert len(entries) == 1
    assert entries[0].duration_minutes == 480.0


def test_ignores_short_rows_and_keeps_valid_rows():
    entries = parse_sleep_table(
        [
            "### **SLEEP**",
            "",
            _HEADER,
            _DIVIDER,
            "| short | row |",
            "| 23:00-07:00 | `8h00m` | `20m` |",
            "",
        ]
    )
    assert len(entries) == 1
    assert entries[0].duration_minutes == 480.0


def test_duration_defaults_to_zero_and_invalid_awake_defaults_to_zero():
    entries = parse_sleep_table(
        [
            "### **SLEEP**",
            "",
            _HEADER,
            _DIVIDER,
            "| 23:00-07:00 | `` | `bad` |",
            "",
        ]
    )
    assert len(entries) == 1
    entry = entries[0]
    assert entry.duration_minutes == 0.0
    assert entry.awake_minutes == 0.0


def test_header_after_preface_line_is_still_detected():
    entries = parse_sleep_table(
        [
            "### **SLEEP**",
            "",
            "Preface line",
            _HEADER,
            _DIVIDER,
            "| 23:00-07:00 | `8h00m` | `20m` |",
            "",
        ]
    )
    assert len(entries) == 1
    assert entries[0].duration_minutes == 480.0


def test_no_header_does_not_parse_pipe_rows():
    entries = parse_sleep_table(
        [
            "### **SLEEP**",
            "",
            "| SOMETHING | ELSE |",
            "| --- | --- |",
            "| 23:00-07:00 | `8h00m` | `20m` |",
            "",
        ]
    )
    assert entries == []


def test_valid_row_without_trailing_pipe_is_accepted():
    entries = parse_sleep_table(
        [
            "### **SLEEP**",
            "",
            _HEADER,
            _DIVIDER,
            "| 23:00-07:00 | `8h00m` | `20m`",
            "",
        ]
    )
    assert len(entries) == 1
    assert entries[0].duration_minutes == 480.0
    assert entries[0].awake_minutes == 20.0
