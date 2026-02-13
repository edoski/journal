from __future__ import annotations

from tui.state import AppState


def test_state_cycles_period_and_breakdown_tabs():
    state = AppState()

    state.cycle_period(1)
    assert state.period == "month"

    state.next_breakdown_tab(1)
    assert state.explorer_breakdown_tab == "training"


def test_state_set_route_resets_focus_and_message():
    state = AppState(route="dashboard", pane_focus=2, message="hello")
    state.set_route("explorer")
    assert state.route == "explorer"
    assert state.pane_focus == 0
    assert state.message == ""
