from __future__ import annotations

import pytest

from sync.models import (
    DailySchedule,
    MonthlyLastDaySchedule,
    WeeklySchedule,
    YearlySchedule,
)
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
        _ = (period, delta)
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


def test_parse_schedule_input_accepts_daily(monkeypatch):
    runtime = _runtime(monkeypatch)

    schedule = runtime._parse_schedule_input("DAILY")

    assert schedule == DailySchedule()


def test_parse_schedule_input_accepts_other_canonical_tokens(monkeypatch):
    runtime = _runtime(monkeypatch)

    weekly = runtime._parse_schedule_input("WEEKLY:MON")
    monthly = runtime._parse_schedule_input("MONTHLY:LAST_DAY")
    yearly = runtime._parse_schedule_input("YEARLY:12-31")

    assert weekly == WeeklySchedule(weekday="MON")
    assert monthly == MonthlyLastDaySchedule()
    assert yearly == YearlySchedule(month=12, day=31)


def test_parse_schedule_input_rejects_invalid_daily(monkeypatch):
    runtime = _runtime(monkeypatch)

    with pytest.raises(ValueError, match="DAILY schedule must be DAILY"):
        runtime._parse_schedule_input("DAILY:MON")


def test_parse_schedule_input_rejects_noncanonical_case(monkeypatch):
    runtime = _runtime(monkeypatch)

    with pytest.raises(ValueError, match="SCHEDULE must be DAILY or KIND:VALUE"):
        runtime._parse_schedule_input("daily")
