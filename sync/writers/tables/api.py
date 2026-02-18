"""Unified markdown table API."""

from __future__ import annotations

from .renderers.daily_procrastination import render_daily_procrastination
from .renderers.screen_trend import render_screen_trend
from .renderers.simple_grid import render_simple_grid
from .renderers.summary_metrics import render_summary_metrics
from .specs import (
    DailyProcrastinationTableSpec,
    ScreenTrendTableSpec,
    SimpleGridTableSpec,
    SummaryMetricsTableSpec,
    TableSpec,
)
from .._dispatch import Renderer, render_exact_type, typed_renderer


_typed_renderer = typed_renderer


_RENDERERS: dict[type[object], Renderer] = {
    SimpleGridTableSpec: _typed_renderer(SimpleGridTableSpec, render_simple_grid),
    SummaryMetricsTableSpec: _typed_renderer(
        SummaryMetricsTableSpec, render_summary_metrics
    ),
    ScreenTrendTableSpec: _typed_renderer(ScreenTrendTableSpec, render_screen_trend),
    DailyProcrastinationTableSpec: _typed_renderer(
        DailyProcrastinationTableSpec, render_daily_procrastination
    ),
}


def render_table(spec: TableSpec) -> list[str]:
    """Render any markdown table or table section from its typed spec."""
    return render_exact_type(spec=spec, renderers=_RENDERERS, kind_label="table")
