"""Unified chart specifications, profiles, and renderer API."""

from __future__ import annotations

from .api import render_chart
from .formatters import (
    TIME_LABEL_MIN2H,
    TIME_LABEL_STANDARD,
    TimeLabelMin2HourDigits,
    TimeLabelStandard,
)
from .layout import compress_activity_time_order, compress_days_time_order
from .profiles import (
    DEFAULT_GROUPED_GRID_PROFILE,
    DEFAULT_PROGRESS_ROWS_PROFILE,
    MONTHLY_WEEK_METRIC,
    MONTHLY_WEEK_STUDY,
    TEST_CHART,
    WEEKLY_7DAY_CHART,
    YEARLY_4QTR_METRIC,
    YEARLY_4QTR_STUDY,
)
from .specs import (
    AnchorRef,
    ChartSpec,
    ColumnTrack,
    GlyphSet,
    GroupedGridProfile,
    HAnchor,
    MonthlyTrainingGridSpec,
    ProgressRowsProfile,
    SegmentTrack,
    TrainingBlockRowsSpec,
    TrainingSection,
    TrainingSectionsRowsSpec,
    VerticalBarProfile,
    VerticalBarSpec,
    WeeklyTrainingGridSpec,
)

__all__ = [
    "render_chart",
    "ChartSpec",
    "HAnchor",
    "AnchorRef",
    "GlyphSet",
    "ColumnTrack",
    "SegmentTrack",
    "VerticalBarProfile",
    "GroupedGridProfile",
    "ProgressRowsProfile",
    "VerticalBarSpec",
    "MonthlyTrainingGridSpec",
    "WeeklyTrainingGridSpec",
    "TrainingBlockRowsSpec",
    "TrainingSectionsRowsSpec",
    "TrainingSection",
    "WEEKLY_7DAY_CHART",
    "MONTHLY_WEEK_STUDY",
    "MONTHLY_WEEK_METRIC",
    "YEARLY_4QTR_STUDY",
    "YEARLY_4QTR_METRIC",
    "TEST_CHART",
    "DEFAULT_GROUPED_GRID_PROFILE",
    "DEFAULT_PROGRESS_ROWS_PROFILE",
    "TimeLabelStandard",
    "TimeLabelMin2HourDigits",
    "TIME_LABEL_STANDARD",
    "TIME_LABEL_MIN2H",
    "compress_days_time_order",
    "compress_activity_time_order",
]
