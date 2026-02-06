"""
Tests for sync.study.breaks module.

Tests break duration logic, lunch window calculations, and overrun computations.
"""

from __future__ import annotations

import datetime

from sync.study.breaks import (
    get_expected_break_minutes,
    _compute_dynamic_lunch_window,
    overlap_minutes_with_window,
    clamp_next_study_within_day,
    anchor_lunch_window,
)


class TestGetExpectedBreakMinutes:
    """Tests for get_expected_break_minutes function."""

    def test_long_break_phase_uses_long_default(self):
        """longBreak phase returns long break default."""
        defaults = {"shortBreak": 5, "longBreak": 15}
        session = {"phase": "longBreak", "duration": 10}
        result = get_expected_break_minutes(session, defaults)
        assert result == 15

    def test_short_break_phase_uses_short_default(self):
        """shortBreak phase returns short break default."""
        defaults = {"shortBreak": 5, "longBreak": 15}
        session = {"phase": "shortBreak", "duration": 10}
        result = get_expected_break_minutes(session, defaults)
        assert result == 5

    def test_duration_upgrade_to_long_break(self):
        """Short break with long duration upgrades to long default."""
        defaults = {"shortBreak": 5, "longBreak": 15}
        session = {"phase": "shortBreak", "duration": 14}  # Within tolerance of 15
        result = get_expected_break_minutes(session, defaults)
        assert result == 15

    def test_no_session_uses_best_default(self):
        """No session returns best available default (longBreak first)."""
        defaults = {"shortBreak": 5, "longBreak": 15}
        result = get_expected_break_minutes(None, defaults)
        assert result == 15

    def test_fallback_to_30_when_no_defaults(self):
        """Returns 30 when no defaults available."""
        defaults = {"shortBreak": None, "longBreak": None}
        result = get_expected_break_minutes(None, defaults)
        assert result == 30


class TestComputeDynamicLunchWindow:
    """Tests for _compute_dynamic_lunch_window function."""

    def test_no_shift_when_no_sessions(self):
        """Returns base window when no sessions."""
        base = (datetime.time(13, 30), datetime.time(14, 30))
        result = _compute_dynamic_lunch_window([], base)
        assert result == base

    def test_no_shift_when_session_before_window(self):
        """No shift when session ends before window start."""
        base = (datetime.time(13, 30), datetime.time(14, 30))
        ref_date = datetime.date(2025, 12, 27)
        sessions = [
            {
                "start": datetime.datetime(2025, 12, 27, 10, 0),
                "end": datetime.datetime(2025, 12, 27, 12, 0),
            }
        ]
        result = _compute_dynamic_lunch_window(sessions, base, ref_date)
        assert result == base

    def test_shift_when_session_straddles_window(self):
        """Shifts when session straddles window start."""
        base = (datetime.time(13, 30), datetime.time(14, 30))
        ref_date = datetime.date(2025, 12, 27)
        sessions = [
            {
                "start": datetime.datetime(2025, 12, 27, 12, 0),
                "end": datetime.datetime(2025, 12, 27, 14, 0),
            }
        ]
        result = _compute_dynamic_lunch_window(sessions, base, ref_date)
        assert result is not None
        assert result[0] == datetime.time(14, 0)  # Shifted to session end
        # Duration should be preserved (1 hour)
        assert result[1] == datetime.time(15, 0)

    def test_none_base_window_returns_none(self):
        """Returns None when base window is None."""
        result = _compute_dynamic_lunch_window([], None)
        assert result is None


class TestOverlapMinutesWithWindow:
    """Tests for overlap_minutes_with_window function."""

    def test_full_overlap(self):
        """Full overlap returns full window duration."""
        window = (datetime.time(13, 0), datetime.time(14, 0))
        start = datetime.datetime(2025, 12, 27, 12, 0)
        end = datetime.datetime(2025, 12, 27, 15, 0)
        result = overlap_minutes_with_window(start, end, window)
        assert result == 60

    def test_partial_overlap_start(self):
        """Partial overlap at start of window."""
        window = (datetime.time(13, 0), datetime.time(14, 0))
        start = datetime.datetime(2025, 12, 27, 12, 30)
        end = datetime.datetime(2025, 12, 27, 13, 30)
        result = overlap_minutes_with_window(start, end, window)
        assert result == 30

    def test_no_overlap(self):
        """No overlap returns 0."""
        window = (datetime.time(13, 0), datetime.time(14, 0))
        start = datetime.datetime(2025, 12, 27, 10, 0)
        end = datetime.datetime(2025, 12, 27, 12, 0)
        result = overlap_minutes_with_window(start, end, window)
        assert result == 0

    def test_none_window_returns_zero(self):
        """None window returns 0."""
        start = datetime.datetime(2025, 12, 27, 12, 0)
        end = datetime.datetime(2025, 12, 27, 14, 0)
        result = overlap_minutes_with_window(start, end, None)
        assert result == 0


class TestClampNextStudyWithinDay:
    """Tests for clamp_next_study_within_day function."""

    def test_clamps_to_cutoff(self):
        """Next start after cutoff is clamped to cutoff."""
        session_end = datetime.datetime(2025, 12, 27, 17, 0)
        next_start = datetime.datetime(2025, 12, 27, 19, 0)
        cutoff = datetime.time(18, 0)
        result = clamp_next_study_within_day(session_end, next_start, cutoff)
        assert result == datetime.datetime(2025, 12, 27, 18, 0)

    def test_preserves_earlier_next_start(self):
        """Next start before cutoff is preserved."""
        session_end = datetime.datetime(2025, 12, 27, 16, 0)
        next_start = datetime.datetime(2025, 12, 27, 17, 0)
        cutoff = datetime.time(18, 0)
        result = clamp_next_study_within_day(session_end, next_start, cutoff)
        assert result == next_start

    def test_returns_none_when_no_gap(self):
        """Returns None when clamped next equals session end."""
        session_end = datetime.datetime(2025, 12, 27, 18, 0)
        next_start = datetime.datetime(2025, 12, 27, 19, 0)
        cutoff = datetime.time(18, 0)
        result = clamp_next_study_within_day(session_end, next_start, cutoff)
        assert result is None


class TestAnchorLunchWindow:
    """Tests for anchor_lunch_window function."""

    def test_anchors_within_lead_time(self):
        """Anchors when session ends within lead time of window."""
        base = (datetime.time(13, 30), datetime.time(14, 30))
        end_dt = datetime.datetime(2025, 12, 27, 13, 20)  # 10 min before window
        result = anchor_lunch_window(end_dt, base, lead_minutes=15)
        assert result is not None
        assert result[0] == datetime.time(13, 20)
        assert result[1] == datetime.time(14, 20)  # Preserves 1 hour duration

    def test_no_anchor_before_lead_time(self):
        """Does not anchor when session ends before lead time."""
        base = (datetime.time(13, 30), datetime.time(14, 30))
        end_dt = datetime.datetime(2025, 12, 27, 12, 0)  # Too early
        result = anchor_lunch_window(end_dt, base, lead_minutes=15)
        assert result is None

    def test_no_anchor_after_window_end(self):
        """Does not anchor when session ends after window end."""
        base = (datetime.time(13, 30), datetime.time(14, 30))
        end_dt = datetime.datetime(2025, 12, 27, 15, 0)  # Too late
        result = anchor_lunch_window(end_dt, base, lead_minutes=15)
        assert result is None

    def test_none_inputs_return_none(self):
        """Returns None when inputs are None."""
        assert anchor_lunch_window(None, None) is None
        assert anchor_lunch_window(datetime.datetime.now(), None) is None
