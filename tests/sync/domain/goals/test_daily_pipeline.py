"""Tests for goal note gateway period-key handling."""

from __future__ import annotations

import datetime

from sync.application.goal_note_gateway import GoalNoteGateway
from sync.dates import iso_week_range


class _StubNoteStore:
    def __init__(self, weekly_lines: list[str] | None) -> None:
        self._weekly_lines = weekly_lines

    def read(self, _path: str) -> list[str] | None:
        return None if self._weekly_lines is None else self._weekly_lines[:]

    def read_or_create(self, _path: str, _template_path: str) -> list[str]:
        return ["## Goals", "", "## Metrics", "---"]

    def write(self, _path: str, _lines: list[str]) -> None:
        raise AssertionError("write should not be called")


class _CaptureGoalStore:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None, str | None]] = []

    def extract(
        self,
        _lines: list[str],
        section: str,
        horizon: str | None = None,
        period_key: str | None = None,
    ) -> list[object]:
        self.calls.append((section, horizon, period_key))
        return []

    def apply(self, lines: list[str], _sections: list[object]) -> list[str]:
        return lines

    def write(self, _path: str, lines: list[str], _sections: list[object]) -> list[str]:
        return lines


def test_load_daily_sources_uses_week_start_period_key() -> None:
    day = datetime.date(2026, 2, 6)
    week_start, _ = iso_week_range(day)
    goal_store = _CaptureGoalStore()
    gateway = GoalNoteGateway(
        note_store=_StubNoteStore(weekly_lines=["## Goals"]),
        goal_store=goal_store,
    )

    gateway.load_daily_sources(day)

    weekly_calls = [call for call in goal_store.calls if call[0] == "WEEKLY"]
    assert len(weekly_calls) == 1
    _, horizon, period_key = weekly_calls[0]
    assert horizon == "weekly"
    assert period_key == week_start.isoformat()
    assert period_key != day.isoformat()
