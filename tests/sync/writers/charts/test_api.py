"""Chart renderer tests for the unified chart API."""

from __future__ import annotations

import datetime

import pytest

from sync.constants import DAYS, RENDER, STUDY_TARGET_MIN
from sync.periods.presentation import (
    monthly_study_grid_spec,
    monthly_training_grid_spec,
    quarterly_study_coverage_spec,
    weekly_study_grid_spec,
    weekly_training_grid_spec,
    yearly_study_coverage_spec,
)
import sync.writers.charts.api as charts_api_module
from sync.writers.charts import (
    AnchorRef,
    ColumnTrack,
    DECIMAL_ONE_LABEL,
    HAnchor,
    MONTHLY_WEEK_METRIC,
    MONTHLY_WEEK_MOOD,
    MONTHLY_WEEK_STUDY,
    QUARTERLY_3MONTH_METRIC,
    QUARTERLY_3MONTH_MOOD,
    QUARTERLY_3MONTH_STUDY,
    TEST_CHART,
    TIME_LABEL_MIN2H,
    TIME_LABEL_STANDARD,
    TrainingBlockRowsSpec,
    TrainingSection,
    TrainingSectionsRowsSpec,
    VerticalBarProfile,
    VerticalBarSpec,
    WEEKLY_7DAY_CHART,
    WEEKLY_7DAY_MOOD,
    WaterfallSpec,
    YEARLY_4QTR_METRIC,
    YEARLY_4QTR_MOOD,
    YEARLY_4QTR_STUDY,
    compress_activity_time_order,
    compress_days_time_order,
    render_chart,
)
from sync.writers.charts.renderers import vertical as vertical_module
from sync.writers.charts.specs import WaterfallProfile


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
        assert body[0].startswith("│")
        assert "10h" in body[0]

    def test_overflow_row_for_half_block_at_chart_ceiling(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["MON", "TUE"],
                values=[9.6, 5],
                value_labels=["9h36m", "5h00m"],
                profile=WEEKLY_7DAY_CHART,
            )
        )
        body = _fenced_body(lines)

        assert body[0].startswith("│")
        assert "9h36m" in body[0]
        assert "▄▄▄▄▄" in body[1]

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

    def test_vertical_bar_exact_render_snapshot(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["A", "B", "C"],
                values=[2, 5, 1],
                value_labels=["2h", "5h", "1h"],
                delta_labels=["+1%", "+2%", "-3%"],
                profile=TEST_CHART,
            )
        )
        assert _fenced_body(lines) == [
            "│",
            "│",
            "│",
            "│",
            "│                 5h",
            "│               █████",
            "│               █████",
            "│     2h        █████",
            "│   █████       █████         1h",
            "│   █████       █████       █████",
            "└─────────────────────────────────",
            " A           B           C",
            "+1%         +2%         -3%",
        ]

    def test_backticks_are_stripped_from_value_labels(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["A"],
                values=[1],
                value_labels=["`1h`"],
                profile=TEST_CHART,
            )
        )
        body = _fenced_body(lines)
        rendered = "\n".join(body)
        assert "`" not in rendered
        assert "1h" in rendered

    def test_delta_row_is_rendered_when_deltas_provided(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["A", "B"],
                values=[1, 2],
                value_labels=["1h", "2h"],
                profile=TEST_CHART,
                delta_labels=["+10%", "-5%"],
            )
        )
        body = _fenced_body(lines)
        assert "+10%" in body[-1]
        assert "-5%" in body[-1]

    def test_backtick_strip_keeps_non_backtick_edge_chars(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["A"],
                values=[1],
                value_labels=["`X1hX`"],
                profile=TEST_CHART,
            )
        )
        rendered = "\n".join(_fenced_body(lines))
        assert "X1hX" in rendered

    def test_falsy_value_label_does_not_render_placeholder_text(self):
        lines = render_chart(
            VerticalBarSpec(
                labels=["A"],
                values=[1],
                value_labels=[""],
                profile=TEST_CHART,
            )
        )
        rendered = "\n".join(_fenced_body(lines))
        assert "XXXX" not in rendered

    def test_tiny_positive_value_does_not_force_full_block(self):
        profile = VerticalBarProfile(
            height=5,
            y_max=5,
            track=ColumnTrack(
                column_width=8,
                bar_width=2,
                bar_left_gutter=3,
                x_label_prefix=" ",
                delta_label_prefix=" ",
                axis_trim=0,
            ),
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["A"],
                    values=[0.2],
                    value_labels=["tiny"],
                    profile=profile,
                )
            )
        )
        axis_idx = next(i for i, line in enumerate(body) if line.startswith("└"))
        bar_area = body[:axis_idx]
        assert all("█" not in line and "▄" not in line for line in bar_area)

    def test_ymax_zero_uses_unit_scale_fallback(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=0,
            track=ColumnTrack(
                column_width=8,
                bar_width=2,
                bar_left_gutter=3,
                x_label_prefix=" ",
                delta_label_prefix=" ",
                axis_trim=0,
            ),
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["A"],
                    values=[1],
                    value_labels=["1h"],
                    profile=profile,
                )
            )
        )
        axis_idx = next(i for i, line in enumerate(body) if line.startswith("└"))
        bar_area = body[:axis_idx]
        filled_rows = sum(1 for line in bar_area if "█" in line)
        assert filled_rows == 1

    def test_overflow_row_uses_chart_rail_and_renders_later_labels(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=10,
                bar_width=4,
                bar_left_gutter=3,
                x_label_prefix="  ",
                delta_label_prefix="  ",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.CENTER,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["ABCDE", "ABCDE"],
                    values=[3, 3],
                    value_labels=["", "AB"],
                    profile=profile,
                )
            )
        )
        overflow = body[0]
        assert overflow.startswith("│")
        assert "AB" in overflow

    def test_label_center_adjustment_applies_for_five_char_labels(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="",
                delta_label_prefix="",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.LABEL,
            value_anchor_h=HAnchor.CENTER,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["ABCDE"],
                    values=[3],
                    value_labels=["VV"],
                    profile=profile,
                )
            )
        )
        overflow = body[0]
        assert overflow[2:4] == "VV"

    def test_ymax_one_scales_single_unit_to_full_height(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=1,
            track=ColumnTrack(
                column_width=6,
                bar_width=2,
                bar_left_gutter=2,
                x_label_prefix=" ",
                delta_label_prefix=" ",
                axis_trim=0,
            ),
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["A"],
                    values=[1],
                    value_labels=["1"],
                    profile=profile,
                )
            )
        )
        axis_idx = next(i for i, line in enumerate(body) if line.startswith("└"))
        bar_area = body[:axis_idx]
        assert sum(1 for line in bar_area if "██" in line) == 3

    def test_height_one_still_renders_overflow_label_for_max_value(self):
        profile = VerticalBarProfile(
            height=1,
            y_max=1,
            track=ColumnTrack(
                column_width=6,
                bar_width=2,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["A"],
                    values=[1],
                    value_labels=["MAX"],
                    profile=profile,
                )
            )
        )
        assert body[0].startswith("│")
        assert "MAX" in body[0]

    def test_height_zero_does_not_render_overflow_labels(self):
        profile = VerticalBarProfile(
            height=0,
            y_max=1,
            track=ColumnTrack(
                column_width=6,
                bar_width=2,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["A"],
                    values=[0],
                    value_labels=["ZERO"],
                    profile=profile,
                )
            )
        )
        assert all("ZERO" not in line for line in body)

    def test_overflow_bar_start_anchor_and_prefix_are_exact(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.START,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["LBL"],
                    values=[3],
                    value_labels=["ABC"],
                    profile=profile,
                    delta_labels=["+1"],
                )
            )
        )
        assert body == [
            "│  ABC",
            "│  ████",
            "│  ████",
            "│  ████",
            "└────────",
            "XLBL",
            "D +1",
        ]

    def test_bar_center_even_width_shifts_even_text_left_by_one(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.CENTER,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["AB"],
                    values=[3],
                    value_labels=["AB"],
                    profile=profile,
                )
            )
        )
        overflow = body[0]
        assert overflow.index("AB") == 4

    def test_zero_value_label_with_label_anchor_uses_label_track_start(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.LABEL,
            value_anchor_h=HAnchor.START,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["ABCDE"],
                    values=[0],
                    value_labels=["Z"],
                    profile=profile,
                    delta_labels=["+1"],
                )
            )
        )
        zero_label_row = next(line for line in body if "Z" in line)
        assert zero_label_row.index("Z") == 1

    def test_nonempty_x_label_after_empty_label_is_rendered(self):
        profile = VerticalBarProfile(
            height=2,
            y_max=2,
            track=ColumnTrack(
                column_width=6,
                bar_width=2,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["", "B"],
                    values=[1, 1],
                    value_labels=["1", "1"],
                    profile=profile,
                )
            )
        )
        x_row = body[-1]
        assert x_row.startswith("X")
        assert "B" in x_row

    def test_nonempty_delta_after_empty_delta_is_rendered(self):
        profile = VerticalBarProfile(
            height=2,
            y_max=2,
            track=ColumnTrack(
                column_width=6,
                bar_width=2,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            delta_anchor_ref=AnchorRef.COLUMN,
            delta_anchor_h=HAnchor.CENTER,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["", "B"],
                    values=[1, 1],
                    value_labels=["1", "1"],
                    profile=profile,
                    delta_labels=["", "+2"],
                )
            )
        )
        x_row = body[-2]
        delta_row = body[-1]
        assert x_row.startswith("X")
        assert "B" in x_row
        assert delta_row.startswith("D")
        assert "+2" in delta_row

    def test_overflow_long_label_with_end_anchor_keeps_left_clamp(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.END,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["AA"],
                    values=[3],
                    value_labels=["ABCDEFG"],
                    profile=profile,
                )
            )
        )
        assert body[0] == "│ABCDEFG"

    def test_overflow_long_label_with_start_anchor_keeps_right_clamp(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.START,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["AA"],
                    values=[3],
                    value_labels=["ABCDEFG"],
                    profile=profile,
                )
            )
        )
        assert body[0] == "│ ABCDEFG"

    def test_zero_bar_bar_center_even_label_uses_center_adjustment(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.CENTER,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["AA"],
                    values=[0],
                    value_labels=["AB"],
                    profile=profile,
                )
            )
        )
        row = next(line for line in body if "AB" in line)
        assert row.index("AB") == 4

    def test_zero_bar_label_center_even_label_uses_long_label_adjustment(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.LABEL,
            value_anchor_h=HAnchor.CENTER,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["ABCDE"],
                    values=[0],
                    value_labels=["AB"],
                    profile=profile,
                )
            )
        )
        row = next(line for line in body if "AB" in line)
        assert row.index("AB") == 2

    def test_nonmax_label_row_with_label_anchor_start_uses_label_track(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.LABEL,
            value_anchor_h=HAnchor.START,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["ABCDE"],
                    values=[1],
                    value_labels=["AB"],
                    profile=profile,
                )
            )
        )
        row = next(line for line in body if "AB" in line)
        assert row.index("AB") == 1

    def test_nonmax_bar_start_anchor_keeps_right_clamp_for_long_text(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.START,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["AA"],
                    values=[1],
                    value_labels=["ABCDEFG"],
                    profile=profile,
                )
            )
        )
        row = next(line for line in body if "ABCDEFG" in line)
        assert row == "│ ABCDEFG"

    def test_nonmax_bar_end_anchor_keeps_left_clamp_for_long_text(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.END,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["AA"],
                    values=[1],
                    value_labels=["ABCDEFG"],
                    profile=profile,
                )
            )
        )
        row = next(line for line in body if "ABCDEFG" in line)
        assert row == "│ABCDEFG"

    def test_nonmax_bar_center_even_label_uses_center_adjustment(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.CENTER,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["AA"],
                    values=[1],
                    value_labels=["AB"],
                    profile=profile,
                )
            )
        )
        row = next(line for line in body if "AB" in line)
        assert row.index("AB") == 4

    def test_nonmax_label_center_even_label_uses_long_label_adjustment(self):
        profile = VerticalBarProfile(
            height=3,
            y_max=3,
            track=ColumnTrack(
                column_width=8,
                bar_width=4,
                bar_left_gutter=2,
                x_label_prefix="X",
                delta_label_prefix="D",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.LABEL,
            value_anchor_h=HAnchor.CENTER,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["ABCDE"],
                    values=[1],
                    value_labels=["AB"],
                    profile=profile,
                )
            )
        )
        row = next(line for line in body if "AB" in line)
        assert row.index("AB") == 2

    def test_overlapping_top_labels_pack_into_multiple_rows(self):
        profile = VerticalBarProfile(
            height=2,
            y_max=2,
            track=ColumnTrack(
                column_width=6,
                bar_width=2,
                bar_left_gutter=2,
                x_label_prefix="",
                delta_label_prefix="",
                axis_trim=0,
            ),
            value_anchor_ref=AnchorRef.BAR,
            value_anchor_h=HAnchor.START,
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["A", "B"],
                    values=[2, 2],
                    value_labels=["ABCDEFG", "HIJKLMN"],
                    profile=profile,
                )
            )
        )
        assert body == [
            "│ABCDEFG",
            "│     HIJKLM",
            "│  ██    ██",
            "│  ██    ██",
            "└────────────",
            "A     B",
        ]

    def test_vertical_bar_rejects_mismatched_value_label_lengths(self):
        with pytest.raises(ValueError) as excinfo:
            render_chart(
                VerticalBarSpec(
                    labels=["A", "B"],
                    values=[1, 2],
                    value_labels=["1h"],
                    profile=TEST_CHART,
                )
            )
        assert (
            str(excinfo.value)
            == "labels, values, and value_labels must have the same length"
        )

    def test_vertical_bar_rejects_mismatched_delta_lengths(self):
        with pytest.raises(ValueError) as excinfo:
            render_chart(
                VerticalBarSpec(
                    labels=["A", "B"],
                    values=[1, 2],
                    value_labels=["1h", "2h"],
                    profile=TEST_CHART,
                    delta_labels=["+1%"],
                )
            )
        assert str(excinfo.value) == "delta_labels must have the same length as labels"


class TestGroupedGridRenderer:
    def test_weekly_training_structure(self, sample_week_dates, sample_daily_data):
        lines = render_chart(
            weekly_training_grid_spec(
                sample_week_dates,
                sample_daily_data,
                meditation_count=2,
                workout_count=3,
                stretch_count=2,
                current_date=None,
            )
        )
        body = _fenced_body(lines)
        assert any("MEDITATION  " in line for line in body)
        assert any("WORKOUT     " in line for line in body)
        assert any("STRETCH     " in line for line in body)
        assert any("MON" in line for line in body)
        assert any("SUN" in line for line in body)

    def test_weekly_study_structure(self, sample_week_dates, sample_daily_data):
        lines = render_chart(
            weekly_study_grid_spec(
                sample_week_dates,
                sample_daily_data,
                today=sample_week_dates[-1],
                current_date=None,
            )
        )
        body = _fenced_body(lines)
        assert any("FULL STUDY DAYS" in line for line in body)
        assert any("MON" in line for line in body)
        assert any("███" in line or "░░░" in line for line in body)

    def test_weekly_study_today_override_current_day_counts(self):
        today = datetime.date(2025, 2, 17)
        lines = render_chart(
            weekly_study_grid_spec(
                [today],
                {today: {"study_minutes": STUDY_TARGET_MIN}},
                current_date=today,
                today=today,
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS",
            "│  ↓",
            "│ ███   (1/1)",
            "│ ─── ─── ─── ─── ─── ─── ───",
            "└ MON TUE WED THU FRI SAT SUN",
            "",
            "1 POMODORO = 90m | ███ ≥ 4 POM. | ░░░ < 4 POM.",
        ]

    def test_weekly_study_today_override_future_day_stays_empty(self):
        today = datetime.date(2025, 2, 17)
        future = today + datetime.timedelta(days=1)
        lines = render_chart(
            weekly_study_grid_spec(
                [future],
                {future: {"study_minutes": STUDY_TARGET_MIN}},
                today=today,
                current_date=None,
            )
        )
        body = _fenced_body(lines)
        assert body[2] == "│ ░░░   (0/1)"

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
            monthly_study_grid_spec(
                week_ranges,
                daily_data,
                today=datetime.date(2025, 12, 31),
                current_date=None,
            )
        )
        body = _fenced_body(lines)
        assert any("FULL STUDY DAYS" in line for line in body)
        assert any("DEC" in line for line in body)

    def test_monthly_study_today_override_future_days(self):
        today = datetime.date(2025, 2, 17)
        lines = render_chart(
            monthly_study_grid_spec(
                [(today, today + datetime.timedelta(days=1))],
                {today: {"study_minutes": STUDY_TARGET_MIN}},
                current_date=today,
                today=today,
                delta_labels=["+1%"],
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS (01/01)",
            "│ ↓",
            "│ █ ·",
            "│ ───",
            "│ FEB 17-18",
            "└ +1%",
            "",
            "1 POMODORO = 90m | █ ≥ 4 POM. | · < 4 POM.",
        ]

    def test_monthly_study_empty_ranges_snapshot(self):
        lines = render_chart(
            monthly_study_grid_spec(
                [],
                {},
                today=datetime.date(2025, 1, 1),
                current_date=None,
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS (00/00)",
            "│",
            "│",
            "│",
            "│",
            "└",
            "",
            "1 POMODORO = 90m | █ ≥ 4 POM. | · < 4 POM.",
        ]

    def test_monthly_study_future_only_snapshot_without_deltas(self):
        lines = render_chart(
            monthly_study_grid_spec(
                [
                    (datetime.date(2025, 1, 2), datetime.date(2025, 1, 3)),
                ],
                {},
                today=datetime.date(2025, 1, 1),
                current_date=None,
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS (00/00)",
            "│",
            "│ · ·",
            "│ ───",
            "│ JAN 02-03",
            "└",
            "",
            "1 POMODORO = 90m | █ ≥ 4 POM. | · < 4 POM.",
        ]

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
            monthly_training_grid_spec(
                week_ranges,
                daily_data,
                current_date=None,
            )
        )
        body = _fenced_body(lines)
        assert any("MEDITATION" in line for line in body)
        assert any("WORKOUT" in line for line in body)
        assert any("STRETCH" in line for line in body)
        assert any("DEC" in line for line in body)

    def test_monthly_training_arrow_on_first_day(self):
        start = datetime.date(2025, 12, 1)
        lines = render_chart(
            monthly_training_grid_spec(
                [(start, start + datetime.timedelta(days=1))],
                {},
                current_date=start,
            )
        )
        body = _fenced_body(lines)
        assert body[0] == "┌ MEDITATION"
        assert body[1] == "│ ↓"

    def test_monthly_training_empty_ranges_snapshot(self):
        lines = render_chart(
            monthly_training_grid_spec(
                [],
                {},
                current_date=None,
            )
        )
        assert _fenced_body(lines) == [
            "┌ MEDITATION",
            "│",
            "│",
            "│",
            "│",
            "",
            "┌ WORKOUT",
            "│",
            "│",
            "│",
            "│",
            "",
            "┌ STRETCH",
            "│",
            "│",
            "│",
            "│",
        ]

    def test_weekly_training_arrow_on_first_day(self):
        start = datetime.date(2025, 12, 1)
        lines = render_chart(
            weekly_training_grid_spec(
                [start + datetime.timedelta(days=i) for i in range(7)],
                {},
                meditation_count=0,
                workout_count=0,
                stretch_count=0,
                current_date=start,
            )
        )
        body = _fenced_body(lines)
        assert body[0] == "┌              ↓"

    def test_weekly_training_out_of_range_current_date_has_plain_header(self):
        start = datetime.date(2025, 12, 1)
        lines = render_chart(
            weekly_training_grid_spec(
                [start + datetime.timedelta(days=i) for i in range(7)],
                {},
                meditation_count=0,
                workout_count=0,
                stretch_count=0,
                current_date=start - datetime.timedelta(days=1),
            )
        )
        body = _fenced_body(lines)
        assert body[0] == "┌"

    def test_weekly_training_exact_render_snapshot(
        self, sample_week_dates, sample_daily_data
    ):
        lines = render_chart(
            weekly_training_grid_spec(
                sample_week_dates,
                sample_daily_data,
                meditation_count=2,
                workout_count=4,
                stretch_count=4,
                current_date=datetime.date(2025, 12, 28),
            )
        )
        assert _fenced_body(lines) == [
            "┌                                      ↓",
            "│ MEDITATION  ░░░ ░░░ ░░░ ░░░ ░░░ ░░░ ░░░   (2/7)",
            "│ WORKOUT     ░░░ ███ ░░░ ███ ███ ░░░ ░░░   (4/7)",
            "│ STRETCH     ░░░ ███ ███ ░░░ ███ ░░░ ░░░   (4/7)",
            "│              ─── ─── ─── ─── ─── ─── ───",
            "└              MON TUE WED THU FRI SAT SUN",
        ]

    def test_weekly_study_exact_render_snapshot(
        self, sample_week_dates, sample_daily_data
    ):
        lines = render_chart(
            weekly_study_grid_spec(
                sample_week_dates,
                sample_daily_data,
                today=sample_week_dates[-1],
                current_date=datetime.date(2025, 12, 28),
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS",
            "│                          ↓",
            "│ ░░░ ███ ░░░ ░░░ ███ ░░░ ░░░   (2/7)",
            "│ ─── ─── ─── ─── ─── ─── ───",
            "└ MON TUE WED THU FRI SAT SUN",
            "",
            "1 POMODORO = 90m | ███ ≥ 4 POM. | ░░░ < 4 POM.",
        ]

    def test_monthly_study_exact_render_snapshot(self):
        lines = render_chart(
            monthly_study_grid_spec(
                [
                    (datetime.date(2025, 12, 1), datetime.date(2025, 12, 7)),
                    (datetime.date(2025, 12, 8), datetime.date(2025, 12, 14)),
                ],
                {
                    datetime.date(2025, 12, 1): {"study_minutes": 400},
                    datetime.date(2025, 12, 2): {"study_minutes": 100},
                },
                today=datetime.date(2025, 12, 14),
                current_date=datetime.date(2025, 12, 14),
                delta_labels=["+10%", "-20%"],
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS (01/14)",
            "│                             ↓",
            "│ █ · · · · · ·   · · · · · · ·",
            "│ ─────────────   ─────────────",
            "│   DEC 01-07       DEC 08-14",
            "└     +10%            -20%",
            "",
            "1 POMODORO = 90m | █ ≥ 4 POM. | · < 4 POM.",
        ]

    def test_monthly_training_exact_render_snapshot(self):
        lines = render_chart(
            monthly_training_grid_spec(
                [
                    (datetime.date(2025, 12, 1), datetime.date(2025, 12, 7)),
                    (datetime.date(2025, 12, 8), datetime.date(2025, 12, 14)),
                ],
                {
                    datetime.date(2025, 12, 1): {"workout": True, "stretch": False},
                    datetime.date(2025, 12, 2): {"workout": False, "stretch": True},
                },
                current_date=datetime.date(2025, 12, 14),
                meditation_delta_labels=["+5%", "-5%"],
                workout_delta_labels=["+7%", "-7%"],
                stretch_delta_labels=["+9%", "-9%"],
            )
        )
        assert _fenced_body(lines) == [
            "┌ MEDITATION",
            "│                             ↓",
            "│ · · · · · · ·   · · · · · · ·",
            "│ ─────────────   ─────────────",
            "│   DEC 01-07       DEC 08-14",
            "└      +5%             -5%",
            "",
            "┌ WORKOUT",
            "│                             ↓",
            "│ ■ · · · · · ·   · · · · · · ·",
            "│ ─────────────   ─────────────",
            "│   DEC 01-07       DEC 08-14",
            "└      +7%             -7%",
            "",
            "┌ STRETCH",
            "│                             ↓",
            "│ · ■ · · · · ·   · · · · · · ·",
            "│ ─────────────   ─────────────",
            "│   DEC 01-07       DEC 08-14",
            "└      +9%             -9%",
        ]


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

    def test_training_block_rows_zero_elapsed_clamps_to_empty_bar(self):
        lines = render_chart(
            TrainingBlockRowsSpec(
                labels=["Q1"],
                counts=[(99, 0)],
                delta_labels=[],
                bar_width=5,
            )
        )
        assert _fenced_body(lines) == ["│ Q1 ····· (00/00)"]

    def test_training_block_rows_bars_override_is_used_verbatim(self):
        lines = render_chart(
            TrainingBlockRowsSpec(
                labels=["Q1"],
                counts=[(2, 4)],
                delta_labels=["+1%"],
                bar_width=5,
                bars_override=["XYZ"],
            )
        )
        assert _fenced_body(lines) == ["│ Q1 XYZ (02/04)    +1%"]

    def test_training_sections_fenced(self):
        sections = [
            TrainingSection(
                title="MEDITATION",
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
        assert any("┌ MEDITATION (10/20)" in line for line in body)
        assert any("┌ WORKOUT (12/20)" in line for line in body)

    def test_quarterly_study_coverage(self):
        month_ranges = [
            (datetime.date(2025, 10, 1), datetime.date(2025, 10, 31)),
            (datetime.date(2025, 11, 1), datetime.date(2025, 11, 30)),
            (datetime.date(2025, 12, 1), datetime.date(2025, 12, 31)),
        ]
        lines = render_chart(
            quarterly_study_coverage_spec(
                month_ranges,
                {},
                today=datetime.date(2025, 12, 26),
            )
        )
        body = _fenced_body(lines)
        assert any("FULL STUDY DAYS" in line for line in body)
        assert any("OCT" in line for line in body)
        assert any("NOV" in line for line in body)
        assert any("DEC" in line for line in body)

    def test_quarterly_study_coverage_snapshot_with_future_days(self):
        lines = render_chart(
            quarterly_study_coverage_spec(
                [
                    (datetime.date(2025, 10, 1), datetime.date(2025, 10, 3)),
                    (datetime.date(2025, 11, 1), datetime.date(2025, 11, 3)),
                    (datetime.date(2025, 12, 1), datetime.date(2025, 12, 3)),
                ],
                {
                    datetime.date(2025, 10, 1): {"study_minutes": 360},
                    datetime.date(2025, 10, 3): {"study_minutes": 360},
                    datetime.date(2025, 11, 2): {"study_minutes": 360},
                    datetime.date(2025, 12, 1): {"study_minutes": 360},
                },
                today=datetime.date(2025, 11, 2),
                delta_labels=["+1%", "-2%", "+3%"],
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS (03/05)",
            "│",
            "│ OCT █·█ (02/03)    +1%",
            "│ NOV ·█· (01/02)    -2%",
            "│ DEC ··· (00/00)    +3%",
            "└",
            "",
            "1 POMODORO = 90m | █ ≥ 4 POM. | · < 4 POM.",
        ]

    def test_yearly_study_coverage_with_deltas(self):
        quarter_ranges = [
            (datetime.date(2025, 1, 1), datetime.date(2025, 3, 31)),
            (datetime.date(2025, 4, 1), datetime.date(2025, 6, 30)),
            (datetime.date(2025, 7, 1), datetime.date(2025, 9, 30)),
            (datetime.date(2025, 10, 1), datetime.date(2025, 12, 31)),
        ]
        lines = render_chart(
            yearly_study_coverage_spec(
                quarter_ranges,
                {},
                today=datetime.date(2025, 12, 26),
                bar_width=30,
                delta_labels=["+1%", "+2%", "-3%", "+4%"],
            )
        )
        body = _fenced_body(lines)
        assert any("FULL STUDY DAYS" in line for line in body)
        assert any("Q1" in line for line in body)
        assert any("Q4" in line for line in body)
        assert any("+4%" in line for line in body)

    def test_training_block_rows_exact_snapshot(self):
        lines = render_chart(
            TrainingBlockRowsSpec(
                labels=["Q1", "Q2"],
                counts=[(10, 20), (4, 20)],
                delta_labels=["+25%", "-60%"],
                bar_width=10,
            )
        )
        assert _fenced_body(lines) == [
            "│ Q1 ■■■■■····· (10/20)   +25%",
            "│ Q2 ■■········ (04/20)   -60%",
        ]

    def test_training_sections_exact_snapshot(self):
        sections = [
            TrainingSection(
                title="MEDITATION",
                total_done=6,
                total_elapsed=14,
                labels=["W1", "W2"],
                counts=[(4, 7), (2, 7)],
            ),
            TrainingSection(
                title="WORKOUT",
                total_done=4,
                total_elapsed=14,
                labels=["W1", "W2"],
                counts=[(3, 7), (1, 7)],
            ),
        ]
        lines = render_chart(TrainingSectionsRowsSpec(sections=sections))
        assert _fenced_body(lines) == [
            "┌ MEDITATION (06/14)",
            "│",
            "│ W1 ■■■■■■■■■■■■■■■■■············· (04/07)",
            "│ W2 ■■■■■■■■■····················· (02/07)",
            "└",
            "",
            "┌ WORKOUT (04/14)",
            "│",
            "│ W1 ■■■■■■■■■■■■■················· (03/07)",
            "│ W2 ■■■■·························· (01/07)",
            "└",
        ]

    def test_yearly_study_coverage_exact_snapshot(self):
        quarter_ranges = [
            (datetime.date(2025, 1, 1), datetime.date(2025, 3, 31)),
            (datetime.date(2025, 4, 1), datetime.date(2025, 6, 30)),
            (datetime.date(2025, 7, 1), datetime.date(2025, 9, 30)),
            (datetime.date(2025, 10, 1), datetime.date(2025, 12, 31)),
        ]
        lines = render_chart(
            yearly_study_coverage_spec(
                quarter_ranges,
                {},
                today=datetime.date(2025, 12, 26),
                bars_override=["█████░░░░░", "███░░░░░░░", "██░░░░░░░░", "█░░░░░░░░░"],
                delta_labels=["+1%", "+2%", "-3%", "+4%"],
                bar_width=10,
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS (00/360)",
            "│",
            "│ Q1 █████░░░░░ (00/90)    +1%",
            "│ Q2 ███░░░░░░░ (00/91)    +2%",
            "│ Q3 ██░░░░░░░░ (00/92)    -3%",
            "│ Q4 █░░░░░░░░░ (00/87)    +4%",
            "└",
            "",
            "1 POMODORO = 90m | █ ≥ 4 POM. | · < 4 POM.",
        ]

    def test_yearly_study_coverage_without_override_exact_snapshot(self):
        lines = render_chart(
            yearly_study_coverage_spec(
                [
                    (datetime.date(2025, 1, 1), datetime.date(2025, 1, 3)),
                    (datetime.date(2025, 4, 1), datetime.date(2025, 4, 3)),
                    (datetime.date(2025, 7, 1), datetime.date(2025, 7, 3)),
                    (datetime.date(2025, 10, 1), datetime.date(2025, 10, 3)),
                ],
                {
                    datetime.date(2025, 1, 1): {"study_minutes": 360},
                    datetime.date(2025, 1, 2): {"study_minutes": 120},
                    datetime.date(2025, 1, 3): {"study_minutes": 360},
                    datetime.date(2025, 4, 2): {"study_minutes": 360},
                    datetime.date(2025, 7, 1): {"study_minutes": 360},
                },
                today=datetime.date(2025, 7, 2),
                bar_width=4,
                delta_labels=["+1%", "-2%", "+3%", "-4%"],
                legend_line="LEGEND",
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS (04/08)",
            "│",
            "│ Q1 █·█· (02/03)    +1%",
            "│ Q2 ·█·· (01/03)    -2%",
            "│ Q3 █··· (01/02)    +3%",
            "│ Q4 ···· (00/00)    -4%",
            "└",
            "",
            "LEGEND",
        ]


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

    def test_waterfall_exact_snapshot(self):
        lines = render_chart(
            WaterfallSpec(
                app_totals={
                    "YouTube": 180,
                    "Reddit": 60,
                    "X": 30,
                }
            )
        )
        assert _fenced_body(lines) == [
            "┌",
            "│ YouTube ███████████████████████████               3h00m (67%)",
            "│ Reddit                             █████████      1h00m (22%)",
            "│ X                                           ████    30m (11%)",
            "│         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "└ TOTAL   ████████████████████████████████████████  4h30m",
        ]

    def test_waterfall_normalizes_hidden_label_marks(self):
        lines = render_chart(
            WaterfallSpec(
                app_totals={
                    "Miscellaneous": 10,
                    "\u200eWhatsApp": 5,
                    "WhatsApp": 7,
                }
            )
        )
        body = _fenced_body(lines)
        assert all("\u200e" not in line for line in body)
        assert any("WhatsApp" in line and "12m" in line for line in body)


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
    @pytest.mark.parametrize(
        ("profile", "labels", "values", "value_labels", "delta_labels", "expected"),
        [
            (
                WEEKLY_7DAY_CHART,
                ["MON", "TUE"],
                [2, 5],
                ["2h", "5h"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│           5h",
                    "│         █████",
                    "│         █████",
                    "│   2h    █████",
                    "│ █████   █████",
                    "│ █████   █████",
                    "└──────────────",
                    "   MON     TUE",
                    "   +1%     -2%",
                ],
            ),
            (
                WEEKLY_7DAY_MOOD,
                ["MON", "TUE"],
                [2.0, 5.0],
                ["2.0", "5.0"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│          5.0",
                    "│         █████",
                    "│         █████",
                    "│  2.0    █████",
                    "│ █████   █████",
                    "│ █████   █████",
                    "└──────────────",
                    "   MON     TUE",
                    "   +1%     -2%",
                ],
            ),
            (
                MONTHLY_WEEK_STUDY,
                ["W1", "W2"],
                [10, 20],
                ["10h", "20h"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│              20h",
                    "│              ██████",
                    "│  10h         ██████",
                    "│  ▄▄▄▄▄▄      ██████",
                    "│  ██████      ██████",
                    "│  ██████      ██████",
                    "└──────────────────────",
                    " W1          W2",
                    "     +1%         -2%",
                ],
            ),
            (
                MONTHLY_WEEK_METRIC,
                ["W1", "W2"],
                [2, 5],
                ["2h", "5h"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│              5h",
                    "│              █████",
                    "│              █████",
                    "│  2h          █████",
                    "│  █████       █████",
                    "│  █████       █████",
                    "└──────────────────────",
                    " W1          W2",
                    "+1%         -2%",
                ],
            ),
            (
                MONTHLY_WEEK_MOOD,
                ["W1", "W2"],
                [2.0, 5.0],
                ["2.0", "5.0"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│               5.0",
                    "│              █████",
                    "│              █████",
                    "│   2.0        █████",
                    "│  █████       █████",
                    "│  █████       █████",
                    "└──────────────────────",
                    " W1          W2",
                    "+1%         -2%",
                ],
            ),
            (
                QUARTERLY_3MONTH_STUDY,
                ["JAN", "FEB"],
                [60, 120],
                ["60h", "120h"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│",
                    "│             120h",
                    "│             ███████",
                    "│             ███████",
                    "│  60h        ███████",
                    "│  ███████    ███████",
                    "│  ███████    ███████",
                    "│  ███████    ███████",
                    "└────────────────────",
                    "     JAN        FEB",
                    "     +1%        -2%",
                ],
            ),
            (
                QUARTERLY_3MONTH_METRIC,
                ["JAN", "FEB"],
                [2, 5],
                ["2h", "5h"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│              5h",
                    "│              █████",
                    "│              █████",
                    "│  2h          █████",
                    "│  █████       █████",
                    "│  █████       █████",
                    "└───────────────────",
                    "    JAN         FEB",
                    "    +1%         -2%",
                ],
            ),
            (
                QUARTERLY_3MONTH_MOOD,
                ["JAN", "FEB"],
                [2.0, 5.0],
                ["2.0", "5.0"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│               5.0",
                    "│              █████",
                    "│              █████",
                    "│   2.0        █████",
                    "│  █████       █████",
                    "│  █████       █████",
                    "└───────────────────",
                    "    JAN         FEB",
                    "    +1%         -2%",
                ],
            ),
            (
                YEARLY_4QTR_STUDY,
                ["Q1", "Q2"],
                [180, 360],
                ["180h", "360h"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│",
                    "│             360h",
                    "│             ███████",
                    "│             ███████",
                    "│  180h       ███████",
                    "│  ███████    ███████",
                    "│  ███████    ███████",
                    "│  ███████    ███████",
                    "└────────────────────",
                    "    Q1         Q2",
                    "   +1%        -2%",
                ],
            ),
            (
                YEARLY_4QTR_METRIC,
                ["Q1", "Q2"],
                [2, 5],
                ["2h", "5h"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│             5h",
                    "│             █████",
                    "│             █████",
                    "│  2h         █████",
                    "│  █████      █████",
                    "│  █████      █████",
                    "└──────────────────",
                    "    Q1         Q2",
                    "    +1%        -2%",
                ],
            ),
            (
                YEARLY_4QTR_MOOD,
                ["Q1", "Q2"],
                [2.0, 5.0],
                ["2.0", "5.0"],
                ["+1%", "-2%"],
                [
                    "│",
                    "│",
                    "│",
                    "│",
                    "│              5.0",
                    "│             █████",
                    "│             █████",
                    "│   2.0       █████",
                    "│  █████      █████",
                    "│  █████      █████",
                    "└──────────────────",
                    "    Q1         Q2",
                    "    +1%        -2%",
                ],
            ),
        ],
    )
    def test_vertical_profile_snapshot_lock(
        self,
        profile,
        labels,
        values,
        value_labels,
        delta_labels,
        expected,
    ):
        lines = render_chart(
            VerticalBarSpec(
                labels=labels,
                values=values,
                value_labels=value_labels,
                profile=profile,
                delta_labels=delta_labels,
            )
        )
        assert _fenced_body(lines) == expected

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
        assert len(bar_rows) == 11

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


class TestChartDispatch:
    def test_unsupported_spec_type_raises_exact_error(self):
        with pytest.raises(ValueError) as excinfo:
            render_chart(object())  # type: ignore[arg-type]
        assert str(excinfo.value) == "Unsupported chart spec: <class 'object'>"

    def test_typed_renderer_rejects_mismatched_type(self):
        class _Spec:
            pass

        renderer = charts_api_module.typed_renderer(_Spec, lambda spec: [str(spec)])
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

        renderer = charts_api_module.typed_renderer(_Spec, _callback)
        assert renderer(sentinel) == ["ok"]


class TestVerticalInternals:
    def test_draw_bar_segment_writes_at_zero_and_clips_at_right_edge(self):
        row = list(".....")
        vertical_module._draw_bar_segment(row, start=0, width=6, char="#")
        assert "".join(row) == "#####"

    def test_none_value_is_rendered_as_zero_height(self):
        profile = VerticalBarProfile(
            height=2,
            y_max=2,
            track=ColumnTrack(
                column_width=6,
                bar_width=2,
                bar_left_gutter=2,
                x_label_prefix=" ",
                delta_label_prefix=" ",
                axis_trim=0,
            ),
        )
        body = _fenced_body(
            render_chart(
                VerticalBarSpec(
                    labels=["A"],
                    values=[None],
                    value_labels=["none"],
                    profile=profile,
                )
            )
        )
        axis_idx = next(i for i, line in enumerate(body) if line.startswith("└"))
        assert all("█" not in row and "▄" not in row for row in body[:axis_idx])


class TestProgressRowsRegression:
    def test_training_block_rows_rejects_mismatched_label_and_count_lengths(self):
        with pytest.raises(ValueError) as excinfo:
            render_chart(
                TrainingBlockRowsSpec(
                    labels=["Q1", "Q2"],
                    counts=[(1, 2)],
                    delta_labels=[],
                    bar_width=5,
                )
            )
        assert str(excinfo.value) == "labels and counts must have the same length"

    def test_training_block_rows_rejects_mismatched_override_and_count_lengths(self):
        with pytest.raises(ValueError) as excinfo:
            render_chart(
                TrainingBlockRowsSpec(
                    labels=["Q1"],
                    counts=[(1, 2)],
                    delta_labels=[],
                    bar_width=5,
                    bars_override=["AA", "BB"],
                )
            )
        assert (
            str(excinfo.value) == "bars_override and counts must have the same length"
        )

    def test_training_block_rows_elapsed_one_can_fill_entire_bar(self):
        body = _fenced_body(
            render_chart(
                TrainingBlockRowsSpec(
                    labels=["A"],
                    counts=[(1, 1)],
                    delta_labels=[],
                    bar_width=4,
                    fill_char="■",
                    empty_char="·",
                )
            )
        )
        assert body == ["│ A ■■■■ (01/01)"]

    def test_training_block_rows_zero_done_renders_empty_bar(self):
        body = _fenced_body(
            render_chart(
                TrainingBlockRowsSpec(
                    labels=["A"],
                    counts=[(0, 5)],
                    delta_labels=[],
                    bar_width=5,
                )
            )
        )
        assert body == ["│ A ····· (00/05)"]

    def test_training_block_rows_left_justifies_labels(self):
        body = _fenced_body(
            render_chart(
                TrainingBlockRowsSpec(
                    labels=["A", "LONG"],
                    counts=[(1, 1), (1, 1)],
                    delta_labels=[],
                    bar_width=1,
                )
            )
        )
        assert body[0].startswith("│ A   ")

    def test_training_block_rows_right_justifies_variable_count_widths(self):
        body = _fenced_body(
            render_chart(
                TrainingBlockRowsSpec(
                    labels=["A", "B"],
                    counts=[(1, 1), (100, 100)],
                    delta_labels=[],
                    bar_width=1,
                )
            )
        )
        assert "  (01/01)" in body[0]
        assert " (100/100)" in body[1]

    def test_quarterly_study_coverage_no_elapsed_uses_canonical_header(self):
        lines = render_chart(
            quarterly_study_coverage_spec(
                [
                    (datetime.date(2026, 1, 1), datetime.date(2026, 1, 2)),
                    (datetime.date(2026, 2, 1), datetime.date(2026, 2, 2)),
                    (datetime.date(2026, 3, 1), datetime.date(2026, 3, 2)),
                ],
                {},
                today=datetime.date(2025, 12, 31),
                delta_labels=[],
            )
        )
        assert _fenced_body(lines)[0] == "┌ FULL STUDY DAYS (00/00)"

    def test_quarterly_study_coverage_empty_ranges_snapshot(self):
        lines = render_chart(
            quarterly_study_coverage_spec(
                [],
                {},
                today=datetime.date(2026, 1, 1),
                delta_labels=[],
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS (00/00)",
            "│",
            "└",
            "",
            RENDER.study_legend,
        ]

    def test_quarterly_study_coverage_short_delta_list_adds_no_placeholders(self):
        lines = render_chart(
            quarterly_study_coverage_spec(
                [
                    (datetime.date(2026, 1, 1), datetime.date(2026, 1, 1)),
                    (datetime.date(2026, 2, 1), datetime.date(2026, 2, 1)),
                    (datetime.date(2026, 3, 1), datetime.date(2026, 3, 1)),
                ],
                {},
                today=datetime.date(2026, 3, 1),
                delta_labels=["+1%"],
            )
        )
        rendered = "\n".join(_fenced_body(lines))
        assert "XXXX" not in rendered

    def test_yearly_override_counts_include_today(self):
        day = datetime.date(2026, 1, 1)
        lines = render_chart(
            yearly_study_coverage_spec(
                [(day, day)],
                {day: {"study_minutes": 360}},
                today=day,
                bars_override=["█"],
                delta_labels=[],
                bar_width=1,
            )
        )
        body = _fenced_body(lines)
        assert body[0] == "┌ FULL STUDY DAYS (01/01)"
        assert body[2] == "│ Q1 █ (01/01)"

    def test_yearly_short_delta_list_adds_no_placeholders(self):
        lines = render_chart(
            yearly_study_coverage_spec(
                [
                    (datetime.date(2026, 1, 1), datetime.date(2026, 1, 1)),
                    (datetime.date(2026, 4, 1), datetime.date(2026, 4, 1)),
                ],
                {},
                today=datetime.date(2026, 12, 31),
                bars_override=["█", "·"],
                delta_labels=["+1%"],
                bar_width=1,
            )
        )
        rendered = "\n".join(_fenced_body(lines))
        assert "XXXX" not in rendered

    def test_yearly_study_coverage_empty_ranges_snapshot(self):
        lines = render_chart(
            yearly_study_coverage_spec(
                [],
                {},
                today=datetime.date(2026, 1, 1),
                delta_labels=[],
                bar_width=30,
            )
        )
        assert _fenced_body(lines) == [
            "┌ FULL STUDY DAYS (00/00)",
            "│",
            "└",
            "",
            RENDER.study_legend,
        ]


class TestWaterfallRegression:
    def test_waterfall_total_zero_returns_no_chart_body(self):
        assert render_chart(WaterfallSpec(app_totals={"X": 0})) == []

    def test_waterfall_single_minute_still_renders(self):
        lines = render_chart(
            WaterfallSpec(app_totals={"X": 1}, profile=WaterfallProfile(bar_width=1))
        )
        assert _fenced_body(lines) == [
            "┌",
            "│ X     █     1m (100%)",
            "│       ━",
            "└ TOTAL █     1m",
        ]

    def test_waterfall_preserves_leading_spaces_in_row_prefix(self):
        profile = WaterfallProfile(
            row_prefix="  │ ", footer_prefix="  └ ", header_prefix="  ┌"
        )
        lines = render_chart(
            WaterfallSpec(
                app_totals={"A": 2, "B": 1},
                profile=profile,
            )
        )
        body = _fenced_body(lines)
        assert body[0].startswith("  ┌")
        assert body[1].startswith("  │ ")

    def test_waterfall_minimum_bar_length_of_one_for_tiny_share(self):
        lines = render_chart(WaterfallSpec(app_totals={"A": 99, "B": 1}))
        body = _fenced_body(lines)
        assert "B" in body[2]
        assert "█" in body[2]

    def test_waterfall_percentage_column_is_right_aligned(self):
        lines = render_chart(
            WaterfallSpec(
                app_totals={"A": 99, "B": 1},
                profile=WaterfallProfile(bar_width=10),
            )
        )
        body = _fenced_body(lines)
        a_row = next(line for line in body if line.startswith("│ A"))
        b_row = next(line for line in body if line.startswith("│ B"))
        assert a_row.endswith("(99%)")
        assert b_row.endswith(" (1%)")
