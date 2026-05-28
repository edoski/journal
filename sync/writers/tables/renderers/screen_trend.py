"""Renderer for prepared period screen-time trend markdown tables."""

from __future__ import annotations

from ..layout import render_simple_grid_table
from ..specs import ScreenTrendTableSpec


def render_screen_trend(spec: ScreenTrendTableSpec) -> list[str]:
    """Render period screen-time trend table."""
    headers = [spec.period_label, "SCREEN"]
    divider_cells = ["-----", "--------"]
    return render_simple_grid_table(headers, spec.rows, divider_cells=divider_cells)
