"""Tests for daily goal pipeline helpers."""

from __future__ import annotations

import datetime

from sync.dates import iso_week_range
from sync.goals.daily_pipeline import load_weekly_goals


class _StubNoteStore:
    def __init__(self, weekly_lines: list[str] | None) -> None:
        self._weekly_lines = weekly_lines

    def read(self, _path: str) -> list[str] | None:
        return None if self._weekly_lines is None else self._weekly_lines[:]

    def read_or_create(self, _path: str, _template_path: str) -> list[str]:
        return ["## Goals", "", "## Metrics", "---"]


class _CaptureGoalStore:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None, str | None]] = []

    def extract(
        self,
        _lines: list[str],
        section: str,
        horizon: str | None = None,
        period_key: str | None = None,
    ):
        self.calls.append((section, horizon, period_key))
        return []


def test_load_weekly_goals_uses_week_start_period_key():
    day = datetime.date(2026, 2, 6)
    week_start, _ = iso_week_range(day)
    note_store = _StubNoteStore(weekly_lines=["## Goals"])
    goal_store = _CaptureGoalStore()

    load_weekly_goals(
        day,
        note_store=note_store,
        goal_store=goal_store,
        journal_dir="/tmp/journal",
    )

    weekly_calls = [call for call in goal_store.calls if call[0] == "WEEKLY"]
    assert len(weekly_calls) == 1
    _, horizon, period_key = weekly_calls[0]
    assert horizon == "weekly"
    assert period_key == week_start.isoformat()
    assert period_key != day.isoformat()
