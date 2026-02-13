"""Shared preview helpers for interactive TUI edit screens."""

from __future__ import annotations

import curses
import difflib
from dataclasses import dataclass

from tui.state import PendingPreview


@dataclass(frozen=True)
class EditorLayout:
    """Geometry for editor screens with optional split preview panel."""

    split: bool
    left_x: int
    left_width: int
    right_x: int
    right_width: int


def build_unified_diff(
    before_lines: list[str],
    after_lines: list[str],
    from_label: str,
    to_label: str,
) -> list[str]:
    """Build a unified diff for preview rendering."""
    diff = list(
        difflib.unified_diff(
            before_lines,
            after_lines,
            fromfile=from_label,
            tofile=to_label,
            lineterm="",
        )
    )
    return diff or ["(no text changes)"]


def compute_editor_layout(
    total_width: int,
    *,
    left_margin: int = 2,
    right_margin: int = 2,
    gutter: int = 3,
    min_left: int = 46,
    min_right: int = 36,
) -> EditorLayout:
    """Choose split layout when there is enough terminal width."""
    usable = max(1, total_width - left_margin - right_margin)
    split_width = min_left + gutter + min_right
    if usable >= split_width:
        left_width = usable - min_right - gutter
        right_width = usable - left_width - gutter
        right_x = left_margin + left_width + gutter
        return EditorLayout(
            split=True,
            left_x=left_margin,
            left_width=left_width,
            right_x=right_x,
            right_width=right_width,
        )

    return EditorLayout(
        split=False,
        left_x=left_margin,
        left_width=usable,
        right_x=0,
        right_width=0,
    )


def preview_lines(pending_preview: PendingPreview | None) -> list[str]:
    """Renderable lines for the preview panel."""
    if pending_preview is None:
        return [
            "No pending changes.",
            "Run an edit action to stage a diff preview.",
        ]

    return [
        pending_preview.title,
        f"Target: {pending_preview.target_label}",
        "",
        *pending_preview.diff_lines,
    ]


def fit_lines(lines: list[str], max_rows: int, max_cols: int) -> list[str]:
    """Fit lines into a bounded panel with row/column truncation."""
    if max_rows <= 0 or max_cols <= 0:
        return []

    def _truncate(value: str) -> str:
        if len(value) <= max_cols:
            return value
        if max_cols <= 3:
            return value[:max_cols]
        return f"{value[: max_cols - 3]}..."

    clipped = [_truncate(line) for line in lines]
    if len(clipped) <= max_rows:
        return clipped

    if max_rows == 1:
        return [_truncate("(preview truncated)")]

    return [*clipped[: max_rows - 1], _truncate("(preview truncated)")]


def safe_addstr(
    stdscr: curses.window,
    row: int,
    col: int,
    text: str,
    attr: int = curses.A_NORMAL,
) -> None:
    """Write text defensively to avoid curses bounds errors."""
    max_y, max_x = stdscr.getmaxyx()
    if row < 0 or row >= max_y:
        return
    if col < 0 or col >= max_x:
        return

    available = max_x - col - 1
    if available <= 0:
        return

    out = text[:available]
    if not out:
        return

    try:
        stdscr.addstr(row, col, out, attr)
    except curses.error:
        return


def draw_lines(
    stdscr: curses.window,
    *,
    start_row: int,
    start_col: int,
    width: int,
    height: int,
    lines: list[str],
    attr: int = curses.A_NORMAL,
) -> None:
    """Draw a clipped list of lines into a bounded region."""
    for row_offset, line in enumerate(
        fit_lines(lines, max_rows=height, max_cols=width)
    ):
        safe_addstr(stdscr, start_row + row_offset, start_col, line, attr)
