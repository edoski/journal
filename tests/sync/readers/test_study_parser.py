"""Focused tests for STUDY table parsing."""

from __future__ import annotations

import pytest

from sync.readers.study import _strip_backticks, parse_study_table


_HEADER = "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |"
_DIVIDER = "| ---- | -------- | -------- | --------- | ----- |"


def test_returns_empty_when_canonical_header_is_missing():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            "| SOMETHING | ELSE |",
            "| --------- | ---- |",
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+10m` | `5m` |",
            "",
        ]
    )
    assert sessions == []


def test_no_header_with_immediately_parsable_row_still_returns_empty():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+10m` | `5m` |",
            "",
        ]
    )
    assert sessions == []


def test_strip_backticks_requires_wrapping_pair():
    assert _strip_backticks("`abc`") == "abc"
    assert _strip_backticks("`abc") == "`abc"
    assert _strip_backticks("abc`") == "abc`"
    assert _strip_backticks("``") == ""


def test_rejects_non_canonical_header_with_exact_message():
    with pytest.raises(ValueError) as excinfo:
        parse_study_table(
            [
                "### **STUDY**",
                "",
                "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | EXTRA |",
                "| ---- | -------- | -------- | --------- | ----- | ----- |",
                "| 09:00 - 10:00 | `coding` | `1h00m` | `+10m` | `5m` | extra |",
                "",
            ]
        )
    assert str(excinfo.value) == (
        "Non-canonical STUDY table header. Expected "
        "'| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |'"
    )


def test_skips_no_study_sessions_row_case_insensitively():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
            "| ---- | -------- | -------- | --------- | ----- |",
            "| no study sessions today |",
            "| NO STUDY SESSIONS |",
            "",
        ]
    )
    assert sessions == []


def test_stops_parsing_at_first_non_table_line():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
            "| ---- | -------- | -------- | --------- | ----- |",
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+05m` | `5m` |",
            "not-a-table-row",
            "| 10:00 - 11:00 | `reading` | `1h00m` | `+05m` | `5m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].activity == "coding"


def test_rejects_short_row_with_exact_message():
    with pytest.raises(ValueError) as excinfo:
        parse_study_table(
            [
                "### **STUDY**",
                "",
                "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
                "| ---- | -------- | -------- | --------- | ----- |",
                "| 09:00 - 10:00 | `coding` |",
                "",
            ]
        )
    assert str(excinfo.value) == (
        "Invalid STUDY row: expected TIME/ACTIVITY/DURATION/INTERRUPT/BREAK columns"
    )


def test_parses_time_interrupt_and_break():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| 09:15 - 11:00 | `coding` | `1h45m` | `+1h30m` | `20m (+15m)` |",
            "",
        ]
    )

    assert len(sessions) == 1
    session = sessions[0]
    assert session.start_time == "09:15"
    assert session.end_time == "11:00"
    assert session.activity == "coding"
    assert session.duration_minutes == 105.0
    assert session.interrupt_minutes == 90.0
    assert session.break_minutes == 20.0
    assert session.overrun_minutes == 15.0


def test_accepts_case_insensitive_canonical_header():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            "| time | activity | duration | interrupt | break |",
            _DIVIDER,
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+0m` | `0m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].activity == "coding"


@pytest.mark.parametrize(
    "header",
    [
        "| TIME | ACTIVITY | FOCUS | PAUSE | BREAK |",
        "| TIME | ACTIVITY | DURATION | PAUSE | BREAK |",
    ],
)
def test_rejects_non_canonical_focus_pause_prefixes(header: str):
    with pytest.raises(ValueError, match="Non-canonical STUDY table header"):
        parse_study_table(["### **STUDY**", "", header, _DIVIDER, ""])


def test_parses_single_time_without_end_time():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| 09:15 | `reading` | `45m` | `+0m` | `0m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].start_time == "09:15"
    assert sessions[0].end_time is None


def test_invalid_time_shape_keeps_empty_start_and_end():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| 9:15-10:00 | `reading` | `45m` | `+0m` | `0m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].start_time == ""
    assert sessions[0].end_time is None


def test_interrupt_minutes_prefer_hour_match_when_present():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+45m +1h30m` | `0m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].interrupt_minutes == 90.0


def test_break_overrun_defaults_to_zero_when_missing():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+10m` | `15m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].break_minutes == 15.0
    assert sessions[0].overrun_minutes == 0.0


def test_skips_rows_with_empty_activity_or_zero_duration():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| 09:00 - 10:00 | `` | `1h00m` | `+0m` | `0m` |",
            "| 10:00 - 11:00 | `coding` | `0m` | `+0m` | `0m` |",
            "| 11:00 - 12:00 | `reading` | `30m` | `+0m` | `0m` |",
            "",
        ]
    )
    assert [s.activity for s in sessions] == ["reading"]


def test_no_study_sessions_row_does_not_stop_following_valid_rows():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| no study sessions |",
            "| 09:00 - 09:30 | `coding` | `30m` | `+0m` | `0m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].activity == "coding"


def test_backtick_wrapped_time_is_parsed():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| `09:15 - 10:00` | `coding` | `45m` | `+0m` | `0m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].start_time == "09:15"
    assert sessions[0].end_time == "10:00"


def test_wrapped_time_with_non_backtick_edge_chars_is_not_sanitized():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| `X09:15 - 10:00X` | `coding` | `45m` | `+0m` | `0m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].start_time == ""
    assert sessions[0].end_time is None


def test_activity_backtick_unwrap_keeps_non_backtick_edge_chars():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| 09:00 - 10:00 | `XcodingX` | `1h00m` | `+0m` | `0m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].activity == "XcodingX"


def test_interrupt_hour_without_minute_defaults_to_zero_minute_component():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+1h` | `0m` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].interrupt_minutes == 60.0


def test_invalid_break_value_defaults_break_to_zero():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+0m` | `bad` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].break_minutes == 0.0


def test_invalid_break_overrun_value_defaults_overrun_to_zero():
    sessions = parse_study_table(
        [
            "### **STUDY**",
            "",
            _HEADER,
            _DIVIDER,
            "| 09:00 - 10:00 | `coding` | `1h00m` | `+0m` | `15m (+bad)` |",
            "",
        ]
    )
    assert len(sessions) == 1
    assert sessions[0].break_minutes == 15.0
    assert sessions[0].overrun_minutes == 0.0
