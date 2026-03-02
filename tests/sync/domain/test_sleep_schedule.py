"""Tests for sleep schedule averaging helpers in the period engine."""

from __future__ import annotations

import datetime
from sync.periods.builders.common import avg_time_of_day, compute_avg_schedule


class TestAvgTimeOfDay:
    def test_empty_list_returns_none(self):
        assert avg_time_of_day([], is_evening=True) is None
        assert avg_time_of_day([], is_evening=False) is None

    def test_single_morning_time(self):
        assert avg_time_of_day(["07:00"], is_evening=False) == "07:00"

    def test_single_evening_time(self):
        assert avg_time_of_day(["22:30"], is_evening=True) == "22:30"

    def test_average_morning_times(self):
        result = avg_time_of_day(["06:00", "08:00"], is_evening=False)
        assert result == "07:00"

    def test_average_evening_times(self):
        result = avg_time_of_day(["22:00", "23:00"], is_evening=True)
        assert result == "22:30"

    def test_midnight_wraparound_evening(self):
        """23:30 and 00:30 should average to 00:00, not 12:00."""
        result = avg_time_of_day(["23:30", "00:30"], is_evening=True)
        assert result == "00:00"

    def test_all_past_midnight_evening(self):
        """00:00 and 01:00 with is_evening should offset and average correctly."""
        result = avg_time_of_day(["00:00", "01:00"], is_evening=True)
        assert result == "00:30"

    def test_morning_no_shift(self):
        """Morning times should not shift even if <= 12:00."""
        result = avg_time_of_day(["06:00", "07:00", "08:00"], is_evening=False)
        assert result == "07:00"


class TestComputeAvgSchedule:
    def test_returns_none_when_no_data(self):
        assert compute_avg_schedule([], {}) is None

    def test_returns_none_when_no_schedule_data(self):
        data = {
            datetime.date(2020, 1, 1): {
                "study_minutes": 0,
                "sleep_minutes": 480,
                "mood": 7.0,
                "workout": False,
                "stretch": False,
                "meditate": False,
                "awake_minutes": None,
                "awakenings": None,
                "sleep_asleep_time": None,
                "sleep_awake_time": None,
                "activity_totals": {},
                "interrupt_minutes": 0,
                "overrun_minutes": 0,
                "planned_break_minutes": 0,
                "training_type_minutes": {},
                "training_type_sessions": {},
                "training_type_start_minutes": {},
                "training_type_end_minutes": {},
                "screen_time_totals": {},
            }
        }
        result = compute_avg_schedule([datetime.date(2020, 1, 1)], data)
        assert result is None

    def test_computes_schedule_from_daily_data(self):
        data = {
            datetime.date(2020, 1, 1): {
                "study_minutes": 0,
                "sleep_minutes": 480,
                "mood": 7.0,
                "workout": False,
                "stretch": False,
                "meditate": False,
                "awake_minutes": None,
                "awakenings": None,
                "sleep_asleep_time": "22:00",
                "sleep_awake_time": "06:00",
                "activity_totals": {},
                "interrupt_minutes": 0,
                "overrun_minutes": 0,
                "planned_break_minutes": 0,
                "training_type_minutes": {},
                "training_type_sessions": {},
                "training_type_start_minutes": {},
                "training_type_end_minutes": {},
                "screen_time_totals": {},
            },
            datetime.date(2020, 1, 2): {
                "study_minutes": 0,
                "sleep_minutes": 480,
                "mood": 7.0,
                "workout": False,
                "stretch": False,
                "meditate": False,
                "awake_minutes": None,
                "awakenings": None,
                "sleep_asleep_time": "23:00",
                "sleep_awake_time": "07:00",
                "activity_totals": {},
                "interrupt_minutes": 0,
                "overrun_minutes": 0,
                "planned_break_minutes": 0,
                "training_type_minutes": {},
                "training_type_sessions": {},
                "training_type_start_minutes": {},
                "training_type_end_minutes": {},
                "screen_time_totals": {},
            },
        }
        dates = [datetime.date(2020, 1, 1), datetime.date(2020, 1, 2)]
        result = compute_avg_schedule(dates, data)
        assert result == "22:30 - 06:30"
