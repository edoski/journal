"""Service-level tests for period synchronization orchestration."""

from __future__ import annotations

import datetime

from sync.application.period_sync_service import PeriodSyncService
from sync.goals.period_pipeline import MirrorSyncResult, PiercingSyncResult
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


class _StubAggregateSource:
    def load_for_dates(self, dates: list[datetime.date]):
        return {day: {} for day in dates}


class _StubGoalStore:
    def extract(
        self,
        _lines: list[str],
        _section: str,
        horizon: str | None = None,
        period_key: str | None = None,
    ):
        _ = horizon, period_key
        return []

    def apply(self, lines: list[str], _sections):
        return lines

    def write(self, _path: str, lines: list[str], _sections):
        return lines


def test_sync_week_uses_engine_and_cleanup(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=_StubAggregateSource(),
        goal_store=_StubGoalStore(),
    )

    day = datetime.date(2026, 2, 6)
    window = build_week_window(day)
    note_path = str(tmp_path / window.filename)

    base_dir = tmp_path / "journal"
    base_dir.mkdir()

    monkeypatch.setattr(
        "sync.application.period_sync_service.journal_path",
        lambda filename: str(base_dir / filename),
    )
    monkeypatch.setattr(
        "sync.application.period_sync_service.load_quarterly_goals",
        lambda _month_start: ([], [], str(base_dir / "2026-Q1.md"), []),
    )
    monkeypatch.setattr(
        "sync.application.period_sync_service.build_weekly_metrics",
        lambda *_a, **_kw: ["### **SUMMARY**", "", "week"],
    )
    monkeypatch.setattr(
        "sync.application.period_sync_service.load_source_tasks_with_carry_forward",
        lambda *_a, **_kw: [],
    )
    monkeypatch.setattr(
        "sync.application.period_sync_service.sync_mirror_section",
        lambda *_a, **_kw: MirrorSyncResult([], [], False, []),
    )
    monkeypatch.setattr(
        "sync.application.period_sync_service.sync_pierced_source_section",
        lambda *_a, **_kw: PiercingSyncResult([], [[], []], [False, False]),
    )
    monkeypatch.setattr(
        "sync.application.period_sync_service.write_note_metrics",
        lambda path, lines, metrics_block, store: store.write(
            path, lines + metrics_block
        ),
    )

    cleanup_calls: list[tuple[bool, str, str, list[str]]] = []

    def _record_cleanup(*, enabled, previous_note_path, module_name, module_args):
        cleanup_calls.append((enabled, previous_note_path, module_name, module_args))
        return False

    monkeypatch.setattr(
        "sync.application.period_sync_service.maybe_cleanup_previous",
        _record_cleanup,
    )

    service.sync_week(window, note_path, cleanup_previous=True)

    written = note_store.read(note_path)
    assert written is not None
    assert written[-1] == "week"
    assert cleanup_calls
    enabled, _prev_path, module_name, module_args = cleanup_calls[0]
    assert enabled is True
    assert module_name == "sync.periods.weekly"
    assert module_args[-1] == "--no-cleanup"


def test_sync_year_applies_carry_forward(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=_StubAggregateSource(),
        goal_store=_StubGoalStore(),
    )

    window = build_year_window(2026)
    note_path = str(tmp_path / window.filename)

    base_dir = tmp_path / "journal"
    base_dir.mkdir()
    monkeypatch.setattr(
        "sync.application.period_sync_service.journal_path",
        lambda filename: str(base_dir / filename),
    )
    monkeypatch.setattr(
        "sync.application.period_sync_service.build_yearly_metrics",
        lambda *_a, **_kw: ["### **SUMMARY**", "", "year"],
    )
    monkeypatch.setattr(
        "sync.application.period_sync_service.write_note_metrics",
        lambda path, lines, metrics_block, store: store.write(
            path, lines + metrics_block
        ),
    )

    carry_calls: list[tuple[str, str]] = []

    def _carry(prev_tasks, current_tasks, period_key, horizon):
        _ = prev_tasks, current_tasks
        carry_calls.append((period_key, horizon))
        return [], 0

    monkeypatch.setattr(
        "sync.application.period_sync_service.carry_forward_with_tombstones",
        _carry,
    )

    service.sync_year(window, note_path)

    assert carry_calls == [("2026", "yearly")]
    written = note_store.read(note_path)
    assert written is not None
    assert written[-1] == "year"
