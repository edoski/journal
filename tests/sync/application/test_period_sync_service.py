"""Service-level tests for period synchronization orchestration."""

from __future__ import annotations

import datetime

import pytest

from sync.application.period_sync_service import PeriodSyncService
from sync.contracts.finance import FinanceBundle
from sync.contracts.media import MediaBundle
from sync.contracts.notes import NotePublication
from sync.contracts.metrics import DailyAggregate
from sync.dates import daterange
from sync.metrics import compute_period_metrics
from sync.periods.windows import (
    build_month_window,
    build_week_window,
    build_year_window,
)


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

    def publish(
        self,
        path: str,
        lines: list[str],
        *,
        expected: list[str] | None,
    ) -> NotePublication:
        current = self.read(path)
        if current != expected:
            return NotePublication(
                status="conflict",
                lines=tuple(current) if current is not None else None,
            )
        return self.update(path, lambda _current: lines)

    def update(self, path, updater, *, template_path=None) -> NotePublication:
        _ = template_path
        current = self.read(path)
        base = current or ["## Metrics", "---", "", "## Reflections", ""]
        updated = updater(base)
        if updated == current:
            return NotePublication(status="unchanged", lines=tuple(updated))
        self._notes[path] = updated[:]
        return NotePublication(status="updated", lines=tuple(updated))


class _StubAggregateSource:
    def load_for_dates(self, dates: list[datetime.date]):
        return {day: {} for day in dates}


class _NoFinance:
    def __init__(self) -> None:
        self.calls: list[tuple[datetime.date, datetime.date]] = []

    def load(self, start: datetime.date, end: datetime.date) -> FinanceBundle | None:
        self.calls.append((start, end))
        return None


class _StubMediaSource:
    def __init__(self) -> None:
        self.calls: list[tuple[datetime.date, datetime.date]] = []

    def scan(self, start: datetime.date, end: datetime.date) -> MediaBundle:
        self.calls.append((start, end))
        return MediaBundle(items=())


def test_sync_week_writes_metrics_and_runs_cleanup(monkeypatch, tmp_path):
    note_store = _StubNoteStore()
    media_source = _StubMediaSource()
    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=_StubAggregateSource(),
        media_source=media_source,
        finance_source=_NoFinance(),
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
    assert "week" in written
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
        finance_source=_NoFinance(),
    )

    window = build_year_window(2026, target_date=datetime.date(2026, 6, 1))
    note_path = str(tmp_path / window.filename)

    monkeypatch.setattr(
        "sync.application.period_sync_service.build_yearly_metrics",
        lambda *_a, **_kw: ["### **SUMMARY**", "", "year"],
    )
    service.sync_year(window, note_path)

    written = note_store.read(note_path)
    assert written is not None
    assert "year" in written
    assert media_source.calls == [(window.start, window.end)]


@pytest.mark.parametrize(
    ("period", "window", "prior_count"),
    [
        ("week", build_week_window(datetime.date(2026, 1, 1)), 4),
        ("month", build_month_window(datetime.date(2026, 1, 1)), 3),
        ("year", build_year_window(2026, target_date=datetime.date(2026, 6, 1)), 3),
    ],
)
def test_period_loads_each_day_once_and_preserves_comparison_windows(
    monkeypatch, tmp_path, period, window, prior_count
):
    earliest, _ = window.prior_bounds(prior_count)
    expected_dates = list(daterange(earliest, window.end))
    data = {
        day: DailyAggregate(study_minutes=float(index + 1))
        for index, day in enumerate(expected_dates)
        if index % 3 == 0
    }
    loads = []

    class Source:
        def load_for_dates(self, dates):
            loads.append(dates)
            return {day: data[day] for day in dates if day in data}

    def render(actual_window, current, previous, media, **kwargs):
        assert actual_window == window
        assert current == {
            day: value
            for day, value in data.items()
            if window.start <= day <= window.end
        }
        assert previous == {
            day: value
            for day, value in data.items()
            if window.previous_start <= day <= window.previous_end
        }
        expected_prior = [
            compute_period_metrics(list(daterange(*window.prior_bounds(offset))), data)
            for offset in range(prior_count, 0, -1)
        ]
        assert kwargs[f"prior_{period}_metrics"] == expected_prior
        return ["metrics"]

    builder = {"week": "weekly", "month": "monthly", "year": "yearly"}[period]
    monkeypatch.setattr(
        f"sync.application.period_sync_service.build_{builder}_metrics", render
    )
    service = PeriodSyncService(
        _StubNoteStore(), Source(), _StubMediaSource(), _NoFinance()
    )
    note_path = str(tmp_path / window.filename)
    if period == "year":
        service.sync_year(window, note_path)
    else:
        getattr(service, f"sync_{period}")(window, note_path, cleanup_previous=False)
    assert loads == [expected_dates]


class _NoAggregates:
    def load_for_dates(self, dates: list[datetime.date]):
        return {}


class _Finance:
    def __init__(self, bundle: FinanceBundle | None) -> None:
        self.bundle = bundle
        self.calls: list[tuple[datetime.date, datetime.date]] = []

    def load(self, start: datetime.date, end: datetime.date) -> FinanceBundle | None:
        self.calls.append((start, end))
        return self.bundle


def _finance_service(monkeypatch, tmp_path, bundle):
    note_store = _StubNoteStore()
    finance = _Finance(bundle)
    monkeypatch.setattr(
        "sync.periods.runtime.JOURNAL_DIR", str(tmp_path / "journal"), raising=True
    )
    service = PeriodSyncService(
        note_store=note_store,
        aggregate_source=_NoAggregates(),
        media_source=_StubMediaSource(),
        finance_source=finance,
    )
    return service, note_store, finance


def test_month_sync_renders_finances_and_writes_the_transactions_note(
    monkeypatch, tmp_path
):
    from tests.support.finance_fixture_data import MOCK_BUNDLE

    service, note_store, finance = _finance_service(monkeypatch, tmp_path, MOCK_BUNDLE)
    window = build_month_window(datetime.date(2026, 9, 30))
    note_path = str(tmp_path / "journal" / window.filename)

    service.sync_month(window, note_path, cleanup_previous=False)

    assert finance.calls == [(datetime.date(2026, 6, 1), datetime.date(2026, 9, 30))]
    note = note_store.read(note_path)
    assert note is not None and "### **FINANCES**" in note
    assert "**[[2026-09 transactions|29 transactions →]]**" in note
    transactions = note_store.read(
        str(tmp_path / "journal" / "transactions" / "2026-09 transactions.md")
    )
    assert transactions is not None
    assert transactions[0] == "Month: [[2026-09]]"
    assert len(transactions) == 4 + 29
    before = dict(note_store._notes)
    service.sync_month(window, note_path, cleanup_previous=False)
    assert note_store._notes == before


def test_week_and_year_write_the_notes_they_link_to(monkeypatch, tmp_path):
    from tests.support.finance_fixture_data import MOCK_BUNDLE

    service, note_store, finance = _finance_service(monkeypatch, tmp_path, MOCK_BUNDLE)
    week = build_week_window(datetime.date(2026, 9, 2))
    service.sync_week(
        week, str(tmp_path / "journal" / week.filename), cleanup_previous=False
    )
    assert finance.calls == [(datetime.date(2026, 8, 1), datetime.date(2026, 9, 30))]
    year = build_year_window(2026, target_date=datetime.date(2026, 9, 30))
    service.sync_year(year, str(tmp_path / "journal" / year.filename))
    written = sorted(
        path.rsplit("/", 1)[1] for path in note_store._notes if "/transactions/" in path
    )
    assert written == [
        "2026-06 transactions.md",
        "2026-07 transactions.md",
        "2026-08 transactions.md",
        "2026-09 transactions.md",
    ]


def test_without_finance_nothing_new_is_written(monkeypatch, tmp_path):
    service, note_store, _ = _finance_service(monkeypatch, tmp_path, None)
    window = build_month_window(datetime.date(2026, 9, 30))
    note_path = str(tmp_path / "journal" / window.filename)
    service.sync_month(window, note_path, cleanup_previous=False)
    assert list(note_store._notes) == [note_path]
    assert not any(
        "FINANCES" in line or "SPENT" in line for line in note_store._notes[note_path]
    )


def test_unreadable_finance_is_one_line_and_every_other_section_renders(
    monkeypatch, tmp_path, caplog
):
    from sync.application import period_sync_service as module
    from sync.ports.finance import FinanceUnavailableError

    class _Broken:
        def load(self, start, end):
            raise FinanceUnavailableError(
                'categories.toml: rule 2 ("X"): match must be a list'
            )

    monkeypatch.setattr(module, "_warned_unreadable", False)
    monkeypatch.setattr("sync.periods.runtime.JOURNAL_DIR", str(tmp_path / "journal"))
    window = build_month_window(datetime.date(2026, 9, 30))
    notes = {}
    for name, source in (("broken", _Broken()), ("none", _NoFinance())):
        store = _StubNoteStore()
        service = PeriodSyncService(store, _NoAggregates(), _StubMediaSource(), source)
        path = str(tmp_path / name / window.filename)
        service.sync_month(window, path, cleanup_previous=False)
        service.sync_week(
            build_week_window(datetime.date(2026, 9, 30)),
            str(tmp_path / name / "w.md"),
            cleanup_previous=False,
        )
        notes[name] = store.read(path)
        assert not any("/transactions/" in key for key in store._notes)
    broken = notes["broken"]
    start = broken.index("### **FINANCES**")
    assert broken[start : start + 2] == [
        "### **FINANCES**",
        '`finance data unreadable: categories.toml: rule 2 ("X"): match must be a list`',
    ]
    assert "| **SPENT** | `—` | `—` | `—` |" in broken
    without = [line for line in broken if "SPENT" not in line]
    del without[
        without.index("### **FINANCES**") : without.index("### **FINANCES**") + 3
    ]
    assert without == notes["none"]
    assert sum("finance data unreadable" in r.message for r in caplog.records) == 1
