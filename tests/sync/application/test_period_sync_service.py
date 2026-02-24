"""Service-level tests for period synchronization orchestration."""

from __future__ import annotations

import datetime

from sync.application.period_sync_service import PeriodSyncService
from sync.contracts.media import MediaBundle
from sync.contracts.schedule import DayScheduleProfile
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


class _StubGoalSyncService:
    def __init__(self) -> None:
        self.week_calls = 0
        self.month_calls = 0
        self.quarter_calls = 0
        self.year_calls = 0

    def sync_weekly_note(self, lines, *, note_path, window):
        _ = note_path, window
        self.week_calls += 1
        return lines

    def sync_monthly_note(self, lines, *, note_path, window):
        _ = note_path, window
        self.month_calls += 1
        return lines

    def sync_quarterly_note(self, lines, *, note_path, window):
        _ = note_path, window
        self.quarter_calls += 1
        return lines

    def sync_yearly_note(self, lines, *, window):
        _ = window
        self.year_calls += 1
        return lines


class _StubMediaSource:
    def __init__(self) -> None:
        self.calls: list[tuple[datetime.date, datetime.date]] = []

    def scan(self, start: datetime.date, end: datetime.date) -> MediaBundle:
        self.calls.append((start, end))
        return MediaBundle(books=[], podcasts=[])


class _StubScheduleSource:
    def resolve_day(self, _day: datetime.date) -> DayScheduleProfile:
        return DayScheduleProfile(
            study_start=datetime.time(8, 0),
            study_end=datetime.time(18, 0),
            lunch_start=datetime.time(13, 0),
            lunch_end=datetime.time(14, 0),
            workout_start=datetime.time(18, 0),
            is_off_day=False,
        )


def test_sync_week_uses_goal_service_and_cleanup(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    goal_sync_service = _StubGoalSyncService()
    media_source = _StubMediaSource()
    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=_StubAggregateSource(),
        media_source=media_source,
        schedule_source=_StubScheduleSource(),
        goal_sync_service=goal_sync_service,
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
    captured_study_target: list[int | None] = []

    def _stub_build_weekly_metrics(*_a, **kwargs):
        captured_study_target.append(kwargs.get("study_target_minutes"))
        return ["### **SUMMARY**", "", "week"]

    monkeypatch.setattr(
        "sync.application.period_sync_service.build_weekly_metrics",
        _stub_build_weekly_metrics,
    )
    monkeypatch.setattr(
        "sync.application.period_sync_service.write_note_metrics",
        lambda path, lines, metrics_block, store: store.write(
            path, lines + metrics_block
        ),
    )

    cleanup_calls: list[tuple[bool, str, object | None]] = []

    def _record_cleanup(*, enabled, previous_note_path, rerun):
        cleanup_calls.append((enabled, previous_note_path, rerun))
        return False

    monkeypatch.setattr(
        "sync.application.period_sync_service.maybe_cleanup_previous",
        _record_cleanup,
    )

    def _cleanup_runner() -> None:
        return None

    service.sync_week(
        window,
        note_path,
        cleanup_previous=True,
        cleanup_previous_runner=_cleanup_runner,
    )

    written = note_store.read(note_path)
    assert written is not None
    assert written[-1] == "week"
    assert goal_sync_service.week_calls == 1
    assert cleanup_calls
    enabled, _prev_path, rerun = cleanup_calls[0]
    assert enabled is True
    assert callable(rerun)
    assert media_source.calls == [(window.start, window.end)]
    assert captured_study_target == [2520]


def test_sync_year_uses_goal_service(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    goal_sync_service = _StubGoalSyncService()
    media_source = _StubMediaSource()
    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=_StubAggregateSource(),
        media_source=media_source,
        schedule_source=_StubScheduleSource(),
        goal_sync_service=goal_sync_service,
    )

    window = build_year_window(2026)
    note_path = str(tmp_path / window.filename)

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

    service.sync_year(window, note_path)

    written = note_store.read(note_path)
    assert written is not None
    assert written[-1] == "year"
    assert goal_sync_service.year_calls == 1
    assert media_source.calls == [(window.start, window.end)]


def test_sync_week_passes_none_when_schedule_resolution_fails(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    goal_sync_service = _StubGoalSyncService()
    media_source = _StubMediaSource()

    class _RaisingScheduleSource:
        def resolve_day(self, _day: datetime.date) -> DayScheduleProfile:
            raise ValueError("invalid schedule")

    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=_StubAggregateSource(),
        media_source=media_source,
        schedule_source=_RaisingScheduleSource(),
        goal_sync_service=goal_sync_service,
    )

    day = datetime.date(2026, 2, 6)
    window = build_week_window(day)
    note_path = str(tmp_path / window.filename)

    captured_study_target: list[int | None] = []

    def _stub_build_weekly_metrics(*_a, **kwargs):
        captured_study_target.append(kwargs.get("study_target_minutes"))
        return ["### **SUMMARY**", "", "week"]

    monkeypatch.setattr(
        "sync.application.period_sync_service.build_weekly_metrics",
        _stub_build_weekly_metrics,
    )
    monkeypatch.setattr(
        "sync.application.period_sync_service.write_note_metrics",
        lambda path, lines, metrics_block, store: store.write(
            path, lines + metrics_block
        ),
    )

    service.sync_week(window, note_path, cleanup_previous=False)

    assert captured_study_target == [None]
