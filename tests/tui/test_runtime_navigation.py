from __future__ import annotations

import datetime

from tui.runtime import AppRuntime
from tui.state import FormField, FormModal
from tui.theme import Theme


class _FakeWindow:
    def keypad(self, _value: bool) -> None:
        return

    def getmaxyx(self) -> tuple[int, int]:
        return (40, 140)

    def erase(self) -> None:
        return

    def refresh(self) -> None:
        return

    def getch(self) -> int:
        return ord("q")

    def addstr(self, *_args, **_kwargs) -> None:
        return


class _StubRepo:
    def __init__(self) -> None:
        self.invalidations = 0

    def invalidate_cache(self) -> None:
        self.invalidations += 1

    def shift_anchor(self, period, anchor_date, delta):
        _ = period
        return anchor_date + datetime.timedelta(days=delta)


def _runtime(monkeypatch) -> AppRuntime:
    monkeypatch.setattr(
        "tui.runtime.init_theme",
        lambda: Theme(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    )
    return AppRuntime(
        stdscr=_FakeWindow(),  # type: ignore[arg-type]
        repo=_StubRepo(),  # type: ignore[arg-type]
        daily_store=object(),  # type: ignore[arg-type]
        reminders_store=object(),  # type: ignore[arg-type]
    )


def test_runtime_route_switch_and_focus(monkeypatch):
    runtime = _runtime(monkeypatch)
    runtime._dispatch_action("goto_explorer")
    assert runtime.state.route == "explorer"

    runtime._dispatch_action("focus_next")
    runtime._dispatch_action("focus_next")
    assert runtime.state.pane_focus == 2
    runtime._dispatch_action("focus_prev")
    assert runtime.state.pane_focus == 1


def test_runtime_quit_guard_for_palette_and_modal(monkeypatch):
    runtime = _runtime(monkeypatch)

    runtime._dispatch_action("open_palette")
    runtime._handle_key(ord("q"))
    assert runtime.state.should_quit is False

    runtime.state.reset_palette()
    runtime.state.modal = FormModal("x", "Form", [FormField("Field", "")])
    runtime._handle_key(ord("q"))
    assert runtime.state.should_quit is False

    runtime.state.modal = None
    runtime._handle_key(ord("q"))
    assert runtime.state.should_quit is True
