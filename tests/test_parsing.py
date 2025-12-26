"""
Tests for sync_utils.parsing module.

Covers duration parsing, value formatting, percent change calculations,
and other value transformation utilities.
"""
from __future__ import annotations

import pytest
from collections import OrderedDict

from sync_utils.parsing import (
    parse_frontmatter,
    parse_duration_to_minutes,
    format_minutes,
    format_minutes_seconds,
    ceil_minutes,
    round_half_up,
    parse_bool,
    compute_percent_change,
    format_percent_change,
    format_training_ratio,
    format_mood_with_scale,
)


class TestParseFrontmatter:
    """Tests for parse_frontmatter function."""

    def test_valid_frontmatter(self, sample_frontmatter_lines):
        result = parse_frontmatter(sample_frontmatter_lines)
        assert isinstance(result, OrderedDict)
        assert result["date"] == "2025-12-26"
        assert result["mood"] == "7.5"
        assert result["workout"] == "true"
        assert result["stretch"] == "false"
        assert result["sleep"] == "7h30m"

    def test_missing_frontmatter(self):
        lines = ["# No frontmatter", "", "Some content"]
        result = parse_frontmatter(lines)
        assert result == OrderedDict()

    def test_incomplete_frontmatter(self):
        lines = ["---", "key: value", "# No closing delimiter"]
        result = parse_frontmatter(lines)
        assert result == OrderedDict()

    def test_empty_lines(self):
        result = parse_frontmatter([])
        assert result == OrderedDict()

    def test_comments_in_frontmatter(self):
        lines = ["---", "key: value", "# comment line", "other: data", "---"]
        result = parse_frontmatter(lines)
        assert result["key"] == "value"
        assert result["other"] == "data"
        assert "# comment line" not in result

    def test_empty_value(self):
        lines = ["---", "key:", "---"]
        result = parse_frontmatter(lines)
        assert result["key"] == ""


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
        # 1h30m30s = 60 + 30 + 0.5 = 90.5
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


class TestFormatMinutes:
    """Tests for format_minutes function."""

    def test_hours_and_minutes(self):
        assert format_minutes(90) == "1h30m"
        assert format_minutes(120) == "2h00m"
        assert format_minutes(65) == "1h05m"

    def test_minutes_only(self):
        assert format_minutes(45) == "45m"
        assert format_minutes(5) == "5m"

    def test_zero(self):
        assert format_minutes(0) == "0m"
        assert format_minutes(0, always_show_both=True) == "0h00m"

    def test_always_show_both(self):
        assert format_minutes(45, always_show_both=True) == "0h45m"
        assert format_minutes(5, always_show_both=True) == "0h05m"
        assert format_minutes(90, always_show_both=True) == "1h30m"

    def test_none_input(self):
        assert format_minutes(None) == ""

    def test_negative_clamped_to_zero(self):
        assert format_minutes(-10) == "0m"

    def test_rounding(self):
        # Tests round_half_up behavior
        assert format_minutes(89.5) == "1h30m"  # 89.5 rounds to 90
        assert format_minutes(89.4) == "1h29m"  # 89.4 rounds to 89


class TestFormatMinutesSeconds:
    """Tests for format_minutes_seconds function."""

    def test_whole_minutes(self):
        assert format_minutes_seconds(5) == "5m"
        assert format_minutes_seconds(0) == "0m"

    def test_minutes_with_seconds(self):
        assert format_minutes_seconds(5.5) == "5m30s"
        assert format_minutes_seconds(1.25) == "1m15s"

    def test_seconds_round_to_60(self):
        # 5.99 min ~ 5m59.4s, rounds to 5m59s
        result = format_minutes_seconds(5.99)
        assert result in ("5m59s", "6m")  # depends on rounding

    def test_hour_overflow(self):
        assert format_minutes_seconds(65) == "1h05m"
        assert format_minutes_seconds(90.5) == "1h30m30s"

    def test_none_input(self):
        assert format_minutes_seconds(None) == ""


class TestCeilMinutes:
    """Tests for ceil_minutes function."""

    def test_whole_number(self):
        assert ceil_minutes(90) == 90
        assert ceil_minutes(0) == 0

    def test_fractional_rounds_up(self):
        assert ceil_minutes(89.1) == 90
        assert ceil_minutes(89.9) == 90
        assert ceil_minutes(0.1) == 1

    def test_tolerance_handling(self):
        # Very small fraction should not round up due to tolerance
        assert ceil_minutes(89.0000001) == 89
        assert ceil_minutes(90.0) == 90

    def test_none_input(self):
        assert ceil_minutes(None) == 0


class TestRoundHalfUp:
    """Tests for round_half_up function."""

    def test_round_down(self):
        assert round_half_up(89.4) == 89
        assert round_half_up(0.4) == 0

    def test_round_up(self):
        assert round_half_up(89.5) == 90
        assert round_half_up(89.6) == 90
        assert round_half_up(0.5) == 1

    def test_exact_whole_numbers(self):
        assert round_half_up(90.0) == 90
        assert round_half_up(0.0) == 0

    def test_tolerance_handling(self):
        # Tolerance adds 0.5000001, so 89.4999999 + 0.5000001 > 90 -> floor gives 90
        # This is intentional to handle float drift near the boundary
        assert round_half_up(89.4999999) == 90
        assert round_half_up(89.4) == 89

    def test_none_input(self):
        assert round_half_up(None) == 0


class TestParseBool:
    """Tests for parse_bool function."""

    def test_string_true(self):
        assert parse_bool("true") is True
        assert parse_bool("True") is True
        assert parse_bool("TRUE") is True
        assert parse_bool(" true ") is True

    def test_string_false(self):
        assert parse_bool("false") is False
        assert parse_bool("False") is False
        assert parse_bool("anything") is False

    def test_bool_input(self):
        assert parse_bool(True) is True
        assert parse_bool(False) is False

    def test_none_input(self):
        assert parse_bool(None) is False


class TestComputePercentChange:
    """Tests for compute_percent_change function."""

    def test_positive_change(self):
        assert compute_percent_change(110, 100) == 10.0
        assert compute_percent_change(200, 100) == 100.0

    def test_negative_change(self):
        assert compute_percent_change(90, 100) == -10.0
        assert compute_percent_change(50, 100) == -50.0

    def test_no_change(self):
        assert compute_percent_change(100, 100) == 0.0

    def test_zero_previous_with_current(self):
        # Avoids infinity - returns None
        assert compute_percent_change(100, 0) is None

    def test_both_zero(self):
        assert compute_percent_change(0, 0) == 0

    def test_none_inputs(self):
        assert compute_percent_change(None, 100) is None
        assert compute_percent_change(100, None) is None
        assert compute_percent_change(None, None) is None


class TestFormatPercentChange:
    """Tests for format_percent_change function."""

    def test_positive(self):
        assert format_percent_change(10) == "+10%"
        assert format_percent_change(100) == "+100%"

    def test_negative(self):
        assert format_percent_change(-10) == "-10%"
        assert format_percent_change(-50) == "-50%"

    def test_zero(self):
        assert format_percent_change(0) == "+0%"

    def test_none_returns_em_dash(self):
        assert format_percent_change(None) == "—"

    def test_rounding(self):
        assert format_percent_change(10.4) == "+10%"
        assert format_percent_change(10.5) == "+11%"


class TestFormatTrainingRatio:
    """Tests for format_training_ratio function."""

    def test_weekly_no_padding(self):
        assert format_training_ratio(5, 7) == "5/7"
        assert format_training_ratio(0, 7) == "0/7"
        assert format_training_ratio(7, 7) == "7/7"

    def test_monthly_zero_padded(self):
        assert format_training_ratio(5, 31) == "05/31"
        assert format_training_ratio(15, 30) == "15/30"
        assert format_training_ratio(0, 28) == "00/28"


class TestFormatMoodWithScale:
    """Tests for format_mood_with_scale function."""

    def test_decimal_value(self):
        assert format_mood_with_scale(7.5) == "7.5/10.0"
        assert format_mood_with_scale(5.0) == "5.0/10.0"

    def test_whole_number(self):
        assert format_mood_with_scale(8) == "8.0/10.0"
        assert format_mood_with_scale(10) == "10.0/10.0"

    def test_none_returns_zero(self):
        assert format_mood_with_scale(None) == "0.0/10.0"

    def test_zero(self):
        assert format_mood_with_scale(0) == "0.0/10.0"
