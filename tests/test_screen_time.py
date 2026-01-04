"""
Tests for screen time parsing and rendering.

Covers duration parsing, activity line parsing, device merging,
threshold filtering, and markdown table rendering.
"""

from __future__ import annotations

import pytest

from sync.daily.screen_time import (
    _parse_duration_string,
    _parse_activity_line,
    _parse_activity_field,
    _build_procrastination_section,
)
from sync.models.screen_time import ScreenTimeEntry, DailyScreenTimeData


class TestParseDurationString:
    """Tests for _parse_duration_string function."""

    def test_hours_and_minutes(self):
        assert _parse_duration_string("3h 41m") == 221.0
        assert _parse_duration_string("1h 30m") == 90.0
        assert _parse_duration_string("2h 0m") == 120.0

    def test_minutes_only(self):
        assert _parse_duration_string("41m") == 41.0
        assert _parse_duration_string("5m") == 5.0

    def test_seconds_only(self):
        assert _parse_duration_string("59s") == pytest.approx(59 / 60, rel=0.01)
        assert _parse_duration_string("30s") == 0.5

    def test_minutes_and_seconds(self):
        assert _parse_duration_string("1m30s") == 1.5
        assert _parse_duration_string("5m 30s") == 5.5

    def test_hours_only(self):
        assert _parse_duration_string("2h") == 120.0

    def test_full_format(self):
        # 1h 30m 30s = 60 + 30 + 0.5 = 90.5
        assert _parse_duration_string("1h 30m 30s") == 90.5

    def test_empty_string(self):
        assert _parse_duration_string("") == 0.0

    def test_whitespace_variations(self):
        assert _parse_duration_string(" 3h  41m ") == 221.0
        assert _parse_duration_string("3h41m") == 221.0


class TestParseActivityLine:
    """Tests for _parse_activity_line function."""

    def test_standard_format(self):
        result = _parse_activity_line("Netflix (3h 41m)")
        assert result == ("Netflix", 221.0)

    def test_app_with_spaces(self):
        result = _parse_activity_line("Brawl Stars (41m)")
        assert result == ("Brawl Stars", 41.0)

    def test_app_with_colon(self):
        result = _parse_activity_line("Snapchat: chatta con gli amici (11s)")
        assert result is not None
        assert result[0] == "Snapchat: chatta con gli amici"
        assert result[1] == pytest.approx(11 / 60, rel=0.01)

    def test_seconds_only(self):
        result = _parse_activity_line("WhatsApp (59s)")
        assert result is not None
        assert result[0] == "WhatsApp"
        assert result[1] == pytest.approx(59 / 60, rel=0.01)

    def test_empty_line(self):
        assert _parse_activity_line("") is None
        assert _parse_activity_line("   ") is None

    def test_invalid_format(self):
        assert _parse_activity_line("No parentheses") is None
        assert _parse_activity_line("Missing (") is None


class TestParseActivityField:
    """Tests for _parse_activity_field function."""

    def test_multiple_lines(self):
        activity = "Netflix (3h 41m)\nYouTube (41m)\nInstagram (20m)"
        result = _parse_activity_field(activity)
        assert result == {"Netflix": 221.0, "YouTube": 41.0, "Instagram": 20.0}

    def test_duplicate_apps_summed(self):
        activity = "YouTube (30m)\nYouTube (20m)"
        result = _parse_activity_field(activity)
        assert result == {"YouTube": 50.0}

    def test_empty_field(self):
        assert _parse_activity_field(None) == {}
        assert _parse_activity_field("") == {}

    def test_with_invalid_lines(self):
        activity = "Netflix (1h)\nInvalid line\nYouTube (30m)"
        result = _parse_activity_field(activity)
        assert result == {"Netflix": 60.0, "YouTube": 30.0}


class TestBuildProcrastinationSection:
    """Tests for _build_procrastination_section function."""

    def test_with_data(self):
        data = DailyScreenTimeData(
            entries=[
                ScreenTimeEntry(app="YouTube", minutes=75),
                ScreenTimeEntry(app="Instagram", minutes=20),
                ScreenTimeEntry(app="X", minutes=5),
            ]
        )
        lines = _build_procrastination_section(data)

        assert "### **PROCRASTINATION**" in lines
        assert any("YouTube" in line and "`+1h15m`" in line for line in lines)
        assert any("Instagram" in line and "`+20m`" in line for line in lines)
        assert any("X" in line and "`+5m`" in line for line in lines)
        assert any("**TOTAL**" in line and "`1h40m`" in line for line in lines)

    def test_sorted_descending(self):
        data = DailyScreenTimeData(
            entries=[
                ScreenTimeEntry(app="Small", minutes=5),
                ScreenTimeEntry(app="Large", minutes=100),
                ScreenTimeEntry(app="Medium", minutes=30),
            ]
        )
        lines = _build_procrastination_section(data)
        table_lines = [line for line in lines if line.startswith("| ") and "SOURCE" not in line and "---" not in line]

        # First entry should be Large (100m), then Medium (30m), then Small (5m), then TOTAL
        assert "Large" in table_lines[0]
        assert "Medium" in table_lines[1]
        assert "Small" in table_lines[2]
        assert "TOTAL" in table_lines[3]

    def test_no_data(self):
        lines = _build_procrastination_section(None)
        assert "### **PROCRASTINATION**" in lines
        assert any("No screen time data" in line for line in lines)

    def test_empty_entries(self):
        """Empty entries with shortcut_ran=True renders TOTAL +0m."""
        data = DailyScreenTimeData(entries=[], shortcut_ran=True)
        lines = _build_procrastination_section(data)
        assert any("**TOTAL**" in line and "+0m" in line for line in lines)
