from __future__ import annotations

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
    def __init__(self) -> None:
        self.invalidations = 0

    def invalidate_cache(self) -> None:
        self.invalidations += 1

    def shift_anchor(self, period, anchor_date, delta):
        _ = period
        return anchor_date


class _StubDailyStore:
    pass


class _StubRemindersStore:
    pass


def _runtime(monkeypatch) -> AppRuntime:
    monkeypatch.setattr(
        "tui.runtime.init_theme",
        lambda: Theme(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    )
    return AppRuntime(
        stdscr=_FakeWindow(),  # type: ignore[arg-type]
        repo=_StubRepo(),  # type: ignore[arg-type]
        daily_store=_StubDailyStore(),  # type: ignore[arg-type]
        reminders_store=_StubRemindersStore(),  # type: ignore[arg-type]
    )


def test_pending_change_blocks_mutating_keys_until_confirmed(monkeypatch):
    runtime = _runtime(monkeypatch)
    writes = 0

    def apply() -> None:
        nonlocal writes
        writes += 1

    runtime._stage_pending_change(
        title="Update test data",
        target_label="/tmp/test.md",
        before_lines=["old"],
        after_lines=["new"],
        success_message="Applied staged change",
        apply=apply,
    )
    runtime._handle_key(ord("f"))

    assert writes == 0
    assert runtime.state.pending_preview is not None


def test_pending_change_confirm_writes_and_clears_preview(monkeypatch):
    runtime = _runtime(monkeypatch)
    writes = 0

    def apply() -> None:
        nonlocal writes
        writes += 1

    runtime._stage_pending_change(
        title="Update test data",
        target_label="/tmp/test.md",
        before_lines=["old"],
        after_lines=["new"],
        success_message="Updated frontmatter mood",
        apply=apply,
    )
    runtime._handle_key(10)

    assert writes == 1
    assert runtime.state.pending_preview is None
    assert runtime.state.message == "Updated frontmatter mood"


def test_pending_change_cancel_drops_staged_write(monkeypatch):
    runtime = _runtime(monkeypatch)
    writes = 0

    def apply() -> None:
        nonlocal writes
        writes += 1

    runtime._stage_pending_change(
        title="Update test data",
        target_label="/tmp/test.md",
        before_lines=["old"],
        after_lines=["new"],
        success_message="Applied staged change",
        apply=apply,
    )
    runtime._handle_key(27)

    assert writes == 0
    assert runtime.state.pending_preview is None
    assert runtime.state.message == "Cancelled pending change."
