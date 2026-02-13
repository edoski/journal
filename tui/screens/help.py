"""Help route renderer."""

from __future__ import annotations

import curses

from tui.layout import Rect
from tui.theme import Theme
from tui.widgets.common import draw_box, draw_lines


HELP_LINES = [
    "Global",
    "Ctrl+K or :  command palette",
    "1..6          route jump",
    "[ / ]         anchor previous / next",
    "h / l         period previous / next",
    "Tab           cycle pane focus",
    "/             open route filter/search",
    "q             quit app (when no modal/palette)",
    "",
    "Explorer",
    "j / k         select metric row",
    "left/right    cycle breakdown tabs",
    "Enter         drill into metric lab",
    "",
    "Metric Lab",
    "j / k         select metric",
    "+ / -         adjust lookback",
    "",
    "Daily Editor",
    "f / g / s     open forms",
    "Enter or y    confirm staged write",
    "c or Esc      cancel staged write",
    "",
    "Reminders",
    "a / d         add or delete rule",
]


def render(stdscr: curses.window, body: Rect, theme: Theme) -> None:
    """Render keymap and workflow reference."""
    draw_box(stdscr, body, title="Help", title_attr=theme.panel_title)
    draw_lines(
        stdscr,
        Rect(body.y + 1, body.x + 2, body.h - 2, body.w - 4),
        HELP_LINES,
        theme.normal,
    )
