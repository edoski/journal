from __future__ import annotations

import curses
import datetime

from sync.contracts.query import (
    MetricDefinition,
    MetricHistoryPoint,
    MetricHistorySnapshot,
    PeriodMetricRow,
)
from tui.layout import Rect
from tui.screens import metric_lab
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


def test_metric_lab_index_lookup_and_render():
    defs = (
        MetricDefinition("study_minutes", "Study", "min", 0, True, 360.0),
        MetricDefinition("sleep_minutes", "Sleep", "min", 0, True, 480.0),
    )
    idx = metric_lab.metric_index_for_key(defs, "sleep_minutes")
    assert idx == 1

    row = PeriodMetricRow(
        key="study_minutes",
        label="Study",
        current=300.0,
        previous=280.0,
        delta_pct=7.0,
        moving_avg=290.0,
        target=2520.0,
    )
    win = _FakeWindow(height=40, width=160)
    theme = Theme(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    metric_lab.render(
        win,  # type: ignore[arg-type]
        Rect(y=0, x=0, h=36, w=140),
        theme,
        defs,
        selected_metric="study_minutes",
        row=row,
        history=_history(),
        lookback=12,
    )
    assert win.calls
    assert any("Metric Lab" in call[2] for call in win.calls)
