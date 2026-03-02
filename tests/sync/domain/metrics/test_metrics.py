"""
Tests for sync.metrics module.

Covers period aggregation and delta computation functions.
"""

from __future__ import annotations

import datetime

import pytest

import sync.metrics.loading as metrics_loading
from sync.metrics import (
    compute_period_metrics,
    aggregate_activity_totals,
    aggregate_interrupt_overrun,
    aggregate_training_type_session_stats,
    compute_bucket_deltas,
    load_daily_data_for_dates,
    load_prior_period_metrics,
)
from sync.target_policy import training_type_target


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

    def test_aggregates_raw_sessions(self):
        dates = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {"Traditional Strength Training": 60.0},
                "training_type_sessions": {"Traditional Strength Training": 1},
                "training_type_start_minutes": {
                    "Traditional Strength Training": (1080,)
                },
                "training_type_end_minutes": {"Traditional Strength Training": (1140,)},
            },
            dates[1]: {
                "training_type_minutes": {"Traditional Strength Training": 90.0},
                "training_type_sessions": {"Traditional Strength Training": 2},
                "training_type_start_minutes": {
                    "Traditional Strength Training": (1080, 1140)
                },
                "training_type_end_minutes": {
                    "Traditional Strength Training": (1110, 1170)
                },
            },
        }

        rows = aggregate_training_type_session_stats(dates, daily_data)

        assert len(rows) == 1
        assert rows[0]["type"] == "Traditional Strength Training"
        assert rows[0]["sessions"] == 3
        assert rows[0]["average_minutes"] == 50.0
        assert rows[0]["average_start_time"] == "18:20"
        assert rows[0]["average_end_time"] == "19:00"

    def test_applies_bucket_mapping_for_target_denominator(self):
        dates = [
            datetime.date(2025, 1, 1) + datetime.timedelta(days=i) for i in range(7)
        ]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {
                    "Meditation": 10.0,
                    "Stretching": 20.0,
                    "Traditional Strength Training": 60.0,
                },
                "training_type_sessions": {
                    "Meditation": 1,
                    "Stretching": 1,
                    "Traditional Strength Training": 1,
                },
                "training_type_start_minutes": {
                    "Meditation": (430,),
                    "Stretching": (1140,),
                    "Traditional Strength Training": (1080,),
                },
                "training_type_end_minutes": {
                    "Meditation": (440,),
                    "Stretching": (1160,),
                    "Traditional Strength Training": (1140,),
                },
            }
        }

        rows = aggregate_training_type_session_stats(dates, daily_data)
        by_type = {row["type"]: row for row in rows}

        expected_mindful = training_type_target(len(dates), "mindful")
        expected_stretch = training_type_target(len(dates), "stretch")
        expected_workout = training_type_target(len(dates), "workout")

        assert by_type["Meditation"]["target"] == expected_mindful
        assert by_type["Stretching"]["target"] == expected_stretch
        assert by_type["Traditional Strength Training"]["target"] == expected_workout

    def test_scales_targets_with_period_days(self):
        dates = [
            datetime.date(2025, 1, 1) + datetime.timedelta(days=i) for i in range(31)
        ]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {"Traditional Strength Training": 60.0},
                "training_type_sessions": {"Traditional Strength Training": 1},
                "training_type_start_minutes": {
                    "Traditional Strength Training": (1080,)
                },
                "training_type_end_minutes": {"Traditional Strength Training": (1140,)},
            }
        }

        rows = aggregate_training_type_session_stats(dates, daily_data)

        assert len(rows) == 1
        assert rows[0]["target"] == training_type_target(len(dates), "workout")

    def test_sorts_by_average_start_then_end_then_duration(self):
        dates = [
            datetime.date(2025, 1, 1) + datetime.timedelta(days=i) for i in range(7)
        ]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {
                    "Zone 2 Run": 40.0,
                    "Traditional Strength Training": 120.0,
                    "Yoga": 120.0,
                },
                "training_type_sessions": {
                    "Zone 2 Run": 1,
                    "Traditional Strength Training": 2,
                    "Yoga": 3,
                },
                "training_type_start_minutes": {
                    "Zone 2 Run": (1140,),
                    "Traditional Strength Training": (1080, 1080),
                    "Yoga": (420, 420, 420),
                },
                "training_type_end_minutes": {
                    "Zone 2 Run": (1180,),
                    "Traditional Strength Training": (1140, 1140),
                    "Yoga": (460, 460, 460),
                },
            }
        }

        rows = aggregate_training_type_session_stats(dates, daily_data)
        labels = [row["type"] for row in rows]

        assert labels == ["Yoga", "Traditional Strength Training", "Zone 2 Run"]

    def test_merges_case_and_whitespace_variants(self):
        dates = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {"  Stretching ": 20.0},
                "training_type_sessions": {"  Stretching ": 1},
                "training_type_start_minutes": {"  Stretching ": (1140,)},
                "training_type_end_minutes": {"  Stretching ": (1160,)},
            },
            dates[1]: {
                "training_type_minutes": {"stretching": 25.0},
                "training_type_sessions": {"stretching": 1},
                "training_type_start_minutes": {"stretching": (1145,)},
                "training_type_end_minutes": {"stretching": (1165,)},
            },
        }

        rows = aggregate_training_type_session_stats(dates, daily_data)

        assert len(rows) == 1
        assert rows[0]["type"] == "Stretching"
        assert rows[0]["sessions"] == 2
        assert rows[0]["average_minutes"] == 22.5
        assert rows[0]["average_start_time"] == "19:02"
        assert rows[0]["average_end_time"] == "19:22"

    def test_raises_when_schedule_samples_are_missing(self):
        dates = [datetime.date(2025, 1, 1)]
        daily_data = {
            dates[0]: {
                "training_type_minutes": {"Stretching": 20.0},
                "training_type_sessions": {"Stretching": 1},
                "training_type_start_minutes": {},
                "training_type_end_minutes": {},
            }
        }

        with pytest.raises(ValueError, match="sample count mismatch"):
            aggregate_training_type_session_stats(dates, daily_data)


class TestLoadDailyData:
    """Tests for daily-data loading helpers."""

    def test_load_daily_data_for_dates_reads_existing_notes(
        self, tmp_path, monkeypatch
    ):
        day_1 = datetime.date(2025, 1, 1)
        day_2 = datetime.date(2025, 1, 2)
        day_3 = datetime.date(2025, 1, 3)

        (tmp_path / f"{day_1:%Y-%m-%d}.md").write_text("note")
        (tmp_path / f"{day_3:%Y-%m-%d}.md").write_text("note")

        monkeypatch.setattr(metrics_loading, "JOURNAL_DIR", str(tmp_path))

        def _fake_parse_daily_note(path: str):
            if path.endswith(f"{day_1:%Y-%m-%d}.md"):
                return {"study_minutes": 120}
            if path.endswith(f"{day_3:%Y-%m-%d}.md"):
                return None
            return None

        import sync.readers.daily as daily_reader

        monkeypatch.setattr(daily_reader, "parse_daily_note", _fake_parse_daily_note)

        result = load_daily_data_for_dates([day_1, day_2, day_3])

        assert result == {day_1: {"study_minutes": 120}}


class TestLoadPriorPeriodMetrics:
    """Tests for prior-period metric loading helper."""

    def test_load_prior_period_metrics_preserves_offset_order(self, monkeypatch):
        base = datetime.date(2025, 1, 1)
        loaded_spans: list[list[datetime.date]] = []

        def _fake_load(dates):
            date_list = list(dates)
            loaded_spans.append(date_list)
            return {
                d: {
                    "study_minutes": 60,
                    "sleep_minutes": 480,
                    "mood": 7.0,
                    "workout": False,
                    "stretch": False,
                    "meditate": False,
                }
                for d in date_list
            }

        monkeypatch.setattr(metrics_loading, "load_daily_data_for_dates", _fake_load)

        def _bounds(offset: int) -> tuple[datetime.date, datetime.date]:
            start = base + datetime.timedelta(days=offset * 10)
            end = start + datetime.timedelta(days=1)
            return start, end

        result = load_prior_period_metrics([3, 1], _bounds)

        assert len(result) == 2
        assert result[0]["study_total_minutes"] == 120
        assert result[1]["study_total_minutes"] == 120
        assert [span[0] for span in loaded_spans] == [
            base + datetime.timedelta(days=30),
            base + datetime.timedelta(days=10),
        ]
