"""State container for the journal TUI."""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from typing import Literal

ScreenName = Literal[
    "menu",
    "by_period",
    "by_metric",
    "edit_daily",
    "edit_reminders",
]
PeriodKey = Literal["day", "week", "month", "quarter", "year"]

METRIC_KEYS = [
    "study_minutes",
    "sleep_minutes",
    "mood",
    "workout_count",
    "stretch_count",
    "mindful_count",
    "interrupt_minutes",
    "overrun_minutes",
    "screen_time_total",
    "training_sessions_total",
]
PERIOD_KEYS: list[PeriodKey] = ["day", "week", "month", "quarter", "year"]


@dataclass
class AppState:
    """Runtime state for TUI screens and query controls."""

    screen: ScreenName = "menu"
    anchor_date: datetime.date = field(default_factory=datetime.date.today)
    period: PeriodKey = "week"
    metric: str = "study_minutes"
    selected_index: int = 0
    message: str = ""

    def pivot(self) -> None:
        """Switch between period and metric explorers."""
        if self.screen == "by_period":
            self.screen = "by_metric"
        elif self.screen == "by_metric":
            self.screen = "by_period"

    def cycle_period(self, delta: int) -> None:
        """Cycle period key with wraparound."""
        idx = PERIOD_KEYS.index(self.period)
        self.period = PERIOD_KEYS[(idx + delta) % len(PERIOD_KEYS)]

    def cycle_metric(self, delta: int) -> None:
        """Cycle metric key with wraparound."""
        idx = METRIC_KEYS.index(self.metric)
        self.metric = METRIC_KEYS[(idx + delta) % len(METRIC_KEYS)]
