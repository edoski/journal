"""Metric-lab route renderer."""

from __future__ import annotations

import curses

from sync.contracts.query import (
    MetricDefinition,
    MetricHistorySnapshot,
    PeriodMetricRow,
)
from tui.layout import Rect
from tui.theme import Theme
from tui.widgets.common import (
    draw_box,
    format_delta,
    format_metric_value,
    progress_bar,
    safe_addstr,
    sparkline,
)


def metric_index_for_key(definitions: tuple[MetricDefinition, ...], key: str) -> int:
    """Return metric index for key, falling back to first item."""
    for idx, definition in enumerate(definitions):
        if definition.key == key:
            return idx
    return 0


def render(
    stdscr: curses.window,
    body: Rect,
    theme: Theme,
    definitions: tuple[MetricDefinition, ...],
    selected_metric: str,
    row: PeriodMetricRow | None,
    history: MetricHistorySnapshot,
    lookback: int,
) -> None:
    """Render left metric selector and right detail/history panel."""
    if body.h < 8 or body.w < 32:
        safe_addstr(stdscr, body.y, body.x, "Terminal too small.", theme.warn)
        return

    left_w = max(22, body.w // 3)
    left_rect = Rect(body.y, body.x, body.h, left_w)
    right_rect = Rect(body.y, body.x + left_w, body.h, max(1, body.w - left_w))

    draw_box(stdscr, left_rect, title="Metrics", title_attr=theme.panel_title)
    selected_idx = metric_index_for_key(definitions, selected_metric)
    for idx, definition in enumerate(definitions[: max(0, left_rect.h - 2)]):
        attr = theme.nav_active if idx == selected_idx else theme.normal
        safe_addstr(
            stdscr, left_rect.y + 1 + idx, left_rect.x + 2, definition.label, attr
        )

    draw_box(stdscr, right_rect, title="Metric Lab", title_attr=theme.panel_title)
    if row is None:
        safe_addstr(
            stdscr, right_rect.y + 1, right_rect.x + 2, "No metric data.", theme.warn
        )
        return

    safe_addstr(
        stdscr,
        right_rect.y + 1,
        right_rect.x + 2,
        f"Metric: {row.label} ({history.period})  Window: {lookback}",
        theme.table_header,
    )
    safe_addstr(
        stdscr,
        right_rect.y + 2,
        right_rect.x + 2,
        f"Current: {format_metric_value(row.current, 1 if row.key == 'mood' else 0)}",
    )
    safe_addstr(
        stdscr,
        right_rect.y + 3,
        right_rect.x + 2,
        f"Previous: {format_metric_value(row.previous, 1 if row.key == 'mood' else 0)}",
    )
    safe_addstr(
        stdscr,
        right_rect.y + 4,
        right_rect.x + 2,
        f"Delta: {format_delta(row.delta_pct)}",
    )
    if row.target is not None:
        safe_addstr(
            stdscr,
            right_rect.y + 5,
            right_rect.x + 2,
            f"Target: {format_metric_value(row.target, 1 if row.key == 'mood' else 0)}",
        )
        safe_addstr(
            stdscr,
            right_rect.y + 6,
            right_rect.x + 2,
            progress_bar(row.current, row.target, width=max(10, right_rect.w - 12)),
        )

    chart = sparkline(
        [point.value for point in history.points],
        width=max(12, right_rect.w - 6),
    )
    safe_addstr(
        stdscr, right_rect.y + 8, right_rect.x + 2, "History", theme.table_header
    )
    safe_addstr(stdscr, right_rect.y + 9, right_rect.x + 2, chart)
