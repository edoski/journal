"""Action-based key mappings for the redesigned shell TUI."""

from __future__ import annotations

import curses

KEY_ENTER = {10, 13, curses.KEY_ENTER}
KEY_ESC = {27}
KEY_BACKSPACE = {curses.KEY_BACKSPACE, 127, 8}


def is_enter(ch: int) -> bool:
    return ch in KEY_ENTER


def is_escape(ch: int) -> bool:
    return ch in KEY_ESC


def is_backspace(ch: int) -> bool:
    return ch in KEY_BACKSPACE


def resolve_global_action(ch: int) -> str | None:
    """Resolve keys available on every route."""
    mapping = {
        ord(":"): "open_palette",
        11: "open_palette",  # Ctrl+K
        ord("?"): "open_help",
        ord("/"): "open_search",
        ord("["): "anchor_prev",
        ord("]"): "anchor_next",
        ord("h"): "period_prev",
        ord("l"): "period_next",
        ord("q"): "quit",
        ord("r"): "refresh",
        ord("1"): "goto_dashboard",
        ord("2"): "goto_explorer",
        ord("3"): "goto_metric_lab",
        ord("4"): "goto_daily_editor",
        ord("5"): "goto_reminders",
        ord("6"): "goto_help",
        ord("t"): "jump_today",
        9: "focus_next",  # Tab
        curses.KEY_BTAB: "focus_prev",
        curses.KEY_RESIZE: "resize",
    }
    return mapping.get(ch)


def resolve_route_action(route: str, ch: int) -> str | None:
    """Resolve route-scoped actions."""
    route_maps: dict[str, dict[int, str]] = {
        "explorer": {
            ord("j"): "explorer_next_metric",
            curses.KEY_DOWN: "explorer_next_metric",
            ord("k"): "explorer_prev_metric",
            curses.KEY_UP: "explorer_prev_metric",
            curses.KEY_RIGHT: "explorer_next_breakdown",
            curses.KEY_LEFT: "explorer_prev_breakdown",
            ord("n"): "explorer_next_breakdown",
            ord("p"): "explorer_prev_breakdown",
            10: "explorer_open_metric_lab",
            13: "explorer_open_metric_lab",
            curses.KEY_ENTER: "explorer_open_metric_lab",
        },
        "metric_lab": {
            ord("j"): "metric_lab_next_metric",
            curses.KEY_DOWN: "metric_lab_next_metric",
            ord("k"): "metric_lab_prev_metric",
            curses.KEY_UP: "metric_lab_prev_metric",
            ord("+"): "metric_lab_lookback_inc",
            ord("="): "metric_lab_lookback_inc",
            ord("-"): "metric_lab_lookback_dec",
        },
        "daily_editor": {
            ord("f"): "daily_frontmatter_form",
            ord("g"): "daily_goals_form",
            ord("s"): "daily_section_form",
            ord("n"): "daily_next_day",
            ord("p"): "daily_prev_day",
        },
        "reminders": {
            ord("j"): "reminders_next",
            curses.KEY_DOWN: "reminders_next",
            ord("k"): "reminders_prev",
            curses.KEY_UP: "reminders_prev",
            ord("a"): "reminders_add_form",
            ord("d"): "reminders_delete",
        },
    }
    route_map = route_maps.get(route, {})
    return route_map.get(ch)
