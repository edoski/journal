"""Chart renderer tests for the unified chart API."""

from __future__ import annotations

import datetime

from sync.constants import DAYS
from sync.writers.charts import (
    AnchorRef,
    ColumnTrack,
    DECIMAL_ONE_LABEL,
    HAnchor,
    MONTHLY_WEEK_STUDY,
    QuarterlyStudyCoverageRowsSpec,
    TEST_CHART,
    TIME_LABEL_MIN2H,
    TIME_LABEL_STANDARD,
    TrainingBlockRowsSpec,
    TrainingSection,
    TrainingSectionsRowsSpec,
    VerticalBarProfile,
    VerticalBarSpec,
    WEEKLY_7DAY_CHART,
    WaterfallSpec,
    WeeklyStudyGridSpec,
    WeeklyTrainingGridSpec,
    MonthlyStudyGridSpec,
    MonthlyTrainingGridSpec,
    YearlyStudyCoverageRowsSpec,
    compress_activity_time_order,
    compress_days_time_order,
    render_chart,
)


def _fenced_body(lines: list[str]) -> list[str]:
    assert lines[0] == "```"
    assert lines[-1] == "```"
    return lines[1:-1]


class TestFormatters:
    def test_time_label_standard(self):
        assert TIME_LABEL_STANDARD.format(35) == "0h35m"
        assert TIME_LABEL_STANDARD.format(122) == "2h02m"

    def test_time_label_min2_hour_digits(self):
        assert TIME_LABEL_MIN2H.format(35) == "00h35m"
        assert TIME_LABEL_MIN2H.format(122) == "02h02m"
        assert TIME_LABEL_MIN2H.format(944) == "15h44m"
        assert TIME_LABEL_MIN2H.format(6360) == "106h00m"

    def test_decimal_one_label(self):
        assert DECIMAL_ONE_LABEL.format(7) == "7.0"
        assert DECIMAL_ONE_LABEL.format(7.25) == "7.2"


class TestVerticalBarRenderer:
    def test_basic_weekly_chart(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
                values=[5, 7, 3, 8, 6, 2, 4],
                value_labels=["5h", "7h", "3h", "8h", "6h", "2h", "4h"],
                profile=TEST_CHART,
            )
        )
        body = _fenced_body(lines)

        assert any("└" in line for line in body)
        assert any("─" in line for line in body)
        assert any("MON" in line for line in body)
        assert any("SUN" in line for line in body)
        assert any("█" in line for line in body)

    def test_overflow_row_for_max_value(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["A", "B"],
                values=[10, 5],
                value_labels=["10h", "5h"],
                profile=TEST_CHART,
            )
        )
        body = _fenced_body(lines)
        assert "10h" in body[0]

    def test_zero_value_label_at_bottom(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["A", "B"],
                values=[0, 5],
                value_labels=["0h", "5h"],
                profile=TEST_CHART,
            )
        )
        body = _fenced_body(lines)
        axis_idx = next(i for i, line in enumerate(body) if "└" in line)
        assert any("0h" in line for line in body[:axis_idx])

    def test_delta_labels(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["A", "B"],
                values=[5, 5],
                value_labels=["5h", "5h"],
                profile=TEST_CHART,
                delta_labels=["+10%", "-5%"],
            )
        )
        body = _fenced_body(lines)
        assert any("+10%" in line for line in body)
        assert any("-5%" in line for line in body)

    def test_axis_length_from_geometry(self):
        profile = VerticalBarProfile(
            height=10,
            y_max=10,
            track=ColumnTrack(
                column_width=12,
                bar_width=5,
                bar_left_gutter=3,
                x_label_prefix=" ",
                delta_label_prefix=" ",
                axis_trim=3,
            ),
        )
        lines = render_chart(
            VerticalBarSpec(
                labels=["A", "B", "C"],
                values=[5, 5, 5],
                value_labels=["5", "5", "5"],
                profile=profile,
            )
        )
        body = _fenced_body(lines)
        axis_line = next(line for line in body if "└" in line)
        assert axis_line.count("─") == 33

    def test_delta_column_center_anchor(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=10,
                bar_width=4,
                bar_left_gutter=3,
                x_label_prefix="",
                delta_label_prefix="",
                axis_trim=0,
            ),
            delta_anchor_ref=AnchorRef.COLUMN,
            delta_anchor_h=HAnchor.CENTER,
        )
        lines = render_chart(
            VerticalBarSpec(
                labels=["A"],
                values=[1],
                value_labels=["1h"],
                profile=profile,
                delta_labels=["D"],
            )
        )
        body = _fenced_body(lines)
        delta_row = body[-1]
        assert delta_row[4] == "D"

    def test_value_bar_anchor_vs_column_anchor(self):
        column_profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=10,
                bar_width=4,
                bar_left_gutter=3,
                x_label_prefix="",
                delta_label_prefix="",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.COLUMN,
            value_anchor_h=HAnchor.START,
        )
        bar_profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=10,
                bar_width=4,
                bar_left_gutter=3,
                x_label_prefix="",
                delta_label_prefix="",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.START,
        )

        column_lines = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["A"],
                    values=[0],
                    value_labels=["VV"],
                    profile=column_profile,
                )
            )
        )
        bar_lines = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["A"],
                    values=[0],
                    value_labels=["VV"],
                    profile=bar_profile,
                )
            )
        )

        col_pos = next(line.index("VV") for line in column_lines if "VV" in line)
        bar_pos = next(line.index("VV") for line in bar_lines if "VV" in line)
        assert bar_pos > col_pos


class TestGroupedGridRenderer:
    def test_weekly_training_structure(self, sample_week_dates, sample_daily_data):
        lines = render_chart(
            WeeklyTrainingGridSpec(
                dates=sample_week_dates,
                daily_data=sample_daily_data,
                mindful_count=2,
                workout_count=3,
                stretch_count=2,
            )
        )
        body = _fenced_body(lines)
        assert any("MINDFUL:" in line for line in body)
        assert any("WORKOUT:" in line for line in body)
        assert any("STRETCH:" in line for line in body)
        assert any("MON" in line for line in body)
        assert any("SUN" in line for line in body)

    def test_weekly_study_structure(self, sample_week_dates, sample_daily_data):
        lines = render_chart(
            WeeklyStudyGridSpec(
                dates=sample_week_dates,
                daily_data=sample_daily_data,
            )
        )
        body = _fenced_body(lines)
        assert any("FULL STUDY DAYS" in line for line in body)
        assert any("MON" in line for line in body)
        assert any("███" in line or "░░░" in line for line in body)

    def test_monthly_study_structure(self):
        week_ranges = [
            (datetime.date(2025, 12, 1), datetime.date(2025, 12, 7)),
            (datetime.date(2025, 12, 8), datetime.date(2025, 12, 14)),
        ]
        daily_data = {
            datetime.date(2025, 12, 1): {"study_minutes": 400},
            datetime.date(2025, 12, 2): {"study_minutes": 100},
        }

        lines = render_chart(
            MonthlyStudyGridSpec(
                week_ranges=week_ranges,
                daily_data=daily_data,
            )
        )
        body = _fenced_body(lines)
        assert any("FULL STUDY DAYS" in line for line in body)
        assert any("DEC" in line for line in body)

    def test_monthly_training_structure(self):
        week_ranges = [
            (datetime.date(2025, 12, 1), datetime.date(2025, 12, 7)),
            (datetime.date(2025, 12, 8), datetime.date(2025, 12, 14)),
        ]
        daily_data = {
            datetime.date(2025, 12, 1): {"workout": True, "stretch": False},
            datetime.date(2025, 12, 2): {"workout": False, "stretch": True},
        }

        lines = render_chart(
            MonthlyTrainingGridSpec(
                week_ranges=week_ranges,
                daily_data=daily_data,
                mindful_count=1,
                workout_count=1,
                stretch_count=1,
                days_in_period=14,
            )
        )
        body = _fenced_body(lines)
        assert any("MINDFUL" in line for line in body)
        assert any("WORKOUT" in line for line in body)
        assert any("STRETCH" in line for line in body)
        assert any("DEC" in line for line in body)


class TestProgressRowsRenderer:
    def test_training_block_rows(self):
        lines = render_chart(
            TrainingBlockRowsSpec(
                labels=["Q1", "Q2"],
                counts=[(10, 90), (15, 91)],
                delta_labels=["+10%", "+50%"],
                bar_width=10,
            )
        )
        body = _fenced_body(lines)
        assert any("Q1" in line for line in body)
        assert any("Q2" in line for line in body)
        assert any("+10%" in line for line in body)
        assert any("+50%" in line for line in body)

    def test_training_sections_fenced(self):
        sections = [
            TrainingSection(
                title="MINDFUL",
                total_done=10,
                total_elapsed=20,
                labels=["Q1", "Q2"],
                counts=[(5, 10), (5, 10)],
            ),
            TrainingSection(
                title="WORKOUT",
                total_done=12,
                total_elapsed=20,
                labels=["Q1", "Q2"],
                counts=[(6, 10), (6, 10)],
            ),
        ]
        lines = render_chart(TrainingSectionsRowsSpec(sections=sections))
        body = _fenced_body(lines)
        assert any("┌ MINDFUL (10/20)" in line for line in body)
        assert any("┌ WORKOUT (12/20)" in line for line in body)

    def test_quarterly_study_coverage(self):
        month_ranges = [
            (datetime.date(2025, 10, 1), datetime.date(2025, 10, 31)),
            (datetime.date(2025, 11, 1), datetime.date(2025, 11, 30)),
            (datetime.date(2025, 12, 1), datetime.date(2025, 12, 31)),
        ]
        lines = render_chart(
            QuarterlyStudyCoverageRowsSpec(
                month_ranges=month_ranges,
                daily_data={},
                today=datetime.date(2025, 12, 26),
            )
        )
        body = _fenced_body(lines)
        assert any("FULL STUDY DAYS" in line for line in body)
        assert any("OCT" in line for line in body)
        assert any("NOV" in line for line in body)
        assert any("DEC" in line for line in body)

    def test_yearly_study_coverage_with_deltas(self):
        quarter_ranges = [
            (datetime.date(2025, 1, 1), datetime.date(2025, 3, 31)),
            (datetime.date(2025, 4, 1), datetime.date(2025, 6, 30)),
            (datetime.date(2025, 7, 1), datetime.date(2025, 9, 30)),
            (datetime.date(2025, 10, 1), datetime.date(2025, 12, 31)),
        ]
        lines = render_chart(
            YearlyStudyCoverageRowsSpec(
                quarter_ranges=quarter_ranges,
                daily_data={},
                today=datetime.date(2025, 12, 26),
                delta_labels=["+1%", "+2%", "-3%", "+4%"],
            )
        )
        body = _fenced_body(lines)
        assert any("FULL STUDY DAYS" in line for line in body)
        assert any("Q1" in line for line in body)
        assert any("Q4" in line for line in body)
        assert any("+4%" in line for line in body)


class TestWaterfallRenderer:
    def test_waterfall_chart(self):
        lines = render_chart(
            WaterfallSpec(
                app_totals={
                    "YouTube": 180,
                    "Reddit": 60,
                    "X": 30,
                }
            )
        )
        body = _fenced_body(lines)
        assert body[0] == "┌"
        assert any("TOTAL" in line for line in body)
        assert any("YouTube" in line for line in body)


class TestCompressionHelpers:
    def test_compress_days_time_order(self):
        days = [datetime.date(2025, 1, 1) + datetime.timedelta(i) for i in range(10)]
        result = compress_days_time_order(
            days,
            lambda _: True,
            5,
            today=datetime.date(2025, 1, 15),
        )
        assert len(result) == 5
        assert result.count("█") == 5

    def test_compress_activity_time_order(self):
        days = [datetime.date(2025, 1, 1) + datetime.timedelta(i) for i in range(7)]
        result = compress_activity_time_order(
            days,
            lambda d: d.day % 2 == 1,
            7,
            today=datetime.date(2025, 1, 10),
        )
        assert len(result) == 7
        assert "■" in result
        assert "·" in result


class TestBarChartSnapshots:
    def test_weekly_study_chart_snapshot(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=list(DAYS),
                values=[6, 7, 0, 10, 5, 0, 4],
                value_labels=["6h", "7h", "0h", "10h", "5h", "0h", "4h"],
                profile=WEEKLY_7DAY_CHART,
            )
        )
        body = _fenced_body(lines)

        assert "10h" in body[0]
        axis_idx = next(i for i, line in enumerate(body) if "└" in line)
        label_line = body[axis_idx + 1]
        assert "MON" in label_line
        assert "SUN" in label_line
        bar_rows = [row for row in body[:axis_idx] if "│" in row]
        assert len(bar_rows) == 10

    def test_monthly_study_delta_alignment_snapshot(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["FEB 01-07", "FEB 08-14", "FEB 15-21", "FEB 22-28"],
                values=[2.0, 15.5, 4.5, 0.5],
                value_labels=["02h00m", "15h30m", "04h30m", "00h30m"],
                profile=MONTHLY_WEEK_STUDY,
                delta_labels=["-17%", "+11%", "-69%", "-59%"],
            )
        )
        body = _fenced_body(lines)
        assert any("-17%" in line for line in body)
