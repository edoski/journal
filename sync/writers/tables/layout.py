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
    header_row = render_markdown_row(headers)
    divider_row = render_divider_row(
        len(headers),
        divider_cells=divider_cells,
        min_width=4,
    )
    body_rows = [render_markdown_row(row) for row in rows]
    return [header_row, divider_row, *body_rows]
