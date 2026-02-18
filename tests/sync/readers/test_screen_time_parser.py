"""Tests for screen-time procrastination parser."""

from __future__ import annotations

from sync.readers.screen_time import parse_procrastination_table


class TestParseProcrastinationTable:
    def test_returns_none_when_section_missing(self):
        assert parse_procrastination_table(["### **OTHER**"]) is None

    def test_returns_none_when_header_missing(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "",
                "| APP | TIME |",
                "| --- | ---- |",
                "| YouTube | `30m` |",
            ]
        )
        assert result is None

    def test_returns_none_when_header_missing_without_blank_line(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "| APP | TIME |",
                "| --- | ---- |",
                "| YouTube | `30m` |",
            ]
        )
        assert result is None

    def test_parses_valid_rows_and_skips_total(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "",
                "| SOURCE | DURATION |",
                "| ------ | -------- |",
                "| YouTube | `1h15m` |",
                "| Instagram | `20m` |",
                "| **TOTAL** | `1h35m` |",
            ]
        )
        assert result is not None
        assert [(entry.app, entry.minutes) for entry in result.entries] == [
            ("YouTube", 75.0),
            ("Instagram", 20.0),
        ]

    def test_skips_no_screen_time_and_zero_rows(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "",
                "| SOURCE | DURATION |",
                "| ------ | -------- |",
                "| no screen time today | `0m` |",
                "| X | `0m` |",
            ]
        )
        assert result is None

    def test_skips_no_screen_time_message_case_insensitively(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "| SOURCE | DURATION |",
                "| ------ | -------- |",
                "| NO SCREEN TIME TODAY | `5m` |",
                "| no screen time now | `10m` |",
            ]
        )
        assert result is None

    def test_ignores_rows_with_missing_or_invalid_duration(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "| SOURCE | DURATION |",
                "| ------ | -------- |",
                "| YouTube | `` |",
                "| X | `abc` |",
            ]
        )
        assert result is None

    def test_stops_parsing_on_first_non_table_row(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "",
                "| SOURCE | DURATION |",
                "| ------ | -------- |",
                "| X | `10m` |",
                "not-a-table-row",
                "| YouTube | `30m` |",
            ]
        )
        assert result is not None
        assert [(entry.app, entry.minutes) for entry in result.entries] == [("X", 10.0)]

    def test_header_match_is_case_insensitive(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "",
                "| source | duration |",
                "| ------ | -------- |",
                "| X | `5m` |",
            ]
        )
        assert result is not None
        assert [(entry.app, entry.minutes) for entry in result.entries] == [("X", 5.0)]

    def test_accepts_rows_without_trailing_pipe(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "| SOURCE | DURATION |",
                "| ------ | -------- |",
                "| X | `5m`",
            ]
        )
        assert result is not None
        assert [(entry.app, entry.minutes) for entry in result.entries] == [("X", 5.0)]

    def test_malformed_short_row_does_not_break_following_rows(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "| SOURCE | DURATION |",
                "| ------ | -------- |",
                "|",
                "| X | `5m` |",
            ]
        )
        assert result is not None
        assert [(entry.app, entry.minutes) for entry in result.entries] == [("X", 5.0)]

    def test_total_and_no_screen_rows_do_not_break_following_rows(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "| SOURCE | DURATION |",
                "| ------ | -------- |",
                "| **TOTAL** | `30m` |",
                "| no screen time listed | `20m` |",
                "| X | `5m` |",
            ]
        )
        assert result is not None
        assert [(entry.app, entry.minutes) for entry in result.entries] == [("X", 5.0)]

    def test_one_minute_entries_are_kept(self):
        result = parse_procrastination_table(
            [
                "### **PROCRASTINATION**",
                "| SOURCE | DURATION |",
                "| ------ | -------- |",
                "| X | `1m` |",
            ]
        )
        assert result is not None
        assert [(entry.app, entry.minutes) for entry in result.entries] == [("X", 1.0)]
