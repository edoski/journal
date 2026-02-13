from __future__ import annotations

import curses
import datetime

from sync.contracts.query import (
    BreakdownRow,
    MetricHistoryPoint,
    MetricHistorySnapshot,
    PeriodDetailSnapshot,
    PeriodMetricRow,
)
from tui.layout import Rect
from tui.screens import explorer
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


def _detail() -> PeriodDetailSnapshot:
    today = datetime.date(2026, 2, 13)
    return PeriodDetailSnapshot(
        period="week",
        start=today - datetime.timedelta(days=6),
        end=today,
        label="2026-W07",
        rows=(
            PeriodMetricRow("study_minutes", "Study", 300.0, 280.0, 7.0, 290.0, 2520.0),
            PeriodMetricRow("sleep_minutes", "Sleep", 470.0, 460.0, 2.0, 465.0, 480.0),
        ),
        activity_breakdown=(BreakdownRow("Writing", 180.0, 0.6),),
        training_breakdown=(BreakdownRow("Workout", 50.0, 0.7),),
        screen_time_breakdown=(BreakdownRow("YouTube", 40.0, 0.8),),
        days_total=7,
        days_with_data=7,
    )


def _history() -> MetricHistorySnapshot:
    today = datetime.date(2026, 2, 13)
    return MetricHistorySnapshot(
        metric="study_minutes",
        period="week",
        anchor_label="2026-W07",
        current=300.0,
        previous=280.0,
        delta_pct=7.0,
        points=tuple(
            MetricHistoryPoint(
                label=f"W{idx}",
                start=today,
                end=today,
                value=float(idx),
                delta_pct=0.0,
                is_partial=False,
            )
            for idx in range(12)
        ),
    )


def test_explorer_filtering_and_render():
    detail = _detail()
    rows = explorer.filtered_rows(detail, "study")
    assert len(rows) == 1
    assert rows[0].key == "study_minutes"

    win = _FakeWindow(height=40, width=160)
    theme = Theme(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    explorer.render(
        win,  # type: ignore[arg-type]
        Rect(y=0, x=0, h=36, w=140),
        theme,
        detail,
        list(detail.rows),
        selected_index=0,
        breakdown_tab="activity",
        history=_history(),
    )

    assert win.calls
    assert any("Metrics" in call[2] for call in win.calls)
