"""Daily editor route renderer with staged diff preview panel."""

from __future__ import annotations

import curses
import datetime

from tui.layout import Rect
from tui.state import FormModal, PendingPreview
from tui.theme import Theme
from tui.widgets.common import draw_box, draw_lines, safe_addstr


def _left_instructions(pending_preview: PendingPreview | None) -> list[str]:
    if pending_preview is not None:
        return [
            "Pending change staged.",
            "Enter/y: confirm write",
            "c/Esc: cancel pending",
            "Other mutating keys are blocked.",
        ]
    return [
        "f: frontmatter key/value form",
        "g: replace DAILY goals form",
        "s: replace section form",
        "n/p: next/previous day",
        "/: filter/search (not used in this screen)",
    ]


def _preview_lines(pending_preview: PendingPreview | None) -> list[str]:
    if pending_preview is None:
        return ["No pending changes."]
    return [
        pending_preview.title,
        f"Target: {pending_preview.target_label}",
        "",
        *pending_preview.diff_lines,
    ]


def render(
    stdscr: curses.window,
    body: Rect,
    theme: Theme,
    anchor_date: datetime.date,
    message: str,
    pending_preview: PendingPreview | None,
    modal: FormModal | None,
) -> None:
    """Render daily-editor controls with right-side expected-change panel."""
    left_w = max(36, body.w // 2)
    left_rect = Rect(body.y, body.x, body.h, left_w)
    right_rect = Rect(body.y, body.x + left_w, body.h, max(1, body.w - left_w))

    draw_box(stdscr, left_rect, title="Daily Editor", title_attr=theme.panel_title)
    safe_addstr(
        stdscr,
        left_rect.y + 1,
        left_rect.x + 2,
        f"Date: {anchor_date.isoformat()}",
        theme.table_header,
    )
    draw_lines(
        stdscr,
        Rect(left_rect.y + 3, left_rect.x + 2, left_rect.h - 6, left_rect.w - 4),
        _left_instructions(pending_preview),
    )
    if message:
        safe_addstr(
            stdscr, left_rect.y + left_rect.h - 2, left_rect.x + 2, message, theme.warn
        )

    draw_box(stdscr, right_rect, title="Expected Changes", title_attr=theme.panel_title)
    draw_lines(
        stdscr,
        Rect(right_rect.y + 1, right_rect.x + 2, right_rect.h - 2, right_rect.w - 4),
        _preview_lines(pending_preview),
    )

    if modal is not None:
        safe_addstr(
            stdscr,
            left_rect.y + 2,
            left_rect.x + 2,
            f"Form: {modal.title}",
            theme.good,
        )
