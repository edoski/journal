"""Tests for unified markdown table API."""

from __future__ import annotations

import datetime
from dataclasses import replace
from typing import cast

import pytest

from sync.contracts.deviation import DailyDeviationData
from sync.contracts.screen_time import DailyScreenTimeData, ScreenTimeEntry
import sync.writers.tables.api as tables_api_module
import sync.writers.tables.renderers.screen_trend as screen_trend_renderer
import sync.writers.tables.renderers.summary_metrics as summary_renderer
from sync.constants import RENDER
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

    def test_renders_header_and_divider_when_rows_are_empty(self):
        lines = render_table(SimpleGridTableSpec(headers=["A"], rows=[]))
        assert lines == ["| A |", "| ---- |"]


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
                study_target_minutes=2520,
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
                study_target_minutes=2520,
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
                study_target_minutes=2520,
            )
        )

        workout_line = next(line for line in lines if "**WORKOUT**" in line)
        assert "| `-50%` |" in workout_line

    def test_renders_exact_weekly_summary_without_ma(self):
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
                study_target_minutes=2520,
            )
        )
        assert lines == [
            "### **SUMMARY**",
            "",
            "| METRIC | THIS WEEK | LAST WEEK | CHANGE | TARGET | PROGRESS |",
            "| ------ | ------------- | ----------------------- | ------ | ------ | -------- |",
            "| **STUDY** | `1h00m/day` | `0h50m/day` | `+20%` | `42h/wk` | `████░░░░░░░░░░░░░░░░░░░░░` `17%` |",
            "| **SLEEP** | `8h00m/night` | `7h30m/night` | `+7%` | `8h/night` | `█████████████████████████` `100%` |",
            "| **MINDFUL** | `4/7` | `3/7` | `+33%` | `7/7` | `██████████████░░░░░░░░░░░` `57%` |",
            "| **WORKOUT** | `5/7` | `4/7` | `+25%` | `7/7` | `██████████████████░░░░░░░` `71%` |",
            "| **STRETCH** | `3/7` | `4/7` | `-25%` | `7/7` | `███████████░░░░░░░░░░░░░░` `43%` |",
            "| **MOOD** | `7.5/10.0` | `7.0/10.0` | `+7%` | `6.0/10` | `█████████████████████████` `125%` |",
            "",
        ]

    def test_renders_exact_weekly_summary_with_ma(self):
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
        ma_metrics = {
            "study_avg_minutes": 360,
            "sleep_avg_minutes": 420,
            "mindful_avg": 3.2,
            "workout_avg": 4.4,
            "stretch_avg": 2.5,
            "mood_avg": 7.2,
        }
        lines = render_table(
            SummaryMetricsTableSpec(
                current_metrics=current,
                previous_metrics=previous,
                current_label="THIS WEEK",
                previous_label="LAST WEEK",
                study_target_minutes=2520,
                ma_metrics=ma_metrics,
                ma_label="3W AVG",
                ma_training_unit="7",
            )
        )
        assert lines == [
            "### **SUMMARY**",
            "",
            "| METRIC | THIS WEEK | LAST WEEK | CHANGE | 3W AVG | TARGET | PROGRESS |",
            "| ------ | ------------- | ----------------------- | ------ | ---------- | ------ | -------- |",
            "| **STUDY** | `1h00m/day` | `0h50m/day` | `+20%` | `6h00m/day` | `42h/wk` | `████░░░░░░░░░░░░░░░░░░░░░` `17%` |",
            "| **SLEEP** | `8h00m/night` | `7h30m/night` | `+7%` | `7h00m/night` | `8h/night` | `█████████████████████████` `100%` |",
            "| **MINDFUL** | `4/7` | `3/7` | `+33%` | `3.2/7` | `7/7` | `██████████████░░░░░░░░░░░` `57%` |",
            "| **WORKOUT** | `5/7` | `4/7` | `+25%` | `4.4/7` | `7/7` | `██████████████████░░░░░░░` `71%` |",
            "| **STRETCH** | `3/7` | `4/7` | `-25%` | `2.5/7` | `7/7` | `███████████░░░░░░░░░░░░░░` `43%` |",
            "| **MOOD** | `7.5/10.0` | `7.0/10.0` | `+7%` | `7.2/10.0` | `6.0/10` | `█████████████████████████` `125%` |",
            "",
        ]

    def test_ma_requires_both_metrics_and_label(self):
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

        missing_label = render_table(
            SummaryMetricsTableSpec(
                current_metrics=current,
                previous_metrics=previous,
                current_label="THIS WEEK",
                previous_label="LAST WEEK",
                study_target_minutes=2520,
                ma_metrics={"study_avg_minutes": 360},
                ma_label=None,
            )
        )
        missing_metrics = render_table(
            SummaryMetricsTableSpec(
                current_metrics=current,
                previous_metrics=previous,
                current_label="THIS WEEK",
                previous_label="LAST WEEK",
                study_target_minutes=2520,
                ma_metrics=None,
                ma_label="3W AVG",
            )
        )

        assert (
            "| METRIC | THIS WEEK | LAST WEEK | CHANGE | TARGET | PROGRESS |"
            in missing_label
        )
        assert (
            "| METRIC | THIS WEEK | LAST WEEK | CHANGE | TARGET | PROGRESS |"
            in missing_metrics
        )
        assert all("3W AVG" not in line for line in missing_label)
        assert all("3W AVG" not in line for line in missing_metrics)

    def test_study_total_zero_stays_zero_at_single_day_denominator(self):
        current = {
            "study_total_minutes": 0,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 0,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 7,
            "days_up_to_today": 1,
        }
        previous = {
            "study_total_minutes": 0,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 0,
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
                study_target_minutes=2520,
            )
        )
        study_line = next(line for line in lines if "**STUDY**" in line)
        assert "| `0h00m/day` |" in study_line

    def test_study_uses_total_days_fallback_when_days_up_to_today_missing(self):
        current = {
            "study_total_minutes": 120,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 0,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 3,
        }
        previous = {
            "study_total_minutes": 90,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 0,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 3,
        }
        lines = render_table(
            SummaryMetricsTableSpec(
                current_metrics=current,
                previous_metrics=previous,
                current_label="THIS WINDOW",
                previous_label="LAST WINDOW",
                study_target_minutes=2520,
            )
        )
        study_line = next(line for line in lines if "**STUDY**" in line)
        assert "| `0h40m/day` | `0h30m/day` |" in study_line

    def test_study_falls_back_to_7_days_when_current_days_missing(self):
        current = {
            "study_total_minutes": 70,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 0,
            "stretch_count": 0,
            "mindful_count": 0,
        }
        previous = {
            "study_total_minutes": 35,
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
                study_target_minutes=2520,
            )
        )
        study_line = next(line for line in lines if "**STUDY**" in line)
        assert "| `0h10m/day` | `0h05m/day` |" in study_line

    def test_missing_study_total_defaults_to_zero_not_one(self):
        current = {
            "sleep_avg_minutes": 480,
            "mood_avg": 7.0,
            "workout_count": 0,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 7,
            "days_up_to_today": 7,
        }
        previous = {
            "study_total_minutes": 0,
            "sleep_avg_minutes": 480,
            "mood_avg": 7.0,
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
                study_target_minutes=2520,
            )
        )
        study_line = next(line for line in lines if "**STUDY**" in line)
        assert "| `0h00m/day` |" in study_line

    def test_previous_days_fallback_uses_previous_total_days(self):
        current = {
            "study_total_minutes": 120,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 0,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 3,
            "days_up_to_today": 3,
        }
        previous = {
            "study_total_minutes": 90,
            "sleep_avg_minutes": 0,
            "mood_avg": 0,
            "workout_count": 0,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 9,
        }
        lines = render_table(
            SummaryMetricsTableSpec(
                current_metrics=current,
                previous_metrics=previous,
                current_label="THIS WINDOW",
                previous_label="LAST WINDOW",
                study_target_minutes=2520,
            )
        )
        study_line = next(line for line in lines if "**STUDY**" in line)
        assert "| `0h40m/day` | `0h10m/day` |" in study_line

    def test_sleep_under_one_hour_keeps_hhmm_night_format(self):
        current = {
            "study_total_minutes": 0,
            "sleep_avg_minutes": 30,
            "mood_avg": 0,
            "workout_count": 0,
            "stretch_count": 0,
            "mindful_count": 0,
            "total_days": 7,
            "days_up_to_today": 7,
        }
        previous = {
            "study_total_minutes": 0,
            "sleep_avg_minutes": 15,
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
                study_target_minutes=2520,
            )
        )
        sleep_line = next(line for line in lines if "**SLEEP**" in line)
        assert "| `0h30m/night` | `0h15m/night` |" in sleep_line

    def test_show_ma_with_missing_metric_values_keeps_em_dash_cells(self):
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
                study_target_minutes=2520,
                ma_metrics={"study_avg_minutes": 0},
                ma_label="3W AVG",
                ma_training_unit="7",
            )
        )
        sleep_line = next(line for line in lines if "**SLEEP**" in line)
        mindful_line = next(line for line in lines if "**MINDFUL**" in line)
        workout_line = next(line for line in lines if "**WORKOUT**" in line)
        stretch_line = next(line for line in lines if "**STRETCH**" in line)
        mood_line = next(line for line in lines if "**MOOD**" in line)
        assert "| `—` |" in sleep_line
        assert "| `—` |" in mindful_line
        assert "| `—` |" in workout_line
        assert "| `—` |" in stretch_line
        assert "| `—` |" in mood_line

    def test_progress_bar_uses_renderer_empty_symbol(self, monkeypatch):
        custom_render = replace(RENDER, progress_empty=".")
        monkeypatch.setattr(summary_renderer, "RENDER", custom_render)

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
                study_target_minutes=2520,
            )
        )
        empty_bar = "." * custom_render.progress_bar_width
        for metric in ("STUDY", "SLEEP", "MINDFUL", "WORKOUT", "STRETCH", "MOOD"):
            metric_line = next(line for line in lines if f"**{metric}**" in line)
            assert empty_bar in metric_line
            assert "░" not in metric_line

    def test_missing_current_defaults_are_visible_with_single_day_denominator(self):
        current = {"days_up_to_today": 1}
        previous = {"days_up_to_today": 1}

        lines = render_table(
            SummaryMetricsTableSpec(
                current_metrics=current,
                previous_metrics=previous,
                current_label="THIS WEEK",
                previous_label="LAST WEEK",
                study_target_minutes=2520,
            )
        )

        study_line = next(line for line in lines if "**STUDY**" in line)
        sleep_line = next(line for line in lines if "**SLEEP**" in line)
        mindful_line = next(line for line in lines if "**MINDFUL**" in line)
        workout_line = next(line for line in lines if "**WORKOUT**" in line)
        stretch_line = next(line for line in lines if "**STRETCH**" in line)
        mood_line = next(line for line in lines if "**MOOD**" in line)

        assert "| `0h00m/day` | `0h00m/day` |" in study_line
        assert "| `0h00m/night` | `0h00m/night` |" in sleep_line
        assert "| `0/1` | `0/7` |" in mindful_line
        assert "| `0/1` | `0/7` |" in workout_line
        assert "| `0/1` | `0/7` |" in stretch_line
        assert "| `0.0/10.0` | `0.0/10.0` |" in mood_line

    def test_previous_days_fallback_defaults_to_seven_when_missing(self):
        current = {
            "study_total_minutes": 0,
            "mindful_count": 0,
            "workout_count": 0,
            "stretch_count": 0,
            "days_up_to_today": 1,
        }
        previous = {
            "study_total_minutes": 56,
            "mindful_count": 7,
            "workout_count": 7,
            "stretch_count": 7,
        }

        lines = render_table(
            SummaryMetricsTableSpec(
                current_metrics=current,
                previous_metrics=previous,
                current_label="THIS WEEK",
                previous_label="LAST WEEK",
                study_target_minutes=2520,
            )
        )

        study_line = next(line for line in lines if "**STUDY**" in line)
        mindful_line = next(line for line in lines if "**MINDFUL**" in line)
        workout_line = next(line for line in lines if "**WORKOUT**" in line)
        stretch_line = next(line for line in lines if "**STRETCH**" in line)

        assert "| `0h00m/day` | `0h08m/day` |" in study_line
        assert "| `0/1` | `7/7` |" in mindful_line
        assert "| `0/1` | `7/7` |" in workout_line
        assert "| `0/1` | `7/7` |" in stretch_line

    def test_show_ma_with_missing_values_uses_emdash_for_all_metrics(self):
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
                study_target_minutes=2520,
                ma_metrics={},
                ma_label="3W AVG",
                ma_training_unit="7",
            )
        )

        for metric in ("STUDY", "SLEEP", "MINDFUL", "WORKOUT", "STRETCH", "MOOD"):
            metric_line = next(line for line in lines if f"**{metric}**" in line)
            cells = [cell.strip() for cell in metric_line.split("|")]
            # Columns: [empty, METRIC, CURRENT, PREVIOUS, CHANGE, MA, TARGET, PROGRESS, empty]
            assert cells[5] == "`—`"

    def test_ma_minutes_under_one_hour_keep_hhmm_day_and_night_format(self):
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
                study_target_minutes=2520,
                ma_metrics={"study_avg_minutes": 30, "sleep_avg_minutes": 45},
                ma_label="3W AVG",
                ma_training_unit="7",
            )
        )
        study_line = next(line for line in lines if "**STUDY**" in line)
        sleep_line = next(line for line in lines if "**SLEEP**" in line)
        assert "| `0h30m/day` |" in study_line
        assert "| `0h45m/night` |" in sleep_line

    def test_study_target_unavailable_renders_emdash_target_and_progress(self):
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
                study_target_minutes=None,
            )
        )

        study_line = next(line for line in lines if "**STUDY**" in line)
        assert "| `—` | `—` |" in study_line

    def test_study_target_uses_provided_minutes_for_label_and_progress(self):
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
                study_target_minutes=300,
            )
        )

        study_line = next(line for line in lines if "**STUDY**" in line)
        assert "| `5h/wk` | `█████████████████████████` `140%` |" in study_line


class TestScreenTrendTable:
    class _FixedDate(datetime.date):
        @classmethod
        def today(cls) -> datetime.date:
            return cls(2026, 2, 17)

    def test_daily_rows_use_day_index_tokens_and_fallback_after_week_span(
        self, monkeypatch
    ):
        monkeypatch.setattr(screen_trend_renderer.datetime, "date", self._FixedDate)
        dates = [
            datetime.date(2026, 2, 17),
            datetime.date(2026, 2, 18),
            datetime.date(2026, 2, 19),
            datetime.date(2026, 2, 20),
            datetime.date(2026, 2, 21),
            datetime.date(2026, 2, 22),
            datetime.date(2026, 2, 23),
            datetime.date(2026, 2, 9),
        ]
        spec = ScreenTrendTableSpec(
            mode=ScreenTrendMode.DAILY,
            period_label="DAY",
            dates=dates,
            daily_data={
                dates[0]: {"screen_time_totals": {"YouTube": 1}},
                dates[1]: {"screen_time_totals": {"YouTube": 20}},
                dates[7]: {"screen_time_totals": {"X": 30}},
            },
            include_total_row=True,
        )

        rows = screen_trend_renderer._daily_rows(spec)

        assert rows[0] == ["**[[2026-02-17\\|MON]]**", "`+1m`"]
        assert rows[1] == ["**[[2026-02-18\\|TUE]]**", "—"]
        assert rows[7] == ["**[[2026-02-09\\|MON]]**", "`+30m`"]
        assert rows[8] == ["**TOTAL**", "**`31m`**"]

    def test_daily_rows_use_calendar_weekday_when_period_label_is_not_day(
        self, monkeypatch
    ):
        monkeypatch.setattr(screen_trend_renderer.datetime, "date", self._FixedDate)
        day = datetime.date(2026, 2, 17)
        rows = screen_trend_renderer._daily_rows(
            ScreenTrendTableSpec(
                mode=ScreenTrendMode.DAILY,
                period_label="WEEK",
                dates=[day],
                daily_data={day: {"screen_time_totals": {"YouTube": 5}}},
                include_total_row=False,
            )
        )
        assert rows == [["**[[2026-02-17\\|TUE]]**", "`+5m`"]]

    def test_daily_rows_zero_minutes_render_zero_rows_and_zero_total(self, monkeypatch):
        monkeypatch.setattr(screen_trend_renderer.datetime, "date", self._FixedDate)
        day = datetime.date(2026, 2, 16)
        rows = screen_trend_renderer._daily_rows(
            ScreenTrendTableSpec(
                mode=ScreenTrendMode.DAILY,
                period_label="DAY",
                dates=[day],
                daily_data={day: {"screen_time_totals": {}}},
                include_total_row=True,
            )
        )
        assert rows == [["**[[2026-02-16\\|MON]]**", "`0m`"], ["**TOTAL**", "**`0m`**"]]

    def test_period_rows_prefer_wikilinks_then_labels_then_week_fallback(
        self, monkeypatch
    ):
        monkeypatch.setattr(screen_trend_renderer.datetime, "date", self._FixedDate)
        ranges = [
            (datetime.date(2026, 2, 10), datetime.date(2026, 2, 10)),
            (datetime.date(2026, 2, 17), datetime.date(2026, 2, 17)),
            (datetime.date(2026, 2, 18), datetime.date(2026, 2, 18)),
            (datetime.date(2026, 2, 11), datetime.date(2026, 2, 11)),
        ]
        rows = screen_trend_renderer._period_rows(
            ScreenTrendTableSpec(
                mode=ScreenTrendMode.PERIOD,
                period_label="WEEK",
                period_ranges=ranges,
                daily_data={
                    datetime.date(2026, 2, 10): {"screen_time_totals": {"YouTube": 10}},
                    datetime.date(2026, 2, 17): {"screen_time_totals": {"YouTube": 1}},
                    datetime.date(2026, 2, 18): {"screen_time_totals": {"YouTube": 20}},
                },
                labels=["LBL1", "LBL2"],
                wikilinks=["[[WK1]]"],
                include_total_row=True,
            )
        )
        assert rows == [
            ["**[[WK1]]**", "`+10m`"],
            ["**LBL2**", "`+1m`"],
            ["**W3**", "—"],
            ["**W4**", "`0m`"],
            ["**TOTAL**", "**`11m`**"],
        ]

    def test_period_rows_month_fallback_and_zero_total(self, monkeypatch):
        monkeypatch.setattr(screen_trend_renderer.datetime, "date", self._FixedDate)
        rows = screen_trend_renderer._period_rows(
            ScreenTrendTableSpec(
                mode=ScreenTrendMode.PERIOD,
                period_label="MONTH",
                period_ranges=[
                    (datetime.date(2026, 2, 11), datetime.date(2026, 2, 11))
                ],
                daily_data={},
                labels=None,
                wikilinks=None,
                include_total_row=True,
            )
        )
        assert rows == [["**M1**", "`0m`"], ["**TOTAL**", "**`0m`**"]]

    def test_render_table_screen_trend_header_shape(self):
        lines = render_table(
            ScreenTrendTableSpec(
                mode=ScreenTrendMode.PERIOD,
                period_label="WEEK",
                period_ranges=[
                    (datetime.date(2026, 2, 10), datetime.date(2026, 2, 10))
                ],
                daily_data={},
                include_total_row=False,
            )
        )
        assert lines[0] == "| WEEK | SCREEN |"
        assert lines[1] == "| ----- | -------- |"


class TestDailyProcrastinationTable:
    def test_no_screen_time_data_with_title(self):
        lines = render_table(
            DailyProcrastinationTableSpec(
                screen_time_data=None,
                deviation_data=None,
                include_section_title=True,
            )
        )
        assert lines == [
            "### **PROCRASTINATION**",
            "",
            "_No screen time data available._",
        ]

    def test_no_screen_time_data_without_title(self):
        lines = render_table(
            DailyProcrastinationTableSpec(
                screen_time_data=None,
                deviation_data=None,
                include_section_title=False,
            )
        )
        assert lines == ["", "_No screen time data available._"]

    def test_empty_entries_without_deviation_renders_zero_total_table(self):
        lines = render_table(
            DailyProcrastinationTableSpec(
                screen_time_data=DailyScreenTimeData(entries=[]),
                deviation_data=None,
                include_section_title=False,
            )
        )
        assert lines == [
            "",
            "| SOURCE       | DURATION     |",
            "| ----------- | ----------- |",
            "| **TOTAL** | **`+0m`** |",
        ]

    def test_rows_are_sorted_descending_without_non_phone_deviation(self):
        lines = render_table(
            DailyProcrastinationTableSpec(
                screen_time_data=DailyScreenTimeData(
                    entries=[
                        ScreenTimeEntry(app="A", minutes=5),
                        ScreenTimeEntry(app="B", minutes=40),
                        ScreenTimeEntry(app="C", minutes=10),
                    ]
                ),
                deviation_data=DailyDeviationData(late_study_start_minutes=50),
                include_section_title=True,
            )
        )
        assert lines == [
            "### **PROCRASTINATION**",
            "",
            "| SOURCE       | DURATION     |",
            "| ----------- | ----------- |",
            "| B | `+40m` |",
            "| C | `+10m` |",
            "| A | `+5m` |",
            "| **TOTAL** | **`55m`** |",
        ]

    def test_non_phone_deviation_bucket_is_added_and_sorted(self):
        lines = render_table(
            DailyProcrastinationTableSpec(
                screen_time_data=DailyScreenTimeData(
                    entries=[
                        ScreenTimeEntry(app="A", minutes=5),
                        ScreenTimeEntry(app="B", minutes=40),
                    ]
                ),
                deviation_data=DailyDeviationData(late_study_start_minutes=70),
                include_section_title=False,
            )
        )
        assert lines == [
            "",
            "| SOURCE       | DURATION     |",
            "| ----------- | ----------- |",
            "| B | `+40m` |",
            "| DEVIATIONS | `+25m` |",
            "| A | `+5m` |",
            "| **TOTAL** | **`1h10m`** |",
        ]

    def test_one_minute_non_phone_deviation_is_still_included(self):
        lines = render_table(
            DailyProcrastinationTableSpec(
                screen_time_data=DailyScreenTimeData(
                    entries=[ScreenTimeEntry(app="A", minutes=5)]
                ),
                deviation_data=DailyDeviationData(late_study_start_minutes=6),
                include_section_title=False,
            )
        )
        assert lines == [
            "",
            "| SOURCE       | DURATION     |",
            "| ----------- | ----------- |",
            "| A | `+5m` |",
            "| DEVIATIONS | `+1m` |",
            "| **TOTAL** | **`6m`** |",
        ]


class TestTableDispatch:
    def test_unsupported_spec_type_raises_value_error(self):
        class _UnknownSpec:
            pass

        with pytest.raises(ValueError) as excinfo:
            render_table(cast(object, _UnknownSpec()))  # type: ignore[arg-type]
        assert (
            str(excinfo.value)
            == "Unsupported table spec: <class 'tests.sync.writers.tables.test_api.TestTableDispatch.test_unsupported_spec_type_raises_value_error.<locals>._UnknownSpec'>"
        )

    def test_typed_renderer_rejects_mismatched_type(self):
        class _Spec:
            pass

        renderer = tables_api_module._typed_renderer(_Spec, lambda spec: [str(spec)])
        with pytest.raises(TypeError) as excinfo:
            renderer(object())
        message = str(excinfo.value)
        assert "Renderer expected <class" in message
        assert "received <class 'object'>" in message

    def test_typed_renderer_passes_exact_object_to_callback(self):
        class _Spec:
            pass

        sentinel = _Spec()

        def _callback(spec: _Spec) -> list[str]:
            assert spec is sentinel
            return ["ok"]

        renderer = tables_api_module._typed_renderer(_Spec, _callback)
        assert renderer(sentinel) == ["ok"]
