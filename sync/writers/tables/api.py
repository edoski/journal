"""Unified markdown table API."""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

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
    renderer = _RENDERERS.get(type(spec))
    if renderer is None:
        raise ValueError(f"Unsupported table spec: {type(spec)!r}")
    return renderer(spec)
