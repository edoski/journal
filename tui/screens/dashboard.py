"""Dashboard route renderer for the shell command center."""

from __future__ import annotations

import curses

from sync.contracts.query import DashboardSnapshot
from tui.layout import Rect
from tui.theme import Theme
from tui.widgets.common import (
    clip_text,
    draw_box,
    draw_lines,
    format_delta,
    format_metric_value,
    progress_bar,
    safe_addstr,
    sparkline,
)


def build_card_lines(snapshot: DashboardSnapshot) -> list[str]:
    """Build compact KPI card lines from dashboard snapshot cards."""
    lines: list[str] = []
    for card in snapshot.cards:
        value = format_metric_value(
            card.value, precision=1 if card.key == "mood" else 0
        )
        delta = format_delta(card.delta_pct)
        if card.target is None:
            target_part = ""
        else:
            target_part = f" {progress_bar(card.value, card.target)}"
        lines.append(f"{card.label:14} {value:>8}  {delta:>6}{target_part}")
    return lines


def build_alert_lines(snapshot: DashboardSnapshot) -> list[str]:
    """Build deterministic alert rail lines."""
    if not snapshot.alerts:
        return ["No alerts."]
    return [f"- {item}" for item in snapshot.alerts]


def _trend_line(label: str, points: list[float | int | None], width: int) -> str:
    chart = sparkline(points, width=max(8, width - 14))
    return f"{label:8} {chart}"


def render(
    stdscr: curses.window,
    body: Rect,
    theme: Theme,
    snapshot: DashboardSnapshot,
) -> None:
    """Render dashboard cards, alerts, and compact trend strips."""
    if body.h < 6 or body.w < 20:
        safe_addstr(stdscr, body.y, body.x, "Terminal too small.", theme.warn)
        return

    upper_h = max(8, body.h // 2)
    cards_rect = Rect(body.y, body.x, upper_h, body.w)
    lower_rect = Rect(body.y + upper_h, body.x, max(1, body.h - upper_h), body.w)

    draw_box(stdscr, cards_rect, title="Dashboard", title_attr=theme.panel_title)
    card_lines = build_card_lines(snapshot)
    draw_lines(
        stdscr,
        Rect(cards_rect.y + 1, cards_rect.x + 2, cards_rect.h - 2, cards_rect.w - 4),
        card_lines,
    )

    if lower_rect.h < 4:
        return

    split = max(28, lower_rect.w // 3)
    alerts_rect = Rect(
        lower_rect.y, lower_rect.x, lower_rect.h, min(split, lower_rect.w)
    )
    trends_rect = Rect(
        lower_rect.y,
        lower_rect.x + alerts_rect.w,
        lower_rect.h,
        max(1, lower_rect.w - alerts_rect.w),
    )

    draw_box(stdscr, alerts_rect, title="Alerts", title_attr=theme.panel_title)
    draw_lines(
        stdscr,
        Rect(
            alerts_rect.y + 1, alerts_rect.x + 2, alerts_rect.h - 2, alerts_rect.w - 4
        ),
        [
            clip_text(line, max(1, alerts_rect.w - 4))
            for line in build_alert_lines(snapshot)
        ],
        theme.warn if snapshot.alerts else theme.muted,
    )

    draw_box(stdscr, trends_rect, title="Trends (12)", title_attr=theme.panel_title)
    trend_values = [
        _trend_line(
            "Study",
            [point.value for point in snapshot.trend_study],
            trends_rect.w - 4,
        ),
        _trend_line(
            "Sleep",
            [point.value for point in snapshot.trend_sleep],
            trends_rect.w - 4,
        ),
        _trend_line(
            "Mood",
            [point.value for point in snapshot.trend_mood],
            trends_rect.w - 4,
        ),
    ]
    draw_lines(
        stdscr,
        Rect(
            trends_rect.y + 1, trends_rect.x + 2, trends_rect.h - 2, trends_rect.w - 4
        ),
        trend_values,
        theme.normal,
    )
