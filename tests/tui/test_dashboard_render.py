from __future__ import annotations

import curses
import datetime

from sync.contracts.query import DashboardCard, DashboardSnapshot, MetricHistoryPoint
from tui.layout import Rect
from tui.screens import dashboard
from tui.theme import Theme


class _FakeWindow:
    def __init__(self, height: int, width: int) -> None:
        self.height = height
        self.width = width
        self.calls: list[tuple[int, int, str, int]] = []

    def getmaxyx(self) -> tuple[int, int]:
        return self.height, self.width

    def addstr(self, row: int, col: int, text: str, attr: int = 0) -> None:
        if row < 0 or row >= self.height:
            raise curses.error("row out of bounds")
        if col < 0 or col >= self.width:
            raise curses.error("col out of bounds")
        if len(text) > (self.width - col):
            raise curses.error("text overflow")
        self.calls.append((row, col, text, attr))


def _snapshot(alerts: tuple[str, ...] = tuple()) -> DashboardSnapshot:
    today = datetime.date(2026, 2, 13)
    trend = tuple(
        MetricHistoryPoint(
            label=f"W{idx}",
            start=today,
            end=today,
            value=float(idx),
            delta_pct=0.0,
            is_partial=False,
        )
        for idx in range(12)
    )
    return DashboardSnapshot(
        anchor_date=today,
        period_label="2026-W07",
        cards=(
            DashboardCard("study_minutes", "Study", 320.0, 8.0, 2520.0),
            DashboardCard("sleep_minutes", "Sleep", 470.0, -2.0, 480.0),
        ),
        alerts=alerts,
        trend_study=trend,
        trend_sleep=trend,
        trend_mood=trend,
    )


def test_dashboard_card_and_alert_builders():
    snap = _snapshot(alerts=("Missing daily note.",))
    cards = dashboard.build_card_lines(snap)
    alerts = dashboard.build_alert_lines(snap)

    assert cards
    assert "Study" in cards[0]
    assert alerts == ["- Missing daily note."]


def test_dashboard_render_handles_wide_and_narrow():
    theme = Theme(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    wide = _FakeWindow(height=36, width=160)
    narrow = _FakeWindow(height=8, width=28)

    dashboard.render(
        wide,  # type: ignore[arg-type]
        Rect(y=0, x=0, h=32, w=140),
        theme,
        _snapshot(),
    )
    dashboard.render(
        narrow,  # type: ignore[arg-type]
        Rect(y=0, x=0, h=5, w=18),
        theme,
        _snapshot(),
    )

    assert wide.calls
    assert any("Dashboard" in call[2] for call in wide.calls)
    assert any("Terminal too small." in call[2] for call in narrow.calls)
