"""
Tests for daily_sync module internals.

Covers training table parsing and other daily_sync-specific functions.
"""
from __future__ import annotations

import sys
import os

# Add the journal directory to path so we can import sync.daily
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sync.daily.training import _parse_training_table


class TestParseTrainingTable:
    """Tests for _parse_training_table function."""

    def test_none_input_returns_empty_list(self):
        """Ensure None input doesn't crash and returns empty list."""
        result = _parse_training_table(None)
        assert result == []

    def test_empty_list_returns_empty_list(self):
        """Empty input returns empty list."""
        result = _parse_training_table([])
        assert result == []

    def test_no_header_returns_empty_list(self):
        """Lines without a training table header return empty list."""
        lines = ["Some content", "More content"]
        result = _parse_training_table(lines)
        assert result == []

    def test_parses_training_table(self):
        """Parses a valid training table correctly."""
        lines = [
            "### **TRAINING**",
            "",
            "| TIME | ACTIVITY | DURATION | CALORIES |",
            "| ---- | -------- | -------- | -------- |",
            "| `09:00 - 10:00` | Workout | `60m` | `300` |",
            "| `14:00` | Stretching | `15m` | `50` |",
        ]
        result = _parse_training_table(lines)
        assert len(result) == 2
        
        # First entry
        assert result[0]["start"] == "09:00"
        assert result[0]["end"] == "10:00"
        assert result[0]["activity"] == "Workout"
        assert result[0]["duration"] == "60m"
        assert result[0]["calories"] == "300"
        
        # Second entry (no end time)
        assert result[1]["start"] == "14:00"
        assert result[1]["end"] is None
        assert result[1]["activity"] == "Stretching"

    def test_handles_missing_columns_gracefully(self):
        """Rows with fewer than expected columns are skipped."""
        lines = [
            "| TIME | ACTIVITY | DURATION | CALORIES |",
            "| ---- | -------- | -------- | -------- |",
            "| `09:00` | Workout |",  # incomplete row
        ]
        result = _parse_training_table(lines)
        assert result == []
