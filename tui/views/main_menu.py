"""Main menu rendering for the journal TUI."""

from __future__ import annotations

import curses

from tui.state import AppState

MENU_ITEMS = [
    ("by_period", "Explore By Period"),
    ("by_metric", "Explore By Metric"),
    ("edit_daily", "Edit Daily Source Data"),
    ("edit_reminders", "Edit REMINDERS.md"),
    ("quit", "Quit"),
]


def render(stdscr: curses.window, state: AppState) -> None:
    """Render main menu with current selection."""
    stdscr.addstr(1, 2, "Journal TUI", curses.A_BOLD)
    stdscr.addstr(2, 2, "Use j/k or arrows, Enter to select")

    for idx, (_, label) in enumerate(MENU_ITEMS):
        prefix = "> " if idx == state.selected_index else "  "
        attr = curses.A_REVERSE if idx == state.selected_index else curses.A_NORMAL
        stdscr.addstr(4 + idx, 2, f"{prefix}{label}", attr)
