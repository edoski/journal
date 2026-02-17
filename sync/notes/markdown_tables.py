"""Shared markdown table parsing and rendering helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class TableSchema:
    """Strict schema used when parsing a markdown table."""

    headers: tuple[str, ...]


@dataclass(frozen=True)
class ParsedMarkdownTable:
    """Parsed markdown table block."""

    start_idx: int
    end_idx: int
    headers: tuple[str, ...]
    divider: tuple[str, ...]
    rows: tuple[tuple[str, ...], ...]


def split_markdown_row(line: str) -> list[str] | None:
    """Split a markdown table row into cells, preserving escaped pipes."""
    stripped = line.strip()
    if not stripped.startswith("|") or not stripped.endswith("|"):
        return None

    cells: list[str] = []
    buf: list[str] = []
    escaped = False

    for ch in stripped[1:-1]:
        if ch == "|" and not escaped:
            cells.append("".join(buf).strip())
            buf = []
            continue
        buf.append(ch)
        escaped = ch == "\\" and not escaped
        if ch != "\\":
            escaped = False

    cells.append("".join(buf).strip())
    return cells


def escape_markdown_cell(text: str) -> str:
    """Escape unescaped markdown table pipes in a cell."""
    escaped = False
    out: list[str] = []
    for ch in text:
        if ch == "|" and not escaped:
            out.append("\\")
        out.append(ch)
        escaped = ch == "\\" and not escaped
        if ch != "\\":
            escaped = False
    return "".join(out)


def render_markdown_row(cells: Sequence[str]) -> str:
    """Render markdown table row from cells."""
    rendered = [str(cell) for cell in cells]
    return f"| {' | '.join(rendered)} |"


def render_divider_row(
    column_count: int,
    *,
    divider_cells: Sequence[str] | None = None,
    min_width: int = 4,
) -> str:
    """Render markdown table divider row."""
    if divider_cells is not None:
        cells = [str(cell) for cell in divider_cells]
        return render_markdown_row(cells)
    return render_markdown_row(["-" * max(min_width, 3) for _ in range(column_count)])


def parse_markdown_table(
    lines: Sequence[str],
    start_idx: int,
    *,
    schema: TableSchema | None = None,
) -> ParsedMarkdownTable:
    """Parse a markdown table block from lines starting at ``start_idx``."""
    if start_idx < 0 or start_idx >= len(lines):
        raise ValueError("Table start index is out of range")

    header_cells = split_markdown_row(lines[start_idx])
    if header_cells is None:
        raise ValueError("Expected markdown table header row")

    if schema and tuple(header_cells) != schema.headers:
        raise ValueError("Markdown table header does not match schema")

    divider_idx = start_idx + 1
    if divider_idx >= len(lines):
        raise ValueError("Markdown table is missing divider row")

    divider_cells = split_markdown_row(lines[divider_idx])
    if divider_cells is None:
        raise ValueError("Markdown table divider row is invalid")

    rows: list[tuple[str, ...]] = []
    idx = divider_idx + 1
    while idx < len(lines):
        row_cells = split_markdown_row(lines[idx])
        if row_cells is None:
            break
        rows.append(tuple(row_cells))
        idx += 1

    return ParsedMarkdownTable(
        start_idx=start_idx,
        end_idx=idx,
        headers=tuple(header_cells),
        divider=tuple(divider_cells),
        rows=tuple(rows),
    )
