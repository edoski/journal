from __future__ import annotations

import datetime

from tui.commands import default_commands, filter_commands
from tui.runtime import AppRuntime
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
    def invalidate_cache(self) -> None:
        return

    def shift_anchor(self, period, anchor_date, delta):
        _ = period, delta
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


def test_command_filtering_matches_titles():
    commands = default_commands()
    filtered = filter_commands(commands, "Explorer")
    assert filtered
    assert any("Explorer" in item.title for item in filtered)


def test_palette_executes_selected_command(monkeypatch):
    runtime = _runtime(monkeypatch)
    runtime._dispatch_action("open_palette")
    runtime.state.palette.query = "Explorer"
    runtime.state.palette.selected_index = 0

    runtime._handle_palette_input(10)

    assert runtime.state.route == "explorer"
    assert runtime.state.palette.open is False
