"""
Tests for sync.metrics module.

Covers period aggregation and delta computation functions.
"""

from __future__ import annotations

import datetime

import pytest

from sync.metrics import (
    compute_period_metrics,
    aggregate_activity_totals,
    aggregate_interrupt_overrun,
    aggregate_training_type_session_stats,
    compute_bucket_deltas,
)


def _add_training_interrupts(
    daily_data: dict[datetime.date, dict],
    *,
    overrides: dict[datetime.date, dict[str, tuple[float, ...]]] | None = None,
) -> None:
    overrides = overrides or {}
    for day, payload in daily_data.items():
        durations = payload["training_type_duration_minutes"]
        interrupts = {
            label: tuple(0.0 for _ in samples) for label, samples in durations.items()
        }
        interrupts.update(overrides.get(day, {}))
        payload["training_type_interrupt_minutes"] = interrupts


class TestComputePeriodMetrics:
    """Tests for compute_period_metrics function."""

    def test_aggregates_study_total(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        result = compute_period_metrics(dates, sample_daily_data)

        # Should sum all study minutes
        expected_total = sum(
            d.get("study_minutes", 0) for d in sample_daily_data.values()
        )
        assert result["study_total_minutes"] == expected_total

    def test_computes_sleep_average(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        result = compute_period_metrics(dates, sample_daily_data)

        sleep_values = [d["sleep_minutes"] for d in sample_daily_data.values()]
        expected_avg = sum(sleep_values) / len(sleep_values)
        assert result["sleep_avg_minutes"] == expected_avg

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
            },
        }
        result = compute_period_metrics(dates, daily_data)
        assert result["study_total_minutes"] == 0
        assert result["sleep_avg_minutes"] is None


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
        interrupts, overruns, study_days = aggregate_interrupt_overrun(
            dates, sample_daily_data
        )

        # Sum of interrupt_minutes: 10 + 5 + 0 + 15 = 30
        expected_interrupts = sum(
            d.get("interrupt_minutes", 0) for d in sample_daily_data.values()
        )
        assert interrupts == expected_interrupts

    def test_totals_overruns(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        interrupts, overruns, study_days = aggregate_interrupt_overrun(
            dates, sample_daily_data
        )

        # Sum of overrun_minutes: 5 + 0 + 0 + 10 = 15
        expected_overruns = sum(
            d.get("overrun_minutes", 0) for d in sample_daily_data.values()
        )
        assert overruns == expected_overruns

    def test_counts_study_days(self, sample_daily_data):
        dates = list(sample_daily_data.keys())
        interrupts, overruns, study_days = aggregate_interrupt_overrun(
            dates, sample_daily_data
        )

        # Days with study > 0: 420, 180, 0, 360 -> 3 study days
        expected_count = sum(
            1 for d in sample_daily_data.values() if d.get("study_minutes", 0) > 0
        )
        assert study_days == expected_count

    def test_handles_empty_data(self):
        dates = [datetime.date(2025, 1, 1)]
        daily_data = {}
        interrupts, overruns, study_days = aggregate_interrupt_overrun(
            dates, daily_data
        )
        assert interrupts == 0
        assert overruns == 0
        assert study_days == 0


class TestComputeBucketDeltas:
    """Tests for compute_bucket_deltas function."""

    def test_pace_mode_uses_baseline_for_first_bucket(self):
        baseline_bucket = [datetime.date(2024, 12, 30), datetime.date(2024, 12, 31)]
        buckets = [[datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]]
        values = {
            datetime.date(2024, 12, 30): 60.0,
            datetime.date(2024, 12, 31): 60.0,
            datetime.date(2025, 1, 1): 120.0,
            datetime.date(2025, 1, 2): 120.0,
        }

        result = compute_bucket_deltas(
            buckets,
            value_for_day=lambda d: values.get(d),
            baseline_bucket=baseline_bucket,
            mode="pace",
            today=datetime.date(2025, 1, 31),
        )

        assert result == ["+100%"]

    def test_pace_mode_in_progress_uses_current_to_date(self):
        prev_bucket = [datetime.date(2026, 2, 1)]
        curr_bucket = [
            datetime.date(2026, 2, 2),
            datetime.date(2026, 2, 3),
            datetime.date(2026, 2, 4),
            datetime.date(2026, 2, 5),
            datetime.date(2026, 2, 6),
            datetime.date(2026, 2, 7),
            datetime.date(2026, 2, 8),
        ]
        values = {
            datetime.date(2026, 2, 1): 120.0,
            datetime.date(2026, 2, 2): 60.0,
            datetime.date(2026, 2, 3): 60.0,
            datetime.date(2026, 2, 4): 60.0,
            datetime.date(2026, 2, 5): 60.0,
        }

        result = compute_bucket_deltas(
            [prev_bucket, curr_bucket],
            value_for_day=lambda d: values.get(d),
            mode="pace",
            today=datetime.date(2026, 2, 5),
        )

        assert result == ["—", "-50%"]

    def test_average_mode_ignores_none_values(self):
        baseline_bucket = [
            datetime.date(2024, 12, 29),
            datetime.date(2024, 12, 30),
            datetime.date(2024, 12, 31),
        ]
        buckets = [
            [
                datetime.date(2025, 1, 1),
                datetime.date(2025, 1, 2),
                datetime.date(2025, 1, 3),
            ],
            [
                datetime.date(2025, 1, 4),
                datetime.date(2025, 1, 5),
                datetime.date(2025, 1, 6),
            ],
        ]
        values = {
            datetime.date(2024, 12, 29): 5.0,
            datetime.date(2024, 12, 30): 5.0,
            datetime.date(2024, 12, 31): 5.0,
            datetime.date(2025, 1, 1): 6.0,
            datetime.date(2025, 1, 2): None,
            datetime.date(2025, 1, 3): 8.0,
            datetime.date(2025, 1, 4): 9.0,
            datetime.date(2025, 1, 5): None,
            datetime.date(2025, 1, 6): None,
        }

        result = compute_bucket_deltas(
            buckets,
            value_for_day=lambda d: values.get(d),
            baseline_bucket=baseline_bucket,
            mode="average",
            today=datetime.date(2025, 1, 31),
        )

        assert result == ["+40%", "+29%"]

    def test_future_bucket_returns_blank(self):
        buckets = [
            [datetime.date(2025, 1, day) for day in range(1, 8)],
            [datetime.date(2025, 1, day) for day in range(8, 15)],
        ]

        result = compute_bucket_deltas(
            buckets,
            value_for_day=lambda _day: 60.0,
            mode="pace",
            today=datetime.date(2025, 1, 5),
        )

        assert result == ["—", ""]

    def test_zero_baseline_returns_emdash(self):
        baseline_bucket = [datetime.date(2024, 12, 31)]
        buckets = [[datetime.date(2025, 1, 1)]]
        values = {
            datetime.date(2024, 12, 31): 0.0,
            datetime.date(2025, 1, 1): 30.0,
        }

        result = compute_bucket_deltas(
            buckets,
            value_for_day=lambda d: values.get(d),
            baseline_bucket=baseline_bucket,
            mode="pace",
            today=datetime.date(2025, 1, 31),
        )

        assert result == ["—"]

    def test_both_zero_bucket_returns_zero_percent(self):
        baseline_bucket = [datetime.date(2024, 12, 31)]
        buckets = [[datetime.date(2025, 1, 1)]]
        values = {
            datetime.date(2024, 12, 31): 0.0,
            datetime.date(2025, 1, 1): 0.0,
        }

        result = compute_bucket_deltas(
            buckets,
            value_for_day=lambda d: values.get(d),
            baseline_bucket=baseline_bucket,
            mode="pace",
            today=datetime.date(2025, 1, 31),
        )

        assert result == ["+0%"]


class TestAggregateTrainingTypeSessionStats:
    """Tests for aggregate_training_type_session_stats function."""

    def test_single_slot_activity_remains_unchanged(self):
        dates = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {"Functional Strength Training": 60.0},
                "training_type_sessions": {"Functional Strength Training": 1},
                "training_type_duration_minutes": {
                    "Functional Strength Training": (60.0,)
                },
                "training_type_start_minutes": {
                    "Functional Strength Training": (1080,)
                },
                "training_type_end_minutes": {"Functional Strength Training": (1140,)},
            },
            dates[1]: {
                "training_type_minutes": {"Functional Strength Training": 90.0},
                "training_type_sessions": {"Functional Strength Training": 1},
                "training_type_duration_minutes": {
                    "Functional Strength Training": (90.0,)
                },
                "training_type_start_minutes": {
                    "Functional Strength Training": (1140,)
                },
                "training_type_end_minutes": {"Functional Strength Training": (1230,)},
            },
        }
        _add_training_interrupts(
            daily_data,
            overrides={
                dates[0]: {"Functional Strength Training": (5.0,)},
                dates[1]: {"Functional Strength Training": (15.0,)},
            },
        )

        rows = aggregate_training_type_session_stats(dates, daily_data)

        assert len(rows) == 1
        assert rows[0]["type"] == "Functional Strength Training"
        assert rows[0]["sessions"] == 2
        assert rows[0]["average_minutes"] == 75.0
        assert rows[0]["average_interrupt_minutes"] == 10.0
        assert rows[0]["schedule_range"] == ("18:30", "19:45")

    def test_uses_period_day_count_for_type_target_denominator(self):
        dates = [
            datetime.date(2025, 1, 1) + datetime.timedelta(days=i) for i in range(7)
        ]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {
                    "Yoga": 10.0,
                    "Cooldown": 20.0,
                    "Functional Strength Training": 60.0,
                },
                "training_type_sessions": {
                    "Yoga": 1,
                    "Cooldown": 1,
                    "Functional Strength Training": 1,
                },
                "training_type_duration_minutes": {
                    "Yoga": (10.0,),
                    "Cooldown": (20.0,),
                    "Functional Strength Training": (60.0,),
                },
                "training_type_start_minutes": {
                    "Yoga": (430,),
                    "Cooldown": (1140,),
                    "Functional Strength Training": (1080,),
                },
                "training_type_end_minutes": {
                    "Yoga": (440,),
                    "Cooldown": (1160,),
                    "Functional Strength Training": (1140,),
                },
            }
        }
        _add_training_interrupts(daily_data)

        rows = aggregate_training_type_session_stats(dates, daily_data)
        by_type = {row["type"]: row for row in rows}

        assert by_type["Yoga"]["target"] == len(dates)
        assert by_type["Cooldown"]["target"] == len(dates)
        assert by_type["Functional Strength Training"]["target"] == len(dates)

    def test_selects_most_recurring_schedule_range_without_cross_slot_average(
        self,
    ):
        dates = [
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 2),
        ]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {"Functional Strength Training": 30.0},
                "training_type_sessions": {"Functional Strength Training": 2},
                "training_type_duration_minutes": {
                    "Functional Strength Training": (10.0, 20.0)
                },
                "training_type_start_minutes": {
                    "Functional Strength Training": (420, 1260)
                },
                "training_type_end_minutes": {
                    "Functional Strength Training": (430, 1280)
                },
            },
            dates[1]: {
                "training_type_minutes": {"Functional Strength Training": 12.0},
                "training_type_sessions": {"Functional Strength Training": 1},
                "training_type_duration_minutes": {
                    "Functional Strength Training": (12.0,)
                },
                "training_type_start_minutes": {"Functional Strength Training": (450,)},
                "training_type_end_minutes": {"Functional Strength Training": (462,)},
            },
        }
        _add_training_interrupts(daily_data)

        rows = aggregate_training_type_session_stats(dates, daily_data)

        assert len(rows) == 1
        assert rows[0]["type"] == "Functional Strength Training"
        assert rows[0]["sessions"] == 2
        assert rows[0]["average_minutes"] == 14.0
        assert rows[0]["schedule_range"] == ("07:15", "07:26")

    def test_scales_targets_with_period_days(self):
        dates = [
            datetime.date(2025, 1, 1) + datetime.timedelta(days=i) for i in range(31)
        ]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {"Functional Strength Training": 60.0},
                "training_type_sessions": {"Functional Strength Training": 1},
                "training_type_duration_minutes": {
                    "Functional Strength Training": (60.0,)
                },
                "training_type_start_minutes": {
                    "Functional Strength Training": (1080,)
                },
                "training_type_end_minutes": {"Functional Strength Training": (1140,)},
            }
        }
        _add_training_interrupts(daily_data)

        rows = aggregate_training_type_session_stats(dates, daily_data)

        assert len(rows) == 1
        assert rows[0]["target"] == len(dates)

    def test_sorts_by_average_start_then_end_then_duration(self):
        dates = [
            datetime.date(2025, 1, 1) + datetime.timedelta(days=i) for i in range(7)
        ]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {
                    "Zone 2 Run": 40.0,
                    "Traditional Strength Training": 60.0,
                    "Yoga": 40.0,
                },
                "training_type_sessions": {
                    "Zone 2 Run": 1,
                    "Traditional Strength Training": 1,
                    "Yoga": 1,
                },
                "training_type_duration_minutes": {
                    "Zone 2 Run": (40.0,),
                    "Traditional Strength Training": (60.0,),
                    "Yoga": (40.0,),
                },
                "training_type_start_minutes": {
                    "Zone 2 Run": (1140,),
                    "Traditional Strength Training": (1080,),
                    "Yoga": (420,),
                },
                "training_type_end_minutes": {
                    "Zone 2 Run": (1180,),
                    "Traditional Strength Training": (1140,),
                    "Yoga": (460,),
                },
            }
        }
        _add_training_interrupts(daily_data)

        rows = aggregate_training_type_session_stats(dates, daily_data)
        labels = [row["type"] for row in rows]

        assert labels == ["Yoga", "Traditional Strength Training", "Zone 2 Run"]

    def test_merges_case_and_whitespace_variants(self):
        dates = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {"  Stretching ": 20.0},
                "training_type_sessions": {"  Stretching ": 1},
                "training_type_duration_minutes": {"  Stretching ": (20.0,)},
                "training_type_start_minutes": {"  Stretching ": (1140,)},
                "training_type_end_minutes": {"  Stretching ": (1160,)},
            },
            dates[1]: {
                "training_type_minutes": {"stretching": 25.0},
                "training_type_sessions": {"stretching": 1},
                "training_type_duration_minutes": {"stretching": (25.0,)},
                "training_type_start_minutes": {"stretching": (1145,)},
                "training_type_end_minutes": {"stretching": (1165,)},
            },
        }
        _add_training_interrupts(daily_data)

        rows = aggregate_training_type_session_stats(dates, daily_data)

        assert len(rows) == 1
        assert rows[0]["type"] == "Stretching"
        assert rows[0]["sessions"] == 2
        assert rows[0]["average_minutes"] == 22.5
        assert rows[0]["schedule_range"] == ("19:02", "19:22")

    def test_raises_when_schedule_samples_are_missing(self):
        dates = [datetime.date(2025, 1, 1)]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {"Stretching": 20.0},
                "training_type_sessions": {"Stretching": 1},
                "training_type_duration_minutes": {},
                "training_type_start_minutes": {},
                "training_type_end_minutes": {},
            }
        }
        _add_training_interrupts(daily_data)

        with pytest.raises(ValueError, match="sample count mismatch"):
            aggregate_training_type_session_stats(dates, daily_data)

    def test_tie_breaks_dominant_schedule_by_total_duration(self):
        dates = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {"Functional Strength Training": 30.0},
                "training_type_sessions": {"Functional Strength Training": 2},
                "training_type_duration_minutes": {
                    "Functional Strength Training": (10.0, 20.0)
                },
                "training_type_start_minutes": {
                    "Functional Strength Training": (420, 1260)
                },
                "training_type_end_minutes": {
                    "Functional Strength Training": (430, 1280)
                },
            },
            dates[1]: {
                "training_type_minutes": {"Functional Strength Training": 25.0},
                "training_type_sessions": {"Functional Strength Training": 2},
                "training_type_duration_minutes": {
                    "Functional Strength Training": (12.0, 13.0)
                },
                "training_type_start_minutes": {
                    "Functional Strength Training": (450, 1250)
                },
                "training_type_end_minutes": {
                    "Functional Strength Training": (462, 1263)
                },
            },
        }
        _add_training_interrupts(daily_data)

        rows = aggregate_training_type_session_stats(dates, daily_data)

        assert len(rows) == 1
        assert rows[0]["type"] == "Functional Strength Training"
        assert rows[0]["sessions"] == 2
        assert rows[0]["average_minutes"] == 13.75
        assert rows[0]["schedule_range"] == ("20:55", "21:12")
