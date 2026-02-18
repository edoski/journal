"""
Tests for sync.study.db module.

Tests session deduplication and timestamp conversion.
"""

from __future__ import annotations

import datetime

from sync.study.db import dedupe_sessions, core_data_to_datetime
from sync.study.constants import CORE_DATA_EPOCH_OFFSET


class TestCoreDataToDatetime:
    """Tests for core_data_to_datetime function."""

    def test_converts_timestamp(self):
        """Converts CoreData timestamp to Python datetime."""
        # CoreData timestamp for 2025-01-01 00:00:00 UTC
        # Python timestamp = 1735689600
        # CoreData timestamp = Python_ts - offset
        python_ts = 1735689600  # 2025-01-01 00:00:00 UTC
        core_data_ts = python_ts - CORE_DATA_EPOCH_OFFSET
        result = core_data_to_datetime(core_data_ts)
        assert result is not None
        # Note: Exact datetime depends on local timezone
        assert result.year == 2025

    def test_none_returns_none(self):
        """None input returns None."""
        result = core_data_to_datetime(None)
        assert result is None


class TestDedupeSessions:
    """Tests for dedupe_sessions function."""

    def test_no_duplicates_unchanged(self):
        """Sessions with no duplicates are unchanged."""
        sessions = [
            {
                "pk": 1,
                "pks": [1],
                "start": datetime.datetime(2025, 12, 27, 9, 0),
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
            {
                "pk": 2,
                "pks": [2],
                "start": datetime.datetime(2025, 12, 27, 11, 0),
                "end": datetime.datetime(2025, 12, 27, 12, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 12, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
        ]
        result = dedupe_sessions(sessions)
        assert len(result) == 2
        assert result[0]["pk"] == 1
        assert result[1]["pk"] == 2

    def test_merges_duplicates_within_tolerance(self):
        """Sessions within tolerance (60s default) are merged."""
        base_start = datetime.datetime(2025, 12, 27, 9, 0)
        sessions = [
            {
                "pk": 1,
                "pks": [1],
                "start": base_start,
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
            {
                "pk": 2,
                "pks": [2],
                "start": base_start
                + datetime.timedelta(seconds=30),  # 30s later, within tolerance
                "end": datetime.datetime(2025, 12, 27, 10, 5),
                "phase": "flow",
                "title": "Work",
                "completed_at": None,  # Open session
                "actual_elapsed": 65,
                "planned_duration": 60,
            },
        ]
        result = dedupe_sessions(sessions)
        assert len(result) == 1
        # Should have merged PKs
        assert set(result[0]["pks"]) == {1, 2}
        # When there's a completed session in the group, end comes from completed entries only
        # The completed session ended at 10:00
        assert result[0]["end"] == datetime.datetime(2025, 12, 27, 10, 0)

    def test_different_phases_not_merged(self):
        """Sessions with different phases are not merged."""
        base_start = datetime.datetime(2025, 12, 27, 9, 0)
        sessions = [
            {
                "pk": 1,
                "pks": [1],
                "start": base_start,
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
            {
                "pk": 2,
                "pks": [2],
                "start": base_start,
                "end": datetime.datetime(2025, 12, 27, 9, 15),
                "phase": "shortBreak",  # Different phase
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 9, 15),
                "actual_elapsed": 15,
                "planned_duration": 15,
            },
        ]
        result = dedupe_sessions(sessions)
        assert len(result) == 2

    def test_different_titles_not_merged(self):
        """Sessions with different titles are not merged."""
        base_start = datetime.datetime(2025, 12, 27, 9, 0)
        sessions = [
            {
                "pk": 1,
                "pks": [1],
                "start": base_start,
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
            {
                "pk": 2,
                "pks": [2],
                "start": base_start,
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Reading",  # Different title
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
        ]
        result = dedupe_sessions(sessions)
        assert len(result) == 2

    def test_empty_sessions_returns_empty(self):
        """Empty input returns empty list."""
        result = dedupe_sessions([])
        assert result == []

    def test_completed_session_anchors_times(self):
        """Completed session's times are preferred over open twins when within tolerance."""
        base_start = datetime.datetime(2025, 12, 27, 9, 0)
        sessions = [
            {
                "pk": 1,
                "pks": [1],
                "start": base_start,  # Same start (within tolerance)
                "end": datetime.datetime(2025, 12, 27, 11, 0),  # Ends later (open)
                "phase": "flow",
                "title": "Work",
                "completed_at": None,  # Open session
                "actual_elapsed": 120,
                "planned_duration": 60,
            },
            {
                "pk": 2,
                "pks": [2],
                "start": base_start
                + datetime.timedelta(seconds=10),  # Within tolerance
                "end": datetime.datetime(2025, 12, 27, 10, 0),
                "phase": "flow",
                "title": "Work",
                "completed_at": datetime.datetime(2025, 12, 27, 10, 0),  # Completed
                "actual_elapsed": 60,
                "planned_duration": 60,
            },
        ]
        result = dedupe_sessions(sessions)
        assert len(result) == 1
        # Start should be from completed session (anchored)
        assert result[0]["start"] == base_start + datetime.timedelta(seconds=10)
        # End should be from completed session (completed ends only)
        assert result[0]["end"] == datetime.datetime(2025, 12, 27, 10, 0)


class TestRetroactiveLunchDetection:
    """Tests for retroactive lunch detection logic.

    Note: These tests verify the logic conceptually since get_todays_sessions
    requires a real database connection. The actual integration is tested
    via the overlap_minutes_with_window function from breaks module.
    """

    def test_gap_overlap_detection(self):
        """Gap between sessions correctly detects lunch overlap."""
        from sync.study.breaks import overlap_minutes_with_window

        # Session ends at 13:10, next starts at 14:35
        # Lunch window is 13:30-14:30
        prev_end = datetime.datetime(2025, 12, 27, 13, 10)
        current_start = datetime.datetime(2025, 12, 27, 14, 35)
        lunch_window = (datetime.time(13, 30), datetime.time(14, 30))

        overlap = overlap_minutes_with_window(prev_end, current_start, lunch_window)
        # Gap 13:10-14:35 overlaps lunch 13:30-14:30 for 60 minutes
        assert overlap == 60

    def test_gap_overlap_partial(self):
        """Partial overlap with lunch window is detected."""
        from sync.study.breaks import overlap_minutes_with_window

        # Session ends at 14:00, next starts at 14:45
        # Lunch window is 13:30-14:30
        prev_end = datetime.datetime(2025, 12, 27, 14, 0)
        current_start = datetime.datetime(2025, 12, 27, 14, 45)
        lunch_window = (datetime.time(13, 30), datetime.time(14, 30))

        overlap = overlap_minutes_with_window(prev_end, current_start, lunch_window)
        # Gap 14:00-14:45 overlaps lunch 13:30-14:30 for 30 minutes (14:00-14:30)
        assert overlap == 30

    def test_no_overlap_before_lunch(self):
        """Gap entirely before lunch window has no overlap."""
        from sync.study.breaks import overlap_minutes_with_window

        # Session ends at 12:00, next starts at 13:00
        # Lunch window is 13:30-14:30
        prev_end = datetime.datetime(2025, 12, 27, 12, 0)
        current_start = datetime.datetime(2025, 12, 27, 13, 0)
        lunch_window = (datetime.time(13, 30), datetime.time(14, 30))

        overlap = overlap_minutes_with_window(prev_end, current_start, lunch_window)
        assert overlap == 0
