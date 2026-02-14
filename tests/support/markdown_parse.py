"""Markdown table parsing helpers for tests."""

from __future__ import annotations


def split_markdown_row(line: str) -> list[str]:
    """Split a markdown table row, preserving escaped ``\\|`` cell content."""
    stripped = line.strip()
    if not stripped.startswith("|") or not stripped.endswith("|"):
        raise ValueError(f"Not a markdown table row: {line!r}")

    cells: list[str] = []
    buffer: list[str] = []
    escaped = False
    for char in stripped[1:-1]:
        if char == "|" and not escaped:
            cells.append("".join(buffer).strip())
            buffer = []
            continue

        buffer.append(char)
        escaped = char == "\\" and not escaped
        if char != "\\":
            escaped = False

    cells.append("".join(buffer).strip())
    return cells


def join_markdown_row(cells: list[str]) -> str:
    """Join cells into a canonical markdown table row."""
    return "| " + " | ".join(cells) + " |"
