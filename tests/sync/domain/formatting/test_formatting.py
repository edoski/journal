"""Tests for sync.formatting helpers."""

from __future__ import annotations

from sync.formatting import (
    ceil_minutes,
    compute_non_none_average,
    compute_pace,
    compute_percent_change,
    format_bucket_delta_change_label,
    format_ma_training_ratio,
    format_minutes,
    format_minutes_seconds,
    format_percent_change,
    format_progress_bar,
    format_summary_change_label,
    format_training_ratio,
    round_half_up,
)


class TestFormatMinutes:
    def test_hours_and_minutes(self):
        assert format_minutes(90) == "1h30m"
        assert format_minutes(120) == "2h00m"
        assert format_minutes(65) == "1h05m"

    def test_minutes_only(self):
        assert format_minutes(45) == "45m"
        assert format_minutes(5) == "5m"

    def test_minutes_only_zero_padded_when_requested(self):
        assert format_minutes(45, pad_minutes=True) == "45m"
        assert format_minutes(5, pad_minutes=True) == "05m"

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
        assert format_minutes(89.5) == "1h30m"
        assert format_minutes(89.4) == "1h29m"


class TestFormatMinutesSeconds:
    def test_whole_minutes(self):
        assert format_minutes_seconds(5) == "5m"
        assert format_minutes_seconds(0) == "0m"

    def test_minutes_with_seconds(self):
        assert format_minutes_seconds(5.5) == "5m30s"
        assert format_minutes_seconds(1.25) == "1m15s"

    def test_rounding_without_carry(self):
        assert format_minutes_seconds(5.99) == "5m59s"

    def test_seconds_round_to_carry(self):
        assert format_minutes_seconds(5 + (59.6 / 60)) == "6m"

    def test_hour_overflow_boundaries(self):
        assert format_minutes_seconds(60) == "1h00m"
        assert format_minutes_seconds(60.5) == "1h00m30s"
        assert format_minutes_seconds(61) == "1h01m"
        assert format_minutes_seconds(90.5) == "1h30m30s"

    def test_none_input(self):
        assert format_minutes_seconds(None) == ""


class TestCeilMinutes:
    def test_whole_number(self):
        assert ceil_minutes(90) == 90
        assert ceil_minutes(0) == 0

    def test_fractional_rounds_up(self):
        assert ceil_minutes(89.1) == 90
        assert ceil_minutes(89.9) == 90
        assert ceil_minutes(0.1) == 1

    def test_tolerance_handling(self):
        assert ceil_minutes(89.0000001) == 89
        assert ceil_minutes(90.0) == 90

    def test_none_input(self):
        assert ceil_minutes(None) == 0


class TestRoundHalfUp:
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
        assert round_half_up(89.4999999) == 90
        assert round_half_up(89.4) == 89

    def test_none_input(self):
        assert round_half_up(None) == 0


class TestComputePercentChange:
    def test_positive_change(self):
        assert compute_percent_change(110, 100) == 10.0
        assert compute_percent_change(200, 100) == 100.0

    def test_negative_change(self):
        assert compute_percent_change(90, 100) == -10.0
        assert compute_percent_change(50, 100) == -50.0

    def test_no_change(self):
        assert compute_percent_change(100, 100) == 0.0

    def test_zero_previous_with_current(self):
        assert compute_percent_change(100, 0) is None

    def test_both_zero(self):
        assert compute_percent_change(0, 0) == 0

    def test_none_inputs(self):
        assert compute_percent_change(None, 100) is None
        assert compute_percent_change(100, None) is None
        assert compute_percent_change(None, None) is None


class TestComputePace:
    def test_returns_per_day_rate(self):
        assert compute_pace(420, 7) == 60.0
        assert compute_pace(3, 2) == 1.5

    def test_guards_zero_day_count(self):
        assert compute_pace(60, 0) == 60.0

    def test_treats_none_total_as_zero(self):
        assert compute_pace(None, 7) == 0.0


class TestComputeNonNoneAverage:
    def test_averages_only_present_values(self):
        assert compute_non_none_average([2.0, None, 4.0]) == 3.0

    def test_returns_zero_when_no_present_values(self):
        assert compute_non_none_average([None, None]) == 0.0
        assert compute_non_none_average([]) == 0.0


class TestFormatSummaryChangeLabel:
    def test_both_zero_returns_emdash(self):
        assert format_summary_change_label(0.0, 0.0) == "—"

    def test_formats_non_zero_change(self):
        assert format_summary_change_label(120.0, 60.0) == "+100%"

    def test_zero_baseline_non_zero_current_returns_emdash(self):
        assert format_summary_change_label(1.0, 0.0) == "—"

    def test_zero_current_non_zero_baseline_formats_drop(self):
        assert format_summary_change_label(0.0, 5.0) == "-100%"


class TestFormatBucketDeltaChangeLabel:
    def test_both_zero_returns_zero_percent(self):
        assert format_bucket_delta_change_label(0.0, 0.0) == "+0%"

    def test_formats_non_zero_change(self):
        assert format_bucket_delta_change_label(30.0, 60.0) == "-50%"

    def test_zero_baseline_non_zero_current_returns_emdash(self):
        assert format_bucket_delta_change_label(1.0, 0.0) == "—"

    def test_zero_current_non_zero_baseline_formats_drop(self):
        assert format_bucket_delta_change_label(0.0, 10.0) == "-100%"

    def test_specific_one_to_zero_drop_is_not_zero_percent(self):
        assert format_bucket_delta_change_label(0.0, 1.0) == "-100%"


class TestFormatPercentChange:
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
    def test_weekly_no_padding(self):
        assert format_training_ratio(5, 7) == "5/7"
        assert format_training_ratio(0, 7) == "0/7"
        assert format_training_ratio(7, 7) == "7/7"

    def test_monthly_zero_padded(self):
        assert format_training_ratio(5, 31) == "05/31"
        assert format_training_ratio(15, 30) == "15/30"
        assert format_training_ratio(0, 28) == "00/28"

    def test_eight_day_threshold_is_padded(self):
        assert format_training_ratio(3, 8) == "03/8"


class TestFormatMaTrainingRatio:
    def test_none_returns_emdash(self):
        assert format_ma_training_ratio(None, "7") == "—"

    def test_weekly_unit(self):
        assert format_ma_training_ratio(4.5, "7") == "4.5/7"

    def test_yearly_unit_rounds(self):
        assert format_ma_training_ratio(168.4, "yr") == "168/yr"

    def test_other_units_show_decimal(self):
        assert format_ma_training_ratio(17.25, "mo") == "17.2/mo"


class TestFormatProgressBar:
    def test_normal_progress(self):
        bar, percent = format_progress_bar(50, 100, width=10)
        assert bar == "█████░░░░░"
        assert percent == 50

    def test_over_target_caps_bar_not_percent(self):
        bar, percent = format_progress_bar(150, 100, width=10)
        assert bar == "██████████"
        assert percent == 150

    def test_zero_or_negative_target(self):
        bar, percent = format_progress_bar(10, 0, width=6)
        assert bar == "░░░░░░"
        assert percent == 0

    def test_default_width_is_twenty(self):
        bar, percent = format_progress_bar(10, 20)
        assert len(bar) == 20
        assert bar.count("█") == 10
        assert percent == 50

    def test_target_one_is_treated_as_valid_target(self):
        bar, percent = format_progress_bar(1, 1, width=6)
        assert bar == "██████"
        assert percent == 100
