"""Unified markdown table API."""

from __future__ import annotations

from typing import Callable, cast

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


Renderer = Callable[[object], list[str]]


_RENDERERS: dict[type[object], Renderer] = {
    SimpleGridTableSpec: cast(Renderer, render_simple_grid),
    SummaryMetricsTableSpec: cast(Renderer, render_summary_metrics),
    ScreenTrendTableSpec: cast(Renderer, render_screen_trend),
    DailyProcrastinationTableSpec: cast(Renderer, render_daily_procrastination),
}


def render_table(spec: TableSpec) -> list[str]:
    """Render any markdown table or table section from its typed spec."""
    renderer = _RENDERERS.get(type(spec))
    if renderer is None:
        raise ValueError(f"Unsupported table spec: {type(spec)!r}")
    return renderer(cast(object, spec))
