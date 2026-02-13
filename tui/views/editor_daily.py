"""Daily source editor rendering."""

from __future__ import annotations

import curses
import datetime

from tui.state import PendingPreview
from tui.views import preview


def render(
    stdscr: curses.window,
    note_date: datetime.date,
    message: str,
    pending_preview: PendingPreview | None,
) -> None:
    """Render daily editor command hints and expected-change preview."""
    height, width = stdscr.getmaxyx()
    layout = preview.compute_editor_layout(width)

    left_lines = [
        "Edit Daily Source Data",
        f"Date: {note_date.isoformat()}",
        "",
    ]
    if pending_preview is None:
        left_lines.extend(
            [
                "f: set frontmatter key/value",
                "g: replace DAILY goals with checkbox lines",
                "s: replace a section body (e.g. ### **STUDY**)",
                "n/p: next/previous day",
                "q: back",
            ]
        )
    else:
        left_lines.extend(
            [
                "Pending change staged.",
                "Enter/y: confirm",
                "c/q: cancel pending change",
                "Other keys are ignored until confirm/cancel.",
            ]
        )

    if message:
        left_lines.extend(["", message])

    if left_lines:
        preview.safe_addstr(stdscr, 1, layout.left_x, left_lines[0], curses.A_BOLD)
    if len(left_lines) > 1:
        preview.draw_lines(
            stdscr,
            start_row=2,
            start_col=layout.left_x,
            width=layout.left_width,
            height=max(0, height - 3),
            lines=left_lines[1:],
        )

    panel_lines = preview.preview_lines(pending_preview)
    if layout.split:
        separator_x = max(0, layout.right_x - 2)
        for row in range(1, max(1, height - 1)):
            preview.safe_addstr(stdscr, row, separator_x, "|")

        preview.safe_addstr(
            stdscr, 1, layout.right_x, "Expected Changes", curses.A_BOLD
        )
        preview.draw_lines(
            stdscr,
            start_row=3,
            start_col=layout.right_x,
            width=layout.right_width,
            height=max(0, height - 4),
            lines=panel_lines,
        )
        return

    fallback_row = 12
    preview.safe_addstr(
        stdscr, fallback_row, layout.left_x, "Expected Changes", curses.A_BOLD
    )
    preview.draw_lines(
        stdscr,
        start_row=fallback_row + 1,
        start_col=layout.left_x,
        width=layout.left_width,
        height=max(0, height - fallback_row - 2),
        lines=panel_lines,
    )
