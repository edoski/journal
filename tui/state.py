"""State container for the redesigned shell-based journal TUI."""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from typing import Callable, Literal

RouteName = Literal[
    "dashboard",
    "explorer",
    "metric_lab",
    "daily_editor",
    "reminders",
    "help",
]
PeriodKey = Literal["day", "week", "month", "quarter", "year"]
BreakdownTab = Literal["activity", "training", "screen_time"]

PERIOD_KEYS: list[PeriodKey] = ["day", "week", "month", "quarter", "year"]
ROUTE_ORDER: tuple[RouteName, ...] = (
    "dashboard",
    "explorer",
    "metric_lab",
    "daily_editor",
    "reminders",
    "help",
)
BREAKDOWN_TABS: tuple[BreakdownTab, ...] = ("activity", "training", "screen_time")
METRIC_LAB_LOOKBACK_DEFAULT: dict[PeriodKey, int] = {
    "day": 14,
    "week": 12,
    "month": 12,
    "quarter": 8,
    "year": 5,
}


@dataclass
class PendingPreview:
    """Pending change preview shown before interactive writes are confirmed."""

    title: str
    target_label: str
    diff_lines: list[str]
    success_message: str


@dataclass
class FormField:
    """Single editable field in a modal form."""

    label: str
    value: str = ""


@dataclass
class FormModal:
    """Modal form state for multi-field inline editing."""

    mode: str
    title: str
    fields: list[FormField]
    active_index: int = 0
    message: str = ""


@dataclass
class PaletteState:
    """Command-palette interaction state."""

    open: bool = False
    query: str = ""
    selected_index: int = 0


@dataclass
class ShellState:
    """Runtime state for routes, focus, overlays, and pending writes."""

    route: RouteName = "dashboard"
    anchor_date: datetime.date = field(default_factory=datetime.date.today)
    period: PeriodKey = "week"
    selected_metric: str = "study_minutes"
    pane_focus: int = 0
    explorer_metric_index: int = 0
    explorer_breakdown_tab: BreakdownTab = "activity"
    explorer_filter_query: str = ""
    reminders_filter_query: str = ""
    reminders_selected_index: int = 0
    message: str = ""
    palette: PaletteState = field(default_factory=PaletteState)
    modal: FormModal | None = None
    pending_preview: PendingPreview | None = None
    pending_apply: Callable[[], None] | None = None
    should_quit: bool = False

    def set_route(self, route: RouteName) -> None:
        self.route = route
        self.pane_focus = 0
        self.message = ""

    def cycle_period(self, delta: int) -> None:
        idx = PERIOD_KEYS.index(self.period)
        self.period = PERIOD_KEYS[(idx + delta) % len(PERIOD_KEYS)]

    def next_breakdown_tab(self, delta: int) -> None:
        idx = BREAKDOWN_TABS.index(self.explorer_breakdown_tab)
        self.explorer_breakdown_tab = BREAKDOWN_TABS[
            (idx + delta) % len(BREAKDOWN_TABS)
        ]

    def reset_palette(self) -> None:
        self.palette = PaletteState()


# Backward compatibility alias for older tests/import sites.
AppState = ShellState
