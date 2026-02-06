"""Daily source editor rendering."""

from __future__ import annotations

import curses
import datetime


def render(
    stdscr: curses.window,
    note_date: datetime.date,
    message: str,
) -> None:
    """Render daily editor command hints."""
    stdscr.addstr(1, 2, "Edit Daily Source Data", curses.A_BOLD)
    stdscr.addstr(2, 2, f"Date: {note_date.isoformat()}")
    stdscr.addstr(4, 2, "f: set frontmatter key/value")
    stdscr.addstr(5, 2, "g: replace DAILY goals with checkbox lines")
    stdscr.addstr(6, 2, "s: replace a section body (e.g. ### **STUDY**)")
    stdscr.addstr(7, 2, "n/p: next/previous day")
    stdscr.addstr(8, 2, "q: back")

    if message:
        stdscr.addstr(10, 2, message, curses.A_BOLD)
