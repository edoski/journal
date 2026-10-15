"""finance.read: the read interface Journal sync uses."""

from __future__ import annotations

import datetime
import os
import sqlite3
from pathlib import Path

import pytest

from finance.config import Paths, Settings, finance_dir
from finance.fetch import run_fetch
from finance.read import FinanceReadError, read_entries
from finance.store import open_reader

from tests.finance.conftest import NOW, TODAY, connected
from tests.finance.fake_bank import FakeBank, client_factory, tx


def build(paths: Paths, settings: Settings, items: list[dict[str, object]]) -> None:
    connected(paths)
    bank = FakeBank(pages={"uid-1": [(items, None)]})
    assert (
        run_fetch(
            paths,
            settings,
            client_factory=client_factory(bank),
            now=lambda: NOW,
            today=lambda: TODAY,
        ).outcome
        == "ok"
    )


def test_not_set_up_reads_as_none(paths: Paths) -> None:
    assert (
        read_entries(
            datetime.date(2026, 1, 1), datetime.date(2026, 12, 31), root=paths.root
        )
        is None
    )


def test_entries_are_categorised_when_read(paths: Paths, settings: Settings) -> None:
    build(
        paths,
        settings,
        [
            tx("2026-10-15", "48.62", ref="a", creditor="ESSELUNGA SPA"),
            tx("2026-10-16", "5000.00", "CRDT", ref="b", debtor="ROSSI MARIO"),
            tx("2026-10-17", "9.99", ref="c", creditor="SHOP USD", currency="USD"),
        ],
    )
    found = read_entries(
        datetime.date(2026, 10, 1), datetime.date(2026, 10, 31), root=paths.root
    )
    assert found is not None
    assert [(e.category, e.role, e.description) for e in found.entries] == [
        ("Groceries", "spending", "ESSELUNGA SPA"),
        ("Transfer", "transfer", "ROSSI MARIO"),
    ]
    assert found.other_currency == 1
    assert found.covered_from == datetime.date(2026, 10, 15)
    paths.rules.write_text(
        '[[rule]]\ncategory = "Food"\nmatch = ["esselunga"]\nlabel = "Esselunga"\n'
    )
    again = read_entries(
        datetime.date(2026, 10, 1), datetime.date(2026, 10, 31), root=paths.root
    )
    assert again is not None
    assert [(e.category, e.description) for e in again.entries] == [
        ("Food", "Esselunga"),
        ("Other", "ROSSI MARIO"),
    ]


def test_the_read_is_read_only(paths: Paths, settings: Settings) -> None:
    build(paths, settings, [tx("2026-10-15", "1.00", ref="a")])
    store = open_reader(paths.store)
    assert store is not None
    with pytest.raises(sqlite3.OperationalError):
        store._db.execute("DELETE FROM transactions")
    store.close()


def test_unreadable_data_is_an_explicit_error(paths: Paths, settings: Settings) -> None:
    build(paths, settings, [tx("2026-10-15", "1.00", ref="a")])
    paths.rules.write_text("[[rule]\n")
    with pytest.raises(FinanceReadError, match="does not parse"):
        read_entries(
            datetime.date(2026, 10, 1), datetime.date(2026, 10, 31), root=paths.root
        )
    paths.rules.unlink()
    paths.store.write_bytes(b"garbage" * 100)
    with pytest.raises(FinanceReadError, match="not a finance store"):
        read_entries(
            datetime.date(2026, 10, 1), datetime.date(2026, 10, 31), root=paths.root
        )


def test_the_finance_folder_matches_journal_sync(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from sync import config

    for env in (
        {},
        {"JOURNAL_SUPPORT_DIR": str(tmp_path / "support")},
        {
            "JOURNAL_SUPPORT_DIR": str(tmp_path / "support"),
            "FINANCE_DIR": str(tmp_path / "f"),
        },
    ):
        monkeypatch.delenv("JOURNAL_SUPPORT_DIR", raising=False)
        monkeypatch.delenv("FINANCE_DIR", raising=False)
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        assert config._build_paths().finance_dir == str(finance_dir())
    assert finance_dir({}) == Path(
        os.path.expanduser("~/Library/Application Support/Journal/finance")
    )
