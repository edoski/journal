"""Renderer for generic simple markdown tables."""

from __future__ import annotations

from ..layout import render_simple_grid_table
from ..specs import SimpleGridTableSpec


def render_simple_grid(spec: SimpleGridTableSpec) -> list[str]:
    """Render simple markdown table rows from a typed spec."""
    return render_simple_grid_table(
        spec.headers,
        spec.rows,
        divider_cells=spec.divider_cells,
    )
