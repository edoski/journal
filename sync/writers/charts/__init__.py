"""Chart and grid rendering package."""

from __future__ import annotations

from .bar import render_bar_chart
from .presets import (
    BarChartPreset,
    MONTHLY_WEEK_METRIC,
    MONTHLY_WEEK_MOOD,
    MONTHLY_WEEK_STUDY,
    QUARTERLY_3MONTH_METRIC,
    QUARTERLY_3MONTH_MOOD,
    QUARTERLY_3MONTH_STUDY,
    TEST_CHART,
    WEEKLY_7DAY_CHART,
    WEEKLY_7DAY_MOOD,
    YEARLY_4QTR_METRIC,
    YEARLY_4QTR_MOOD,
    YEARLY_4QTR_STUDY,
    wrap_code_block,
)
from .screen_time import (
    render_screen_time_period_table,
    render_screen_time_trend_table,
    render_waterfall_chart,
)
from .study import (
    _compress_symbols,
    compress_activity_time_order,
    compress_days_time_order,
    render_monthly_study_grid,
    render_quarterly_study_coverage,
    render_weekly_study_grid,
    render_yearly_study_coverage,
    study_intensity_symbol,
)
from .training import (
    render_training_frequency_grid,
    render_training_quarter_block,
    render_weekly_training_grid,
)

__all__ = [
    "BarChartPreset",
    "WEEKLY_7DAY_CHART",
    "WEEKLY_7DAY_MOOD",
    "MONTHLY_WEEK_STUDY",
    "MONTHLY_WEEK_METRIC",
    "MONTHLY_WEEK_MOOD",
    "QUARTERLY_3MONTH_STUDY",
    "QUARTERLY_3MONTH_METRIC",
    "QUARTERLY_3MONTH_MOOD",
    "YEARLY_4QTR_STUDY",
    "YEARLY_4QTR_METRIC",
    "YEARLY_4QTR_MOOD",
    "TEST_CHART",
    "wrap_code_block",
    "render_bar_chart",
    "render_training_quarter_block",
    "render_training_frequency_grid",
    "render_weekly_training_grid",
    "study_intensity_symbol",
    "render_weekly_study_grid",
    "render_monthly_study_grid",
    "_compress_symbols",
    "compress_days_time_order",
    "compress_activity_time_order",
    "render_quarterly_study_coverage",
    "render_yearly_study_coverage",
    "render_waterfall_chart",
    "render_screen_time_trend_table",
    "render_screen_time_period_table",
]
