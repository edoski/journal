"""Unified markdown table API."""

from __future__ import annotations

from .renderers.simple_grid import render_simple_grid
from .renderers.summary_metrics import render_summary_metrics
from .specs import (
    SimpleGridTableSpec,
    SummaryMetricsTableSpec,
    TableSpec,
)
from .._dispatch import Renderer, render_exact_type, typed_renderer


_RENDERERS: dict[type[object], Renderer] = {
    SimpleGridTableSpec: typed_renderer(SimpleGridTableSpec, render_simple_grid),
    SummaryMetricsTableSpec: typed_renderer(
        SummaryMetricsTableSpec, render_summary_metrics
    ),
}


def render_table(spec: TableSpec) -> list[str]:
    """Render any markdown table or table section from its typed spec."""
    return render_exact_type(spec=spec, renderers=_RENDERERS, kind_label="table")
