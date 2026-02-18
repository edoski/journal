"""Tests for duration parsing."""

from __future__ import annotations

from sync.readers.common import parse_duration_to_minutes


class TestParseDurationToMinutes:
    """Tests for parse_duration_to_minutes function."""

    def test_hours_and_minutes(self):
        assert parse_duration_to_minutes("1h30m") == 90.0
        assert parse_duration_to_minutes("2h00m") == 120.0
        assert parse_duration_to_minutes("0h45m") == 45.0

    def test_minutes_only(self):
        assert parse_duration_to_minutes("90m") == 90.0
        assert parse_duration_to_minutes("45m") == 45.0
        assert parse_duration_to_minutes("0m") == 0.0

    def test_hours_only(self):
        assert parse_duration_to_minutes("2h") == 120.0
        assert parse_duration_to_minutes("1h") == 60.0

    def test_minutes_and_seconds(self):
        assert parse_duration_to_minutes("1m30s") == 1.5
        assert parse_duration_to_minutes("5m00s") == 5.0
        assert parse_duration_to_minutes("0m30s") == 0.5

    def test_full_format(self):
        assert parse_duration_to_minutes("1h30m30s") == 90.5

    def test_none_input(self):
        assert parse_duration_to_minutes(None) is None

    def test_empty_string(self):
        assert parse_duration_to_minutes("") is None

    def test_numeric_input(self):
        assert parse_duration_to_minutes(90) == 90.0
        assert parse_duration_to_minutes(45.5) == 45.5

    def test_backtick_stripping(self):
        assert parse_duration_to_minutes("`1h30m`") == 90.0
        assert parse_duration_to_minutes("`45m`") == 45.0

    def test_decimal_values(self):
        assert parse_duration_to_minutes("1.5h") == 90.0
        assert parse_duration_to_minutes("30.5m") == 30.5

    def test_default_is_used_for_none_and_empty(self):
        assert parse_duration_to_minutes(None, default=5.0) == 5.0
        assert parse_duration_to_minutes("", default=7.0) == 7.0
        assert parse_duration_to_minutes("``", default=9.0) == 9.0

    def test_invalid_non_empty_text_returns_zero_minutes(self):
        assert parse_duration_to_minutes("abc") == 0.0
        assert parse_duration_to_minutes("90") == 0.0

    def test_case_insensitive_parsing(self):
        assert parse_duration_to_minutes("1H30M15S") == 90.25

    def test_ms_suffix_does_not_count_as_minutes_or_seconds(self):
        assert parse_duration_to_minutes("30ms") == 0.0

    def test_default_not_used_for_non_empty_non_duration_text(self):
        assert parse_duration_to_minutes("X", default=5.0) == 0.0
