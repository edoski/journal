"""Key handling constants for the journal TUI."""

from __future__ import annotations

import curses

KEY_ENTER = {10, 13, curses.KEY_ENTER}
KEY_BACK = {27, ord("q")}
KEY_PIVOT = {9}  # Tab


def is_enter(ch: int) -> bool:
    return ch in KEY_ENTER


def is_back(ch: int) -> bool:
    return ch in KEY_BACK


def is_pivot(ch: int) -> bool:
    return ch in KEY_PIVOT
