"""Reminders editor rendering."""

from __future__ import annotations

import curses

from sync.models import ReminderRule


def render(
    stdscr: curses.window,
    rules: list[ReminderRule],
    selected_index: int,
    message: str,
) -> None:
    """Render configured reminder rules and edit shortcuts."""
    stdscr.addstr(1, 2, "Edit REMINDERS.md", curses.A_BOLD)
    stdscr.addstr(2, 2, "j/k: move  a: add  t: toggle  d: delete  q: back")

    start_row = 4
    for idx, rule in enumerate(rules):
        schedule = f"{rule.schedule_kind}:{rule.schedule_value}"
        prefix = ">" if idx == selected_index else " "
        attr = curses.A_REVERSE if idx == selected_index else curses.A_NORMAL
        enabled = "on" if rule.enabled else "off"
        stdscr.addstr(
            start_row + idx,
            2,
            f"{prefix} {rule.id:18} {enabled:3} {schedule:24} {rule.body}",
            attr,
        )

    if message:
        stdscr.addstr(start_row + len(rules) + 2, 2, message, curses.A_BOLD)
