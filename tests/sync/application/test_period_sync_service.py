"""Service-level tests for period synchronization orchestration."""

from __future__ import annotations

import datetime

from sync.application.period_sync_service import PeriodSyncService
from sync.contracts.media import MediaBundle
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
            lines = ["## Metrics", "---", "", "## Reflections", ""]
            self._notes[path] = lines
        return lines[:]

    def write(self, path: str, lines: list[str]) -> None:
        self._notes[path] = lines[:]


class _StubAggregateSource:
    def load_for_dates(self, dates: list[datetime.date]):
        return {day: {} for day in dates}


class _StubMediaSource:
    def __init__(self) -> None:
        self.calls: list[tuple[datetime.date, datetime.date]] = []

    def scan(self, start: datetime.date, end: datetime.date) -> MediaBundle:
        self.calls.append((start, end))
        return MediaBundle(books=[], podcasts=[], series=[])


def test_sync_week_writes_metrics_and_runs_cleanup(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    media_source = _StubMediaSource()
    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=_StubAggregateSource(),
        media_source=media_source,
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

    def _stub_build_weekly_metrics(*_a, **_kwargs):
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
    assert cleanup_calls
    enabled, _prev_path, rerun = cleanup_calls[0]
    assert enabled is True
    assert callable(rerun)
    assert media_source.calls == [(window.start, window.end)]


def test_sync_year_writes_metrics(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    media_source = _StubMediaSource()
    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=_StubAggregateSource(),
        media_source=media_source,
    )

    window = build_year_window(2026, target_date=datetime.date(2026, 6, 1))
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
    assert media_source.calls == [(window.start, window.end)]
