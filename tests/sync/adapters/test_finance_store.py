"""The finance adapter over a real finance store, and publication of the notes."""

from __future__ import annotations

import datetime
from pathlib import Path

import pytest

from finance.config import Paths, Settings
from finance.fetch import run_fetch
from sync.adapters.finance_store import FinanceStoreSource, FinanceUnavailableError
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.period_sync_service import PeriodSyncService
from sync.contracts.media import MediaBundle
from sync.periods.windows import build_month_window

from tests.finance.conftest import NOW, TODAY, connected
from tests.finance.fake_bank import FakeBank, client_factory, tx


@pytest.fixture
def finance_root(tmp_path: Path) -> Path:
    paths = Paths(tmp_path / "finance")
    connected(paths)
    bank = FakeBank(
        pages={
            "uid-1": [
                (
                    [
                        tx(
                            "2026-10-01",
                            "2500.00",
                            "CRDT",
                            ref="a",
                            debtor="CLIENT LTD",
                        ),
                        tx("2026-10-02", "48.62", ref="b", creditor="ESSELUNGA SPA"),
                        tx(
                            "2026-10-03",
                            "5000.00",
                            "CRDT",
                            ref="c",
                            debtor="ROSSI MARIO",
                        ),
                        tx(
                            "2026-10-04", "19.99", "CRDT", ref="d", creditor="AMAZON EU"
                        ),
                    ],
                    None,
                )
            ]
        }
    )
    result = run_fetch(
        paths,
        Settings("app", tmp_path / "k.pem"),
        client_factory=client_factory(bank),
        now=lambda: NOW,
        today=lambda: TODAY,
    )
    assert result.outcome == "ok"
    paths.rules.write_text(
        '[[rule]]\ncategory = "Income"\nflow = "in"\nmatch = ["CLIENT LTD"]\nlabel = "Client"\n\n'
        '[[rule]]\ncategory = "Transfer"\nholder = true\nmatch = ["GIROCONTO"]\n\n'
        '[[rule]]\ncategory = "Groceries"\nmatch = ["ESSELUNGA"]\n'
    )
    return paths.root


def test_no_store_means_not_set_up(tmp_path: Path) -> None:
    assert (
        FinanceStoreSource(str(tmp_path / "nothing")).load(
            datetime.date(2026, 1, 1), datetime.date(2026, 12, 31)
        )
        is None
    )


def test_the_adapter_maps_categorised_entries(finance_root: Path) -> None:
    bundle = FinanceStoreSource(str(finance_root)).load(
        datetime.date(2026, 10, 1), datetime.date(2026, 10, 31)
    )
    assert bundle is not None
    assert [
        (e.day.day, e.flow, e.category, e.role, e.description, e.amount_cents)
        for e in bundle.entries
    ] == [
        (1, "IN", "Income", "income", "Client", 250000),
        (2, "OUT", "Groceries", "spending", "ESSELUNGA SPA", 4862),
        (3, "IN", "Transfer", "transfer", "ROSSI MARIO", 500000),
        (4, "IN", "Other", "spending", "(no description)", 1999),
    ]
    assert bundle.covered_from == datetime.date(2026, 10, 1)


def test_broken_rules_surface_as_an_error(finance_root: Path) -> None:
    (finance_root / "categories.toml").write_text(
        '[[rule]]\ncategory = "X"\nflow = "sideways"\nmatch = ["a"]\n'
    )
    with pytest.raises(FinanceUnavailableError, match='rule 1 \\("X"\\): flow must be'):
        FinanceStoreSource(str(finance_root)).load(
            datetime.date(2026, 10, 1), datetime.date(2026, 10, 31)
        )


def test_month_sync_through_the_real_note_store_is_idempotent(
    finance_root: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    journal = tmp_path / "journal"
    journal.mkdir()
    template = tmp_path / "monthly.md"
    template.write_text("## Metrics\n---\n\n## Reflections\n")
    monkeypatch.setattr("sync.periods.runtime.JOURNAL_DIR", str(journal))
    monkeypatch.setattr(
        "sync.application.period_sync_service.MONTHLY_TEMPLATE_PATH", str(template)
    )

    class _NoAggregates:
        def load_for_dates(self, dates):  # type: ignore[no-untyped-def]
            return {}

    class _NoMedia:
        def scan(self, start, end):  # type: ignore[no-untyped-def]
            return MediaBundle(items=())

    store = MarkdownNoteStore(lock_root=str(tmp_path / "locks"))
    service = PeriodSyncService(
        store, _NoAggregates(), _NoMedia(), FinanceStoreSource(str(finance_root))
    )
    window = build_month_window(datetime.date(2026, 10, 31))
    note = journal / window.filename
    service.sync_month(window, str(note), cleanup_previous=False)
    transactions = journal / "transactions" / "2026-10 transactions.md"
    first = (note.read_text(), transactions.read_text())
    assert "**[[2026-10 transactions|4 transactions →]]**" in first[0]
    assert (
        "| **SPENT** | `€49` | `—` | `—` |" in first[0]
    )  # the unmatched €19.99 in is INCOME
    assert first[1].startswith("Month: [[2026-10]]\n\n| TYPE | CATEGORY |")
    assert (
        "| **IN** | Transfer | ROSSI MARIO | `€5,000.00` | `2026-10-03` |" in first[1]
    )
    mtime = transactions.stat().st_mtime_ns
    service.sync_month(window, str(note), cleanup_previous=False)
    assert (note.read_text(), transactions.read_text()) == first
    assert transactions.stat().st_mtime_ns == mtime
    # A hand edit of the generated note is replaced on the next sync.
    transactions.write_text("edited\n")
    service.sync_month(window, str(note), cleanup_previous=False)
    assert transactions.read_text() == first[1]


def test_the_non_euro_warning_is_logged_once(
    finance_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    import sqlite3

    from sync.adapters import finance_store

    monkeypatch.setattr(finance_store, "_warned_currency", False)
    db = sqlite3.connect(finance_root / "finance.sqlite3")
    with db:
        db.execute("UPDATE transactions SET currency = 'USD' WHERE key LIKE 'ref:b:%'")
    db.close()
    source = FinanceStoreSource(str(finance_root))
    for _ in range(3):
        source.load(datetime.date(2026, 10, 1), datetime.date(2026, 10, 31))
    assert sum("not in EUR" in r.message for r in caplog.records) == 1


def test_finance_opened_reaches_the_period_notes(finance_root: Path) -> None:
    import sqlite3

    source = FinanceStoreSource(str(finance_root))
    october = (datetime.date(2026, 10, 1), datetime.date(2026, 10, 31))
    bundle = source.load(*october)
    assert bundle is not None and bundle.zero_before is None
    db = sqlite3.connect(finance_root / "finance.sqlite3")
    with db:
        db.execute(
            "INSERT INTO meta (key, value) VALUES ('opened:hash-1', '2026-09-30')"
        )
    db.close()
    bundle = source.load(*october)
    assert bundle is not None
    assert (bundle.covered_from, bundle.zero_before) == (
        datetime.date(2026, 9, 30),
        datetime.date(2026, 9, 30),
    )


def test_a_broken_opening_date_becomes_the_one_line_error(finance_root: Path) -> None:
    import sqlite3

    db = sqlite3.connect(finance_root / "finance.sqlite3")
    with db:
        db.execute("INSERT INTO meta (key, value) VALUES ('opened:hash-1', 'soon')")
    db.close()
    with pytest.raises(FinanceUnavailableError, match="opening date 'soon'"):
        FinanceStoreSource(str(finance_root)).load(
            datetime.date(2026, 10, 1), datetime.date(2026, 10, 31)
        )
