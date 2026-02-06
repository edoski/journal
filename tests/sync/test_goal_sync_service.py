"""Service-level tests for canonical goal synchronization flows."""

from __future__ import annotations

import datetime

from sync.application.goal_sync_service import GoalSyncService
from sync.goals.period_pipeline import MirrorSyncResult, PiercingSyncResult
from sync.models.goals import Goal
from sync.periods.windows import build_week_window, build_year_window


class _StubNoteStore:
    def __init__(self) -> None:
        self._notes: dict[str, list[str]] = {}

    def read(self, path: str) -> list[str] | None:
        lines = self._notes.get(path)
        return lines[:] if lines is not None else None

    def read_or_create(self, path: str, _template_path: str) -> list[str]:
        lines = self._notes.get(path)
        if lines is None:
            lines = ["## Goals", "", "## Metrics", "---", "", "## Reflections", ""]
            self._notes[path] = lines
        return lines[:]

    def write(self, path: str, lines: list[str]) -> None:
        self._notes[path] = lines[:]


class _StubGoalStore:
    def __init__(self) -> None:
        self.last_sections = []

    def extract(
        self,
        _lines: list[str],
        _section: str,
        horizon: str | None = None,
        period_key: str | None = None,
    ):
        _ = horizon, period_key
        return []

    def apply(self, lines: list[str], sections):
        self.last_sections = sections
        return lines

    def write(self, _path: str, lines: list[str], _sections):
        return lines


def test_sync_weekly_note_builds_monthly_and_weekly_sections(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    goal_store = _StubGoalStore()
    service = GoalSyncService(note_store=note_store, goal_store=goal_store)

    window = build_week_window(datetime.date(2026, 2, 6))
    note_path = str(tmp_path / window.filename)

    base_dir = tmp_path / "journal"
    base_dir.mkdir()
    monkeypatch.setattr(
        "sync.application.goal_sync_service.journal_path",
        lambda filename: str(base_dir / filename),
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_service.load_quarterly_goals",
        lambda _month_start: ([], [], str(base_dir / "2026-Q1.md"), []),
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_service.load_source_tasks_with_carry_forward",
        lambda *_a, **_kw: [],
    )
    mirror_today_calls: list[datetime.date] = []
    pierce_today_calls: list[datetime.date] = []

    def _mirror_stub(*_args, **kwargs):
        mirror_today_calls.append(kwargs["today"])
        return MirrorSyncResult([], [], False, ["mirror"])

    def _pierce_stub(*_args, **kwargs):
        pierce_today_calls.append(kwargs["today"])
        return PiercingSyncResult(["source"], [[], []], [False, False])

    monkeypatch.setattr(
        "sync.application.goal_sync_service.sync_mirror_section",
        _mirror_stub,
    )
    monkeypatch.setattr(
        "sync.application.goal_sync_service.sync_pierced_source_section",
        _pierce_stub,
    )

    lines = note_store.read_or_create(note_path, "unused")
    updated = service.sync_weekly_note(lines, note_path=note_path, window=window)

    assert updated == lines
    assert len(goal_store.last_sections) == 2
    assert goal_store.last_sections[0].section == "MONTHLY"
    assert goal_store.last_sections[0].lines == ["mirror"]
    assert goal_store.last_sections[1].section == "WEEKLY"
    assert goal_store.last_sections[1].lines == ["source"]
    assert mirror_today_calls == [window.target_date]
    assert pierce_today_calls == [window.target_date]


def test_sync_yearly_note_uses_carry_forward(monkeypatch):
    note_store = _StubNoteStore()
    goal_store = _StubGoalStore()
    service = GoalSyncService(note_store=note_store, goal_store=goal_store)

    window = build_year_window(2026)
    lines = ["## Goals", "", "## Metrics"]

    carry_calls = []

    def _carry(prev_tasks, current_tasks, period_key, horizon):
        carry_calls.append((prev_tasks, current_tasks, period_key, horizon))
        return (
            [
                Goal(
                    body="Ship refactor",
                    done=False,
                    id="gid-1234567890",
                )
            ],
            1,
        )

    monkeypatch.setattr(
        "sync.application.goal_sync_service.carry_forward_with_tombstones",
        _carry,
    )

    updated = service.sync_yearly_note(lines, window=window)

    assert updated == lines
    assert len(carry_calls) == 1
    assert carry_calls[0][2:] == ("2026", "yearly")
    assert len(goal_store.last_sections) == 1
    assert goal_store.last_sections[0].section == "YEARLY"
