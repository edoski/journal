"""Unified chart API."""

from __future__ import annotations

from .renderers.grouped_grid import (
    render_monthly_training_grid,
    render_weekly_training_grid,
)
from .renderers.progress_rows import (
    render_training_block_rows,
    render_training_sections_rows,
)
from .renderers.vertical import render_vertical_bar
from .specs import (
    ChartSpec,
    MonthlyTrainingGridSpec,
    TrainingBlockRowsSpec,
    TrainingSectionsRowsSpec,
    VerticalBarSpec,
    WeeklyTrainingGridSpec,
)
from .._dispatch import Renderer, render_exact_type, typed_renderer


def _fence(lines: list[str]) -> list[str]:
    if not lines:
        return []
    return ["```", *lines, "```"]


_RENDERERS: dict[type[object], Renderer] = {
    VerticalBarSpec: typed_renderer(VerticalBarSpec, render_vertical_bar),
    MonthlyTrainingGridSpec: typed_renderer(
        MonthlyTrainingGridSpec, render_monthly_training_grid
    ),
    WeeklyTrainingGridSpec: typed_renderer(
        WeeklyTrainingGridSpec, render_weekly_training_grid
    ),
    TrainingBlockRowsSpec: typed_renderer(
        TrainingBlockRowsSpec, render_training_block_rows
    ),
    TrainingSectionsRowsSpec: typed_renderer(
        TrainingSectionsRowsSpec, render_training_sections_rows
    ),
}


def render_chart(spec: ChartSpec) -> list[str]:
    """Render any chart from its typed specification."""
    return _fence(
        render_exact_type(spec=spec, renderers=_RENDERERS, kind_label="chart")
    )
