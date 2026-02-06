"""Chart presets and shared code-block wrapper."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BarChartPreset:
    """Configuration for a specific bar chart layout."""

    height: int
    y_max: float
    bar_width: int
    col_spacing: int
    label_prefix: str
    axis_trim: int = 2  # Subtracted from col_spacing * labels for axis length
    left_pad: int | None = None  # None = auto-center bars in column
    center_labels_on_bars: bool = False
    delta_label_offset: int = (
        0  # Horizontal character shift for delta labels (negative = left)
    )


# Weekly charts (7 days: MON-SUN)
WEEKLY_7DAY_CHART = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=8,
    label_prefix="   ",
)

WEEKLY_7DAY_MOOD = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=8,
    label_prefix="   ",
    center_labels_on_bars=True,
)

# Monthly charts (4-5 weeks, axis dynamically sized)
MONTHLY_WEEK_STUDY = BarChartPreset(
    height=10,
    y_max=40,
    bar_width=6,
    col_spacing=12,
    label_prefix=" ",
    left_pad=2,
)

MONTHLY_WEEK_METRIC = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=12,
    label_prefix=" ",
    left_pad=2,
)

MONTHLY_WEEK_MOOD = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=12,
    label_prefix=" ",
    left_pad=2,
    center_labels_on_bars=True,
)

# Quarterly charts (3 months: JAN/FEB/MAR etc.)
QUARTERLY_3MONTH_STUDY = BarChartPreset(
    height=12,
    y_max=240,
    bar_width=7,
    col_spacing=11,
    label_prefix="     ",
    left_pad=2,
)

QUARTERLY_3MONTH_METRIC = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=12,
    label_prefix="    ",
    axis_trim=5,
    left_pad=2,
)

QUARTERLY_3MONTH_MOOD = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=12,
    label_prefix="    ",
    axis_trim=5,
    left_pad=2,
    center_labels_on_bars=True,
)

# Yearly charts (4 quarters: Q1-Q4)
YEARLY_4QTR_STUDY = BarChartPreset(
    height=12,
    y_max=720,
    bar_width=7,
    col_spacing=11,
    label_prefix="    ",
    left_pad=2,
    delta_label_offset=-1,
)

YEARLY_4QTR_METRIC = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=11,
    label_prefix="    ",
    axis_trim=4,
    left_pad=2,
    delta_label_offset=-1,
)

YEARLY_4QTR_MOOD = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=11,
    label_prefix="    ",
    axis_trim=4,
    left_pad=2,
    center_labels_on_bars=True,
    delta_label_offset=-1,
)

# Test preset (used in unit tests)
TEST_CHART = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=12,
    label_prefix=" ",
    axis_trim=3,  # 12 * 3 - 3 = 33 for 3 labels
)


def wrap_code_block(lines):
    return ["```"] + lines + ["```"]
