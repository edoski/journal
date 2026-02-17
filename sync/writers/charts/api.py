"""Unified chart API."""

from __future__ import annotations

from typing import Callable, cast

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


def _fence(lines: list[str]) -> list[str]:
    if not lines:
        return []
    return ["```", *lines, "```"]


Renderer = Callable[[object], list[str]]


_RENDERERS: dict[type[object], Renderer] = {
    VerticalBarSpec: cast(Renderer, render_vertical_bar),
    WeeklyStudyGridSpec: cast(Renderer, render_weekly_study_grid),
    MonthlyStudyGridSpec: cast(Renderer, render_monthly_study_grid),
    MonthlyTrainingGridSpec: cast(Renderer, render_monthly_training_grid),
    WeeklyTrainingGridSpec: cast(Renderer, render_weekly_training_grid),
    TrainingBlockRowsSpec: cast(Renderer, render_training_block_rows),
    TrainingSectionsRowsSpec: cast(Renderer, render_training_sections_rows),
    QuarterlyStudyCoverageRowsSpec: cast(
        Renderer, render_quarterly_study_coverage_rows
    ),
    YearlyStudyCoverageRowsSpec: cast(Renderer, render_yearly_study_coverage_rows),
    WaterfallSpec: cast(Renderer, render_waterfall),
}


def render_chart(spec: ChartSpec) -> list[str]:
    """Render any chart from its typed specification."""
    renderer = _RENDERERS.get(type(spec))
    if renderer is None:
        raise ValueError(f"Unsupported chart spec: {type(spec)!r}")
    return _fence(renderer(cast(object, spec)))
