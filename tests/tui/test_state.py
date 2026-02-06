from __future__ import annotations

from tui.state import AppState


def test_state_pivot_roundtrip():
    state = AppState(screen="by_period")
    state.pivot()
    assert state.screen == "by_metric"
    state.pivot()
    assert state.screen == "by_period"


def test_state_cycles_period_and_metric():
    state = AppState(period="week", metric="study_minutes")

    state.cycle_period(1)
    assert state.period == "month"

    state.cycle_metric(1)
    assert state.metric != "study_minutes"
