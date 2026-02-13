"""Explorer route renderer with metric table and side breakdowns."""

from __future__ import annotations

import curses

from sync.contracts.query import (
    MetricHistorySnapshot,
    PeriodDetailSnapshot,
    PeriodMetricRow,
)
from tui.layout import Rect
from tui.theme import Theme
from tui.widgets.common import (
    draw_box,
    draw_lines,
    format_delta,
    format_metric_value,
    safe_addstr,
    sparkline,
)


def filtered_rows(detail: PeriodDetailSnapshot, query: str) -> list[PeriodMetricRow]:
    """Filter period metric rows by key/label."""
    token = query.strip().casefold()
    rows = list(detail.rows)
    if not token:
        return rows
    return [
        row
        for row in rows
        if token in row.key.casefold() or token in row.label.casefold()
    ]


def _breakdown_lines(detail: PeriodDetailSnapshot, tab: str) -> list[str]:
    if tab == "activity":
        rows = detail.activity_breakdown
    elif tab == "training":
        rows = detail.training_breakdown
    else:
        rows = detail.screen_time_breakdown
    if not rows:
        return ["No breakdown data."]
    lines = []
    for row in rows[:10]:
        percent = "-" if row.percent is None else f"{row.percent * 100:.0f}%"
        lines.append(f"{row.label:18} {row.value:8.1f} {percent:>5}")
    return lines


def render(
    stdscr: curses.window,
    body: Rect,
    theme: Theme,
    detail: PeriodDetailSnapshot,
    metric_rows: list[PeriodMetricRow],
    selected_index: int,
    breakdown_tab: str,
    history: MetricHistorySnapshot,
) -> None:
    """Render explorer table, side breakdown, and selected metric mini trend."""
    if body.h < 8 or body.w < 32:
        safe_addstr(stdscr, body.y, body.x, "Terminal too small.", theme.warn)
        return

    header = f"{detail.label}  {detail.start.isoformat()}..{detail.end.isoformat()}"
    safe_addstr(stdscr, body.y, body.x, header, theme.panel_title)

    table_h = max(6, body.h - 8)
    table_w = max(26, (body.w * 2) // 3)
    table_rect = Rect(body.y + 1, body.x, table_h, table_w)
    side_rect = Rect(body.y + 1, body.x + table_w, table_h, max(1, body.w - table_w))
    trend_rect = Rect(
        body.y + 1 + table_h, body.x, max(1, body.h - table_h - 1), body.w
    )

    draw_box(stdscr, table_rect, title="Metrics", title_attr=theme.panel_title)
    col_header = "Metric            Current    Prev   Delta      MA   Target"
    safe_addstr(
        stdscr, table_rect.y + 1, table_rect.x + 2, col_header, theme.table_header
    )

    rows_space = max(0, table_rect.h - 3)
    for idx, row in enumerate(metric_rows[:rows_space]):
        attr = theme.nav_active if idx == selected_index else theme.normal
        line = (
            f"{row.label:16} "
            f"{format_metric_value(row.current, 1 if row.key == 'mood' else 0):>8} "
            f"{format_metric_value(row.previous, 1 if row.key == 'mood' else 0):>7} "
            f"{format_delta(row.delta_pct):>7} "
            f"{format_metric_value(row.moving_avg, 1 if row.key == 'mood' else 0):>7} "
            f"{format_metric_value(row.target, 1 if row.key == 'mood' else 0):>8}"
        )
        safe_addstr(stdscr, table_rect.y + 2 + idx, table_rect.x + 2, line, attr)

    title = f"Breakdown: {breakdown_tab}"
    draw_box(stdscr, side_rect, title=title, title_attr=theme.panel_title)
    draw_lines(
        stdscr,
        Rect(side_rect.y + 1, side_rect.x + 2, side_rect.h - 2, side_rect.w - 4),
        _breakdown_lines(detail, breakdown_tab),
    )

    draw_box(
        stdscr, trend_rect, title="Selected Metric Trend", title_attr=theme.panel_title
    )
    chart_values = [point.value for point in history.points]
    chart = sparkline(chart_values, width=max(8, trend_rect.w - 10))
    safe_addstr(stdscr, trend_rect.y + 1, trend_rect.x + 2, chart, theme.normal)
