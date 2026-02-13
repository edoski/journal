"""Reminders editor renderer with list/filter and staged diff preview."""

from __future__ import annotations

import curses

from sync.models import ReminderRule
from tui.layout import Rect
from tui.state import FormModal, PendingPreview
from tui.theme import Theme
from tui.widgets.common import draw_box, draw_lines, safe_addstr


def filtered_rules(rules: list[ReminderRule], query: str) -> list[ReminderRule]:
    """Filter reminder rules by schedule/body query."""
    token = query.strip().casefold()
    if not token:
        return list(rules)
    return [
        rule
        for rule in rules
        if token in f"{rule.schedule_kind}:{rule.schedule_value}".casefold()
        or token in rule.body.casefold()
    ]


def _preview_lines(pending_preview: PendingPreview | None) -> list[str]:
    if pending_preview is None:
        return ["No pending changes."]
    return [
        pending_preview.title,
        f"Target: {pending_preview.target_label}",
        "",
        *pending_preview.diff_lines,
    ]


def render(
    stdscr: curses.window,
    body: Rect,
    theme: Theme,
    rules: list[ReminderRule],
    selected_index: int,
    filter_query: str,
    message: str,
    pending_preview: PendingPreview | None,
    modal: FormModal | None,
) -> None:
    """Render reminders list, filter state, and diff preview."""
    left_w = max(42, body.w // 2)
    left_rect = Rect(body.y, body.x, body.h, left_w)
    right_rect = Rect(body.y, body.x + left_w, body.h, max(1, body.w - left_w))

    draw_box(stdscr, left_rect, title="Reminders", title_attr=theme.panel_title)
    safe_addstr(
        stdscr,
        left_rect.y + 1,
        left_rect.x + 2,
        f"Filter: {filter_query or '(none)'}",
        theme.table_header,
    )
    safe_addstr(
        stdscr,
        left_rect.y + 2,
        left_rect.x + 2,
        "j/k: move  a: add  d: delete  /: filter",
        theme.muted,
    )

    rows = filtered_rules(rules, filter_query)
    visible = max(0, left_rect.h - 6)
    for idx, rule in enumerate(rows[:visible]):
        label = f"{rule.schedule_kind}:{rule.schedule_value}"
        attr = theme.nav_active if idx == selected_index else theme.normal
        safe_addstr(
            stdscr,
            left_rect.y + 4 + idx,
            left_rect.x + 2,
            f"{label:20} {rule.body}",
            attr,
        )

    if message:
        safe_addstr(
            stdscr, left_rect.y + left_rect.h - 2, left_rect.x + 2, message, theme.warn
        )

    draw_box(stdscr, right_rect, title="Expected Changes", title_attr=theme.panel_title)
    draw_lines(
        stdscr,
        Rect(right_rect.y + 1, right_rect.x + 2, right_rect.h - 2, right_rect.w - 4),
        _preview_lines(pending_preview),
    )

    if modal is not None:
        safe_addstr(
            stdscr,
            left_rect.y + 3,
            left_rect.x + 2,
            f"Form: {modal.title}",
            theme.good,
        )
