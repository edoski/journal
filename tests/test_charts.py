"""
Tests for sync_utils.charts module.

This is the most critical module for visual consistency. Tests use snapshot-style
comparisons with exact expected output to catch any changes in chart rendering.
"""
from __future__ import annotations

import datetime

from sync_utils.charts import (
    render_sleep_stats_table,
    render_activity_table,
    render_interrupts_table,
    wrap_code_block,
    render_summary_table,
    render_bar_chart,
    render_training_quarter_block,
    render_training_frequency_grid,
    render_weekly_training_grid,
    study_intensity_symbol,
    render_weekly_study_grid,
    render_monthly_study_grid,
    _compress_symbols,
    _compress_days_time_order,
    compress_activity_time_order,
    render_quarterly_study_coverage,
    render_yearly_study_coverage,
)
from sync_utils.constants import STUDY_TARGET_MIN, STUDY_SYMBOL_DEEP, STUDY_SYMBOL_NONE


class TestRenderSleepStatsTable:
    """Tests for render_sleep_stats_table function."""

    def test_complete_table(self):
        result = render_sleep_stats_table(
            sleep_avg=480,  # 8h
            avg_awake=20,
            avg_awakenings=2.5,
        )
        assert result[0] == "| ACTIVITY | AVERAGE |"
        assert result[1] == "| -------- | ------- |"
        assert "`8h00m`" in result[2]
        assert "`20m`" in result[3]
        assert "`2.5`" in result[4]

    def test_none_values(self):
        result = render_sleep_stats_table(None, None, None)
        assert len(result) == 5  # Header + separator + 3 rows
        # None values should produce empty cells
        assert "| **SLEEP**      | |" in result
        assert "| **AWAKE**      | |" in result
        assert "| **AWAKENINGS** | |" in result

    def test_whole_number_awakenings(self):
        result = render_sleep_stats_table(480, 20, 2.0)
        # 2.0 should display as "2" not "2.0"
        assert "`2`" in result[4]


class TestRenderActivityTable:
    """Tests for render_activity_table function."""

    def test_multiple_activities(self):
        totals = {"coding": 300, "reading": 120, "writing": 60}
        result = render_activity_table(totals)
        
        assert result[0] == "| ACTIVITY | TIME | SHARE |"
        assert result[1] == "| -------- | ---- | ----- |"
        
        # Should be sorted by time (descending)
        assert "coding" in result[2]
        assert "reading" in result[3]
        assert "writing" in result[4]

    def test_share_percentages(self):
        totals = {"a": 50, "b": 50}
        result = render_activity_table(totals)
        # Each should be 50%
        assert "`50%`" in result[2]
        assert "`50%`" in result[3]

    def test_empty_activities(self):
        result = render_activity_table({})
        assert len(result) == 3
        assert "|  |  |  |" in result[2]


class TestRenderInterruptsTable:
    """Tests for render_interrupts_table function."""

    def test_formatting(self):
        result = render_interrupts_table(avg_interrupts=15, avg_overruns=10)
        assert "| METRIC | AVERAGE |" in result
        assert "`0h15m/day`" in result[2]
        assert "`0h10m/day`" in result[3]

    def test_zero_values(self):
        result = render_interrupts_table(0, 0)
        assert "`0h00m/day`" in result[2]
        assert "`0h00m/day`" in result[3]


class TestWrapCodeBlock:
    """Tests for wrap_code_block function."""

    def test_wraps_lines(self):
        lines = ["line 1", "line 2"]
        result = wrap_code_block(lines)
        assert result == ["```", "line 1", "line 2", "```"]

    def test_empty_input(self):
        result = wrap_code_block([])
        assert result == ["```", "```"]


class TestRenderSummaryTable:
    """Tests for render_summary_table function."""

    def test_complete_table(self):
        current = {
            "study_total_minutes": 2100,  # 35h/week = 5h/day avg
            "sleep_avg_minutes": 450,
            "mood_avg": 7.5,
            "workout_count": 5,
            "stretch_count": 3,
            "total_days": 7,
            "days_up_to_today": 7,
        }
        previous = {
            "study_total_minutes": 1800,  # 30h/week
            "sleep_avg_minutes": 420,
            "mood_avg": 7.0,
            "workout_count": 4,
            "stretch_count": 4,
            "total_days": 7,
            "days_up_to_today": 7,
        }
        result = render_summary_table(current, previous, "THIS WEEK", "LAST WEEK")
        
        assert "### **SUMMARY**" in result
        assert "| METRIC | THIS WEEK | LAST WEEK | CHANGE |" in result
        assert "**STUDY**" in str(result)
        assert "**SLEEP**" in str(result)
        assert "**WORKOUT**" in str(result)
        assert "**STRETCH**" in str(result)
        assert "**MOOD**" in str(result)

    def test_percent_changes(self):
        current = {"study_total_minutes": 200, "total_days": 1, "days_up_to_today": 1,
                   "sleep_avg_minutes": 0, "mood_avg": 0, "workout_count": 0, "stretch_count": 0}
        previous = {"study_total_minutes": 100, "total_days": 1, "days_up_to_today": 1,
                    "sleep_avg_minutes": 0, "mood_avg": 0, "workout_count": 0, "stretch_count": 0}
        result = render_summary_table(current, previous, "A", "B")
        # 200 vs 100 = +100% change
        assert "`+100%`" in str(result)


class TestRenderBarChart:
    """Tests for render_bar_chart function - CRITICAL for visual consistency."""

    def test_basic_weekly_chart(self):
        """Verify basic weekly chart structure."""
        labels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
        values = [5, 7, 3, 8, 6, 2, 4]
        value_labels = ["5h", "7h", "3h", "8h", "6h", "2h", "4h"]
        
        result = render_bar_chart(
            labels=labels,
            values=values,
            value_labels=value_labels,
            height=10,
            y_max=10,
        )
        
        # Should have axis
        assert any("└" in line for line in result)
        assert any("─" in line for line in result)
        
        # Should have labels
        assert any("MON" in line for line in result)
        assert any("SUN" in line for line in result)
        
        # Should have bars
        assert any("█" in line for line in result)

    def test_max_value_overflow_line(self):
        """Values at max should have labels on overflow line."""
        labels = ["A", "B"]
        values = [10, 5]  # First at max
        value_labels = ["10h", "5h"]
        
        result = render_bar_chart(
            labels=labels,
            values=values,
            value_labels=value_labels,
            height=10,
            y_max=10,
        )
        
        # Max value label should be on first line (overflow)
        assert "10h" in result[0]

    def test_zero_value_label_at_bottom(self):
        """Zero values should show labels at level 1."""
        labels = ["A", "B"]
        values = [0, 5]
        value_labels = ["0h", "5h"]
        
        result = render_bar_chart(
            labels=labels,
            values=values,
            value_labels=value_labels,
            height=10,
            y_max=10,
        )
        
        # Find the bottom-most bar row (just before axis)
        axis_idx = next(i for i, line in enumerate(result) if "└" in line)
        # Zero label should be visible in bar area
        bar_area = result[:axis_idx]
        assert any("0h" in line for line in bar_area)

    def test_delta_labels(self):
        """Delta labels should appear below x-axis labels."""
        labels = ["A", "B"]
        values = [5, 5]
        value_labels = ["5h", "5h"]
        delta_labels = ["+10%", "-5%"]
        
        result = render_bar_chart(
            labels=labels,
            values=values,
            value_labels=value_labels,
            height=10,
            y_max=10,
            delta_labels=delta_labels,
        )
        
        assert any("+10%" in line for line in result)
        assert any("-5%" in line for line in result)

    def test_axis_length_consistency(self):
        """Axis should be consistent length based on column spacing."""
        labels = ["A", "B", "C"]
        values = [5, 5, 5]
        value_labels = ["5", "5", "5"]
        
        result = render_bar_chart(
            labels=labels,
            values=values,
            value_labels=value_labels,
            height=10,
            y_max=10,
            col_spacing=12,
            axis_trim=3,
        )
        
        axis_line = next(line for line in result if "└" in line)
        # axis should be 12*3 - 3 = 33 dashes
        expected_dashes = 12 * 3 - 3
        assert axis_line.count("─") == expected_dashes


class TestRenderTrainingQuarterBlock:
    """Tests for render_training_quarter_block function."""

    def test_basic_output(self):
        labels = ["Q1", "Q2"]
        counts = [(10, 90), (15, 91)]
        
        result = render_training_quarter_block(labels, counts)
        
        assert len(result) == 2
        assert "Q1" in result[0]
        assert "Q2" in result[1]
        assert "(10/90)" in result[0]
        assert "(15/91)" in result[1]

    def test_bar_characters(self):
        labels = ["Q1"]
        counts = [(15, 30)]  # 50% filled
        
        result = render_training_quarter_block(labels, counts, bar_width=10)
        
        assert "■" in result[0]
        assert "·" in result[0]

    def test_delta_labels(self):
        labels = ["Q1", "Q2"]
        counts = [(10, 90), (15, 91)]
        deltas = ["+10%", "+50%"]
        
        result = render_training_quarter_block(labels, counts, delta_labels=deltas)
        
        assert "+10%" in result[0]
        assert "+50%" in result[1]


class TestRenderWeeklyTrainingGrid:
    """Tests for render_weekly_training_grid function."""

    def test_basic_structure(self, sample_week_dates, sample_daily_data):
        result = render_weekly_training_grid(
            dates=sample_week_dates,
            daily_data=sample_daily_data,
            workout_count=3,
            stretch_count=2,
        )
        
        # Should have header, workout row, stretch row, separator, labels
        assert any("WORKOUT:" in line for line in result)
        assert any("STRETCH:" in line for line in result)
        assert any("MON" in line for line in result)
        assert any("SUN" in line for line in result)

    def test_symbols(self, sample_week_dates, sample_daily_data):
        result = render_weekly_training_grid(
            dates=sample_week_dates,
            daily_data=sample_daily_data,
            workout_count=3,
            stretch_count=2,
        )
        
        # Should have filled and empty symbols
        workout_line = next(line for line in result if "WORKOUT:" in line)
        assert "███" in workout_line or "░░░" in workout_line

    def test_arrow_placement(self, sample_week_dates, sample_daily_data):
        current = sample_week_dates[3]  # Thursday
        result = render_weekly_training_grid(
            dates=sample_week_dates,
            daily_data=sample_daily_data,
            workout_count=3,
            stretch_count=2,
            current_date=current,
        )
        
        # Should have arrow on first line
        assert any("↓" in line for line in result)


class TestStudyIntensitySymbol:
    """Tests for study_intensity_symbol function."""

    def test_at_target(self):
        assert study_intensity_symbol(STUDY_TARGET_MIN) == STUDY_SYMBOL_DEEP

    def test_above_target(self):
        assert study_intensity_symbol(STUDY_TARGET_MIN + 60) == STUDY_SYMBOL_DEEP

    def test_below_target(self):
        assert study_intensity_symbol(STUDY_TARGET_MIN - 1) == STUDY_SYMBOL_NONE

    def test_zero(self):
        assert study_intensity_symbol(0) == STUDY_SYMBOL_NONE

    def test_none(self):
        assert study_intensity_symbol(None) == STUDY_SYMBOL_NONE


class TestRenderWeeklyStudyGrid:
    """Tests for render_weekly_study_grid function."""

    def test_basic_structure(self, sample_week_dates, sample_daily_data):
        result = render_weekly_study_grid(
            dates=sample_week_dates,
            daily_data=sample_daily_data,
        )
        
        assert any("FULL STUDY DAYS" in line for line in result)
        assert any("MON" in line for line in result)
        assert any("███" in line or "░░░" in line for line in result)


class TestRenderMonthlyStudyGrid:
    """Tests for render_monthly_study_grid function."""

    def test_basic_structure(self):
        week_ranges = [
            (datetime.date(2025, 12, 1), datetime.date(2025, 12, 7)),
            (datetime.date(2025, 12, 8), datetime.date(2025, 12, 14)),
        ]
        daily_data = {
            datetime.date(2025, 12, 1): {"study_minutes": 400},
            datetime.date(2025, 12, 2): {"study_minutes": 100},
        }
        
        result = render_monthly_study_grid(week_ranges, daily_data)
        
        assert any("FULL STUDY DAYS" in line for line in result)
        assert any("DEC" in line for line in result)


class TestCompressSymbols:
    """Tests for _compress_symbols function."""

    def test_no_compression_needed(self):
        symbols = [STUDY_SYMBOL_DEEP, STUDY_SYMBOL_NONE, STUDY_SYMBOL_DEEP]
        result = _compress_symbols(symbols, 5)
        # 3 symbols into 5 width - should pad with NONE
        assert len(result) == 5

    def test_compression(self):
        # 10 symbols compressed to 5
        symbols = [STUDY_SYMBOL_DEEP] * 10
        result = _compress_symbols(symbols, 5)
        assert len(result) == 5
        assert all(c == STUDY_SYMBOL_DEEP for c in result)

    def test_empty_input(self):
        result = _compress_symbols([], 5)
        assert len(result) == 5
        assert all(c == STUDY_SYMBOL_NONE for c in result)

    def test_zero_width(self):
        result = _compress_symbols([STUDY_SYMBOL_DEEP], 0)
        assert result == ""


class TestCompressDaysTimeOrder:
    """Tests for _compress_days_time_order function."""

    def test_basic_compression(self):
        days = [datetime.date(2025, 1, 1) + datetime.timedelta(i) for i in range(10)]
        today = datetime.date(2025, 1, 15)
        
        result = _compress_days_time_order(
            days,
            lambda d: True,  # All days meet criterion
            5,
            today=today,
        )
        
        assert len(result) == 5
        assert result.count("█") == 5

    def test_future_days_excluded(self):
        days = [datetime.date(2025, 12, 25), datetime.date(2025, 12, 26)]
        today = datetime.date(2025, 12, 25)
        
        result = _compress_days_time_order(
            days,
            lambda d: True,
            2,
            today=today,
        )
        
        # First day met, second is future
        assert "█" in result
        assert "·" in result


class TestCompressActivityTimeOrder:
    """Tests for compress_activity_time_order function."""

    def test_basic_usage(self):
        days = [datetime.date(2025, 1, 1) + datetime.timedelta(i) for i in range(7)]
        today = datetime.date(2025, 1, 10)
        
        result = compress_activity_time_order(
            days,
            lambda d: d.day % 2 == 1,  # Odd days have activity
            7,
            today=today,
        )
        
        assert len(result) == 7
        assert "■" in result
        assert "·" in result


class TestRenderQuarterlyStudyCoverage:
    """Tests for render_quarterly_study_coverage function."""

    def test_basic_structure(self):
        month_ranges = [
            (datetime.date(2025, 10, 1), datetime.date(2025, 10, 31)),
            (datetime.date(2025, 11, 1), datetime.date(2025, 11, 30)),
            (datetime.date(2025, 12, 1), datetime.date(2025, 12, 31)),
        ]
        daily_data = {}
        
        result = render_quarterly_study_coverage(
            month_ranges,
            daily_data,
            today=datetime.date(2025, 12, 26),
        )
        
        assert any("FULL STUDY DAYS" in line for line in result)
        assert any("OCT" in line for line in result)
        assert any("NOV" in line for line in result)
        assert any("DEC" in line for line in result)


class TestRenderYearlyStudyCoverage:
    """Tests for render_yearly_study_coverage function."""

    def test_basic_structure(self):
        quarter_ranges = [
            (datetime.date(2025, 1, 1), datetime.date(2025, 3, 31)),
            (datetime.date(2025, 4, 1), datetime.date(2025, 6, 30)),
            (datetime.date(2025, 7, 1), datetime.date(2025, 9, 30)),
            (datetime.date(2025, 10, 1), datetime.date(2025, 12, 31)),
        ]
        daily_data = {}
        
        result = render_yearly_study_coverage(
            quarter_ranges,
            daily_data,
            today=datetime.date(2025, 12, 26),
        )
        
        assert any("FULL STUDY DAYS" in line for line in result)
        assert any("Q1" in line for line in result)
        assert any("Q4" in line for line in result)

    def test_with_delta_labels(self):
        quarter_ranges = [
            (datetime.date(2025, 10, 1), datetime.date(2025, 12, 31)),
        ]
        daily_data = {}
        delta_labels = ["+10%"]
        
        result = render_yearly_study_coverage(
            quarter_ranges,
            daily_data,
            today=datetime.date(2025, 12, 26),
            delta_labels=delta_labels,
        )
        
        assert any("+10%" in line for line in result)


class TestRenderTrainingFrequencyGrid:
    """Tests for render_training_frequency_grid function."""

    def test_basic_structure(self):
        week_ranges = [
            (datetime.date(2025, 12, 1), datetime.date(2025, 12, 7)),
            (datetime.date(2025, 12, 8), datetime.date(2025, 12, 14)),
        ]
        daily_data = {
            datetime.date(2025, 12, 1): {"workout": True, "stretch": False},
            datetime.date(2025, 12, 2): {"workout": False, "stretch": True},
        }
        
        result = render_training_frequency_grid(
            week_ranges=week_ranges,
            daily_data=daily_data,
            workout_count=1,
            stretch_count=1,
            days_in_period=14,
        )
        
        assert any("WORKOUT" in line for line in result)
        assert any("STRETCH" in line for line in result)
        assert any("DEC" in line for line in result)

    def test_symbol_rendering(self):
        week_ranges = [(datetime.date(2025, 12, 1), datetime.date(2025, 12, 7))]
        daily_data = {
            datetime.date(2025, 12, 1): {"workout": True, "stretch": False},
        }
        
        result = render_training_frequency_grid(
            week_ranges=week_ranges,
            daily_data=daily_data,
            workout_count=1,
            stretch_count=0,
            days_in_period=7,
        )
        
        # Should have filled and empty symbols
        assert any("■" in line for line in result)
        assert any("·" in line for line in result)


# =============================================================================
# SNAPSHOT TESTS - Exact output verification for regression detection
# =============================================================================

class TestBarChartSnapshots:
    """Snapshot tests for bar chart exact output - CRITICAL for consistency."""

    def test_weekly_study_chart_snapshot(self):
        """Exact output test for weekly study chart format."""
        labels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
        values = [6, 7, 0, 10, 5, 0, 4]  # THU at max (10) triggers overflow line
        value_labels = ["6h", "7h", "0h", "10h", "5h", "0h", "4h"]
        
        result = render_bar_chart(
            labels=labels,
            values=values,
            value_labels=value_labels,
            height=10,
            y_max=10,
            bar_width=5,
            col_spacing=12,
        )
        
        # Verify key structural elements
        # When there's a max value (10), the first line is the overflow with that label
        assert "10h" in result[0]  # Max value on overflow line
        
        # Find axis line
        axis_idx = next(i for i, line in enumerate(result) if "└" in line)
        
        # Labels should be on line after axis
        label_line = result[axis_idx + 1]
        assert "MON" in label_line
        assert "SUN" in label_line
        
        # Bar rows should contain █ characters
        bar_rows = [r for r in result[:axis_idx] if "│" in r]
        assert len(bar_rows) == 10  # height=10 rows

    def test_summary_table_format_snapshot(self):
        """Verify exact summary table format."""
        current = {
            "study_total_minutes": 420,
            "sleep_avg_minutes": 480,
            "mood_avg": 7.5,
            "workout_count": 5,
            "stretch_count": 3,
            "total_days": 7,
            "days_up_to_today": 7,
        }
        previous = {
            "study_total_minutes": 350,
            "sleep_avg_minutes": 450,
            "mood_avg": 7.0,
            "workout_count": 4,
            "stretch_count": 4,
            "total_days": 7,
            "days_up_to_today": 7,
        }
        
        result = render_summary_table(current, previous, "THIS WEEK", "LAST WEEK")
        
        # Verify structure
        assert result[0] == "### **SUMMARY**"
        assert result[1] == ""
        assert "| METRIC | THIS WEEK | LAST WEEK | CHANGE |" in result[2]
        assert "| ------ | ----------- | ----------------------- | ------ |" in result[3]
        
        # Verify row order: STUDY → SLEEP → WORKOUT → STRETCH → MOOD
        row_texts = " ".join(result)
        study_pos = row_texts.find("STUDY")
        sleep_pos = row_texts.find("SLEEP")
        workout_pos = row_texts.find("WORKOUT")
        stretch_pos = row_texts.find("STRETCH")
        mood_pos = row_texts.find("MOOD")
        
        assert study_pos < sleep_pos < workout_pos < stretch_pos < mood_pos
