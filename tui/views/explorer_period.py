"""By-period explorer rendering."""

from __future__ import annotations

import curses

from sync.contracts.query import PeriodSnapshot
from tui.state import AppState


def render(
    stdscr: curses.window,
    state: AppState,
    snapshot: PeriodSnapshot,
) -> None:
    """Render the period-centric query view."""
    stdscr.addstr(1, 2, "By Period", curses.A_BOLD)
    stdscr.addstr(
        2,
        2,
        "[/] search omitted in v1 | h/l period | n/p anchor | Tab pivot | q back",
    )
    stdscr.addstr(
        4,
        2,
        f"Period: {snapshot.period}  Label: {snapshot.label}  Range: {snapshot.start}..{snapshot.end}",
    )

    row = 6
    for key, value in snapshot.metrics.items():
        stdscr.addstr(row, 4, f"{key:24} {value}")
        row += 1
