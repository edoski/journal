"""Shared layout primitives for markdown table renderers."""

from __future__ import annotations

from typing import Sequence

from sync.notes.markdown_tables import render_divider_row, render_markdown_row


def render_simple_grid_table(
    headers: Sequence[str],
    rows: Sequence[Sequence[str]],
    *,
    divider_cells: Sequence[str] | None = None,
) -> list[str]:
    """Render a generic markdown table with deterministic row formatting."""
    column_count = len(headers)
    if column_count == 0:
        raise ValueError("table must define at least one header")
    if divider_cells is not None and len(divider_cells) != column_count:
        raise ValueError("table divider cell count must match headers")
    for row in rows:
        if len(row) != column_count:
            raise ValueError("table row cell count must match headers")

    header_row = render_markdown_row(headers)
    divider_row = render_divider_row(
        column_count,
        divider_cells=divider_cells,
    )
    body_rows = [render_markdown_row(row) for row in rows]
    return [header_row, divider_row, *body_rows]
