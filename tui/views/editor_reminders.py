"""Reminders editor rendering."""

from __future__ import annotations

import curses

from sync.models import ReminderRule
from tui.state import PendingPreview
from tui.views import preview


def render(
    stdscr: curses.window,
    rules: list[ReminderRule],
    selected_index: int,
    message: str,
    pending_preview: PendingPreview | None,
) -> None:
    """Render reminders editor with staged change preview panel."""
    height, width = stdscr.getmaxyx()
    layout = preview.compute_editor_layout(width)
    panel_lines = preview.preview_lines(pending_preview)

    preview.safe_addstr(stdscr, 1, layout.left_x, "Edit REMINDERS.md", curses.A_BOLD)
    if pending_preview is None:
        preview.safe_addstr(
            stdscr,
            2,
            layout.left_x,
            "j/k: move  a: add  d: delete  q: back",
        )
    else:
        preview.safe_addstr(
            stdscr,
            2,
            layout.left_x,
            "Enter/y: confirm  c/q: cancel pending",
        )

    start_row = 4
    available_rule_rows = max(0, height - start_row - 4)
    visible_rules = rules[:available_rule_rows]
    for idx, rule in enumerate(visible_rules):
        schedule = f"{rule.schedule_kind}:{rule.schedule_value}"
        prefix = ">" if idx == selected_index else " "
        attr = curses.A_REVERSE if idx == selected_index else curses.A_NORMAL
        preview.safe_addstr(
            stdscr,
            start_row + idx,
            layout.left_x,
            f"{prefix} {schedule:24} {rule.body}",
            attr,
        )

    if len(rules) > len(visible_rules):
        remaining = len(rules) - len(visible_rules)
        preview.safe_addstr(
            stdscr,
            start_row + len(visible_rules),
            layout.left_x,
            f"... {remaining} more reminder rule(s)",
        )

    message_row = min(height - 2, start_row + len(visible_rules) + 2)
    if message:
        preview.safe_addstr(stdscr, message_row, layout.left_x, message, curses.A_BOLD)

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

    fallback_row = min(height - 3, message_row + 2)
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
