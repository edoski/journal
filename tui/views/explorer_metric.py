"""By-metric explorer rendering."""

from __future__ import annotations

import curses

from tui.data.repository import PeriodSnapshot
from tui.state import AppState


def render(
    stdscr: curses.window,
    state: AppState,
    snapshot: PeriodSnapshot,
    metric_value,
) -> None:
    """Render metric-centric explorer for selected period and anchor."""
    stdscr.addstr(1, 2, "By Metric", curses.A_BOLD)
    stdscr.addstr(
        2,
        2,
        "j/k metric | h/l period | n/p anchor | Tab pivot | q back",
    )
    stdscr.addstr(
        4,
        2,
        f"Metric: {state.metric}  Period: {snapshot.period}  Label: {snapshot.label}",
    )
    stdscr.addstr(5, 2, f"Range: {snapshot.start}..{snapshot.end}")
    stdscr.addstr(7, 2, f"Value: {metric_value}", curses.A_BOLD)
