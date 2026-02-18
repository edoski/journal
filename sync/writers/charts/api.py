"""Unified chart API."""

from __future__ import annotations

from .renderers.grouped_grid import (
    render_monthly_study_grid,
    render_monthly_training_grid,
    render_weekly_study_grid,
    render_weekly_training_grid,
)
from .renderers.progress_rows import (
    render_quarterly_study_coverage_rows,
    render_training_block_rows,
    render_training_sections_rows,
    render_yearly_study_coverage_rows,
)
from .renderers.vertical import render_vertical_bar
from .renderers.waterfall import render_waterfall
from .specs import (
    ChartSpec,
    MonthlyStudyGridSpec,
    MonthlyTrainingGridSpec,
    QuarterlyStudyCoverageRowsSpec,
    TrainingBlockRowsSpec,
    TrainingSectionsRowsSpec,
    VerticalBarSpec,
    WaterfallSpec,
    WeeklyStudyGridSpec,
    WeeklyTrainingGridSpec,
    YearlyStudyCoverageRowsSpec,
)
from .._dispatch import Renderer, render_exact_type, typed_renderer


def _fence(lines: list[str]) -> list[str]:
    if not lines:
        return []
    return ["```", *lines, "```"]


_typed_renderer = typed_renderer


_RENDERERS: dict[type[object], Renderer] = {
    VerticalBarSpec: _typed_renderer(VerticalBarSpec, render_vertical_bar),
    WeeklyStudyGridSpec: _typed_renderer(WeeklyStudyGridSpec, render_weekly_study_grid),
    MonthlyStudyGridSpec: _typed_renderer(
        MonthlyStudyGridSpec, render_monthly_study_grid
    ),
    MonthlyTrainingGridSpec: _typed_renderer(
        MonthlyTrainingGridSpec, render_monthly_training_grid
    ),
    WeeklyTrainingGridSpec: _typed_renderer(
        WeeklyTrainingGridSpec, render_weekly_training_grid
    ),
    TrainingBlockRowsSpec: _typed_renderer(
        TrainingBlockRowsSpec, render_training_block_rows
    ),
    TrainingSectionsRowsSpec: _typed_renderer(
        TrainingSectionsRowsSpec, render_training_sections_rows
    ),
    QuarterlyStudyCoverageRowsSpec: _typed_renderer(
        QuarterlyStudyCoverageRowsSpec, render_quarterly_study_coverage_rows
    ),
    YearlyStudyCoverageRowsSpec: _typed_renderer(
        YearlyStudyCoverageRowsSpec, render_yearly_study_coverage_rows
    ),
    WaterfallSpec: _typed_renderer(WaterfallSpec, render_waterfall),
}


def render_chart(spec: ChartSpec) -> list[str]:
    """Render any chart from its typed specification."""
    return _fence(
        render_exact_type(spec=spec, renderers=_RENDERERS, kind_label="chart")
    )
