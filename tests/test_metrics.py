"""
Tests for sync_utils.metrics module.

Covers period aggregation and delta computation functions.
"""
from __future__ import annotations

import datetime
import pytest
from typing import Any

from sync_utils.metrics import (
    compute_period_metrics,
    aggregate_activity_totals,
    aggregate_interrupt_overrun,
    compute_period_deltas,
)


class TestComputePeriodMetrics:
    """Tests for compute_period_metrics function."""

    def test_aggregates_study_total(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        result = compute_period_metrics(dates, sample_daily_data)
        
        # Should sum all study minutes
        expected_total = sum(d.get("study_minutes", 0) for d in sample_daily_data.values())
        assert result["study_total_minutes"] == expected_total

    def test_computes_sleep_average(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        result = compute_period_metrics(dates, sample_daily_data)
        
        sleep_values = [d["sleep_minutes"] for d in sample_daily_data.values()]
        expected_avg = sum(sleep_values) / len(sleep_values)
        assert result["sleep_avg_minutes"] == expected_avg

    def test_computes_mood_average(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        result = compute_period_metrics(dates, sample_daily_data)
        
        mood_values = [d["mood"] for d in sample_daily_data.values()]
        expected_avg = sum(mood_values) / len(mood_values)
        assert result["mood_avg"] == expected_avg

    def test_counts_workout_days(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        result = compute_period_metrics(dates, sample_daily_data)
        
        expected_count = sum(1 for d in sample_daily_data.values() if d.get("workout"))
        assert result["workout_count"] == expected_count

    def test_counts_stretch_days(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        result = compute_period_metrics(dates, sample_daily_data)
        
        expected_count = sum(1 for d in sample_daily_data.values() if d.get("stretch"))
        assert result["stretch_count"] == expected_count

    def test_total_days(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        result = compute_period_metrics(dates, sample_daily_data)
        assert result["total_days"] == len(dates)

    def test_handles_missing_data(self):
        dates = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]
        daily_data = {
            datetime.date(2025, 1, 1): {"study_minutes": 100},
            # 2025-01-02 missing from data
        }
        result = compute_period_metrics(dates, daily_data)
        assert result["study_total_minutes"] == 100
        assert result["total_days"] == 2

    def test_handles_none_values(self):
        dates = [datetime.date(2025, 1, 1)]
        daily_data = {
            datetime.date(2025, 1, 1): {
                "study_minutes": None,
                "sleep_minutes": None,
                "mood": None,
            },
        }
        result = compute_period_metrics(dates, daily_data)
        assert result["study_total_minutes"] == 0
        assert result["sleep_avg_minutes"] is None
        assert result["mood_avg"] is None


class TestAggregateActivityTotals:
    """Tests for aggregate_activity_totals function."""

    def test_aggregates_across_days(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        result = aggregate_activity_totals(dates, sample_daily_data)
        
        # Should have "coding" from multiple days
        assert "coding" in result
        # Sum: 300 (day1) + 180 (day2) + 200 (day4) = 680
        assert result["coding"] == 680

    def test_combines_activities(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        result = aggregate_activity_totals(dates, sample_daily_data)
        
        # Check all activities are present
        assert "coding" in result
        assert "reading" in result
        assert "writing" in result

    def test_handles_empty_data(self):
        dates = [datetime.date(2025, 1, 1)]
        daily_data = {}
        result = aggregate_activity_totals(dates, daily_data)
        assert result == {}

    def test_handles_missing_activity_totals(self):
        dates = [datetime.date(2025, 1, 1)]
        daily_data = {datetime.date(2025, 1, 1): {}}  # No activity_totals key
        result = aggregate_activity_totals(dates, daily_data)
        assert result == {}


class TestAggregateInterruptOverrun:
    """Tests for aggregate_interrupt_overrun function."""

    def test_totals_interrupts(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        interrupts, overruns, study_days = aggregate_interrupt_overrun(dates, sample_daily_data)
        
        # Sum of interrupt_minutes: 10 + 5 + 0 + 15 = 30
        expected_interrupts = sum(d.get("interrupt_minutes", 0) for d in sample_daily_data.values())
        assert interrupts == expected_interrupts

    def test_totals_overruns(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        interrupts, overruns, study_days = aggregate_interrupt_overrun(dates, sample_daily_data)
        
        # Sum of overrun_minutes: 5 + 0 + 0 + 10 = 15
        expected_overruns = sum(d.get("overrun_minutes", 0) for d in sample_daily_data.values())
        assert overruns == expected_overruns

    def test_counts_study_days(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        interrupts, overruns, study_days = aggregate_interrupt_overrun(dates, sample_daily_data)
        
        # Days with study > 0: 420, 180, 0, 360 -> 3 study days
        expected_count = sum(1 for d in sample_daily_data.values() if d.get("study_minutes", 0) > 0)
        assert study_days == expected_count

    def test_handles_empty_data(self):
        dates = [datetime.date(2025, 1, 1)]
        daily_data = {}
        interrupts, overruns, study_days = aggregate_interrupt_overrun(dates, daily_data)
        assert interrupts == 0
        assert overruns == 0
        assert study_days == 0


class TestComputePeriodDeltas:
    """Tests for compute_period_deltas function."""

    def test_computes_percent_changes(self):
        counts = [
            (10, 91, datetime.date(2025, 1, 1)),   # Q1
            (15, 91, datetime.date(2025, 4, 1)),   # Q2: +50%
            (12, 92, datetime.date(2025, 7, 1)),   # Q3: -20%
            (18, 92, datetime.date(2025, 10, 1)),  # Q4: +50%
        ]
        baseline = 8  # Previous Q4
        
        result = compute_period_deltas(counts, baseline, today=datetime.date(2025, 12, 31))
        
        assert len(result) == 4
        # Q1 vs baseline (8): (10-8)/8 = 25%
        assert result[0] == "+25%"
        # Q2 vs Q1 (10): (15-10)/10 = 50%
        assert result[1] == "+50%"

    def test_skips_future_periods(self):
        counts = [
            (10, 91, datetime.date(2025, 1, 1)),
            (15, 91, datetime.date(2025, 4, 1)),  # Future
        ]
        baseline = 8
        
        result = compute_period_deltas(counts, baseline, today=datetime.date(2025, 2, 1))
        
        assert result[0] == "+25%"
        assert result[1] == ""  # Future period

    def test_handles_zero_baseline(self):
        counts = [
            (10, 91, datetime.date(2025, 1, 1)),
        ]
        baseline = 0
        
        result = compute_period_deltas(counts, baseline, today=datetime.date(2025, 12, 31))
        
        # Zero baseline with nonzero current -> em dash
        assert result[0] == "—"

    def test_handles_none_baseline(self):
        counts = [
            (10, 91, datetime.date(2025, 1, 1)),
        ]
        baseline = None
        
        result = compute_period_deltas(counts, baseline, today=datetime.date(2025, 12, 31))
        
        assert result[0] == "—"

    def test_empty_counts(self):
        result = compute_period_deltas([], 10, today=datetime.date(2025, 12, 31))
        assert result == []
