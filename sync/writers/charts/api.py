"""Unified chart API."""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

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
SpecT = TypeVar("SpecT")


def _typed_renderer(
    spec_type: type[SpecT], fn: Callable[[SpecT], list[str]]
) -> Renderer:
    def _render(spec: object) -> list[str]:
        if not isinstance(spec, spec_type):
            raise TypeError(f"Renderer expected {spec_type!r}, received {type(spec)!r}")
        return fn(spec)

    return _render


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
    renderer = _RENDERERS.get(type(spec))
    if renderer is None:
        raise ValueError(f"Unsupported chart spec: {type(spec)!r}")
    return _fence(renderer(spec))
