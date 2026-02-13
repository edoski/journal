"""Semantic curses color theme with monochrome fallback."""

from __future__ import annotations

import curses
from dataclasses import dataclass


@dataclass(frozen=True)
class Theme:
    """Semantic attributes used by shell and screen renderers."""

    normal: int
    header: int
    footer: int
    nav_active: int
    nav_idle: int
    panel_title: int
    muted: int
    good: int
    bad: int
    warn: int
    table_header: int


def init_theme() -> Theme:
    """Initialize curses colors and return semantic attributes."""
    if not curses.has_colors():
        bold = curses.A_BOLD
        return Theme(
            normal=curses.A_NORMAL,
            header=bold,
            footer=bold,
            nav_active=curses.A_REVERSE,
            nav_idle=curses.A_NORMAL,
            panel_title=bold,
            muted=curses.A_DIM,
            good=bold,
            bad=bold,
            warn=bold,
            table_header=bold,
        )

    curses.start_color()
    try:
        curses.use_default_colors()
    except curses.error:
        pass

    curses.init_pair(1, curses.COLOR_BLACK, curses.COLOR_CYAN)
    curses.init_pair(2, curses.COLOR_BLACK, curses.COLOR_WHITE)
    curses.init_pair(3, curses.COLOR_CYAN, -1)
    curses.init_pair(4, curses.COLOR_GREEN, -1)
    curses.init_pair(5, curses.COLOR_RED, -1)
    curses.init_pair(6, curses.COLOR_YELLOW, -1)

    return Theme(
        normal=curses.A_NORMAL,
        header=curses.color_pair(1) | curses.A_BOLD,
        footer=curses.color_pair(2),
        nav_active=curses.color_pair(2) | curses.A_BOLD,
        nav_idle=curses.A_NORMAL,
        panel_title=curses.color_pair(3) | curses.A_BOLD,
        muted=curses.A_DIM,
        good=curses.color_pair(4) | curses.A_BOLD,
        bad=curses.color_pair(5) | curses.A_BOLD,
        warn=curses.color_pair(6) | curses.A_BOLD,
        table_header=curses.color_pair(3) | curses.A_BOLD,
    )
