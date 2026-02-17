"""Tests for unified markdown table API."""

from __future__ import annotations

import datetime

from sync.models.deviation import DailyDeviationData
from sync.models.screen_time import DailyScreenTimeData, ScreenTimeEntry
from sync.writers.tables import (
    DailyProcrastinationTableSpec,
    ScreenTrendMode,
    ScreenTrendTableSpec,
    SimpleGridTableSpec,
    SummaryMetricsTableSpec,
    render_table,
)


class TestSimpleGridTable:
    def test_renders_headers_divider_and_rows(self):
        lines = render_table(
            SimpleGridTableSpec(
                headers=["A", "B"],
                divider_cells=["---", "----"],
                rows=[["1", "2"], ["3", "4"]],
            )
        )
        assert lines == [
            "| A | B |",
            "| --- | ---- |",
            "| 1 | 2 |",
            "| 3 | 4 |",
        ]


class TestSummaryMetricsTable:
    def test_renders_summary_section(self):
        current = {
            "study_total_minutes": 420,
            "sleep_avg_minutes": 480,
            "mood_avg": 7.5,
            "workout_count": 5,
            "stretch_count": 3,
            "mindful_count": 4,
            "total_days": 7,
            "days_up_to_today": 7,
        }
        previous = {
            "study_total_minutes": 350,
            "sleep_avg_minutes": 450,
            "mood_avg": 7.0,
            "workout_count": 4,
            "stretch_count": 4,
            "mindful_count": 3,
            "total_days": 7,
            "days_up_to_today": 7,
        }

        lines = render_table(
            SummaryMetricsTableSpec(
                current_metrics=current,
                previous_metrics=previous,
                current_label="THIS WEEK",
                previous_label="LAST WEEK",
            )
        )
        assert lines[0] == "### **SUMMARY**"
        assert (
            "| METRIC | THIS WEEK | LAST WEEK | CHANGE | TARGET | PROGRESS |" in lines
        )
        assert any("**STUDY**" in line for line in lines)

    def test_summary_change_shows_emdash_when_both_zero(self):
        current = {
            "study_total_minutes": 0,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 0,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 7,
            "days_up_to_today": 7,
        }
        previous = {
            "study_total_minutes": 0,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 0,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 7,
            "days_up_to_today": 7,
        }

        lines = render_table(
            SummaryMetricsTableSpec(
                current_metrics=current,
                previous_metrics=previous,
                current_label="THIS WEEK",
                previous_label="LAST WEEK",
            )
        )

        study_line = next(line for line in lines if "**STUDY**" in line)
        assert "| `—` |" in study_line

    def test_training_change_uses_pace_denominators(self):
        current = {
            "study_total_minutes": 0,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 1,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 7,
            "days_up_to_today": 2,
        }
        previous = {
            "study_total_minutes": 0,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 1,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 7,
            "days_up_to_today": 1,
        }

        lines = render_table(
            SummaryMetricsTableSpec(
                current_metrics=current,
                previous_metrics=previous,
                current_label="THIS WEEK",
                previous_label="LAST WEEK",
            )
        )

        workout_line = next(line for line in lines if "**WORKOUT**" in line)
        assert "| `-50%` |" in workout_line


class TestScreenTrendTable:
    def test_daily_trend_table(self):
        dates = [
            datetime.date(2025, 12, 1) + datetime.timedelta(days=i) for i in range(3)
        ]
        daily_data = {
            dates[0]: {"screen_time_totals": {"YouTube": 10}},
            dates[1]: {"screen_time_totals": {"YouTube": 20}},
            dates[2]: {"screen_time_totals": {}},
        }
        lines = render_table(
            ScreenTrendTableSpec(
                mode=ScreenTrendMode.DAILY,
                period_label="DAY",
                dates=dates,
                daily_data=daily_data,
            )
        )
        assert lines[0] == "| DAY | SCREEN |"
        assert lines[1] == "| ----- | -------- |"
        assert any("TOTAL" in line for line in lines)

    def test_period_trend_table(self):
        ranges = [
            (datetime.date(2025, 12, 1), datetime.date(2025, 12, 7)),
            (datetime.date(2025, 12, 8), datetime.date(2025, 12, 14)),
        ]
        lines = render_table(
            ScreenTrendTableSpec(
                mode=ScreenTrendMode.PERIOD,
                period_label="WEEK",
                period_ranges=ranges,
                daily_data={},
                labels=["DEC 01-07", "DEC 08-14"],
                wikilinks=["[[2025-W49|DEC 01-07]]", "[[2025-W50|DEC 08-14]]"],
            )
        )
        assert lines[0] == "| WEEK | SCREEN |"
        assert any("[[2025-W49|DEC 01-07]]" in line for line in lines)


class TestDailyProcrastinationTable:
    def test_with_data(self):
        data = DailyScreenTimeData(
            entries=[
                ScreenTimeEntry(app="YouTube", minutes=75),
                ScreenTimeEntry(app="Instagram", minutes=20),
                ScreenTimeEntry(app="X", minutes=5),
            ]
        )
        lines = render_table(
            DailyProcrastinationTableSpec(
                screen_time_data=data,
                deviation_data=None,
                include_section_title=True,
            )
        )
        assert "### **PROCRASTINATION**" in lines
        assert any("YouTube" in line and "`+1h15m`" in line for line in lines)
        assert any("Instagram" in line and "`+20m`" in line for line in lines)
        assert any("X" in line and "`+5m`" in line for line in lines)
        assert any("**TOTAL**" in line and "`1h40m`" in line for line in lines)

    def test_with_deviation(self):
        data = DailyScreenTimeData(entries=[ScreenTimeEntry(app="YouTube", minutes=30)])
        deviation = DailyDeviationData(
            late_study_start_minutes=40,
            late_workout_start_minutes=20,
        )
        lines = render_table(
            DailyProcrastinationTableSpec(
                screen_time_data=data,
                deviation_data=deviation,
                include_section_title=True,
            )
        )
        assert any("DEVIATIONS" in line for line in lines)
        assert any("**TOTAL**" in line and "`1h00m`" in line for line in lines)
