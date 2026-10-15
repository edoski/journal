"""Review round 2 fixes in the finance package (items 2, 3, 4, 5, 8)."""

from __future__ import annotations

import datetime
import sqlite3
from pathlib import Path
from typing import Any

import pytest

from finance import cli
from finance.config import Paths, Settings
from finance.fetch import run_fetch
from finance.read import FinanceReadError, read_entries
from finance.session import load_session, save_session
from finance.store import open_reader

from tests.finance.conftest import NOW, TODAY, connected
from tests.finance.fake_bank import FakeBank, client_factory, tx


def fetch(paths: Paths, bank: FakeBank, hours: int = 0):  # type: ignore[no-untyped-def]
    return run_fetch(
        paths,
        Settings("app", Path("/nonexistent.pem")),
        client_factory=client_factory(bank),
        now=lambda: NOW + datetime.timedelta(hours=hours),
        today=lambda: TODAY,
    )


def rejected(paths: Paths) -> list[tuple[str, str]]:
    store = open_reader(paths.store)
    assert store is not None
    try:
        return store._db.execute(
            "SELECT reason, first_seen FROM rejected ORDER BY reason"
        ).fetchall()
    finally:
        store.close()


def stored_count(paths: Paths) -> int:
    store = open_reader(paths.store)
    assert store is not None
    try:
        return store.count()
    finally:
        store.close()


# Item 2: every bank problem, consent first, two at most -----------------------------------


def test_an_unreadable_item_no_longer_hides_the_consent_warning(paths: Paths) -> None:
    connected(paths)
    bad = tx("2026-10-18", "5.00")
    del bad["credit_debit_indicator"]
    fetch(paths, FakeBank(pages={"uid-1": [([bad, tx("2026-10-19", "3.00")], None)]}))
    session = load_session(paths.session)
    assert session is not None
    later = NOW + datetime.timedelta(hours=1)
    save_session(
        paths.session,
        session.__class__(
            **{**session.__dict__, "valid_until": later + datetime.timedelta(days=10)}
        ),
    )
    store = open_reader(paths.store)
    assert store is not None
    line = cli.problem(paths, store, later)
    found = cli.problems(paths, store, later)
    assert line is not None
    assert line.startswith("bank consent ends on ")
    assert "1 bank transaction could not be read" in line
    assert len(found) == 2
    stale = later + datetime.timedelta(days=3)
    three = cli.problem(paths, store, stale)
    store.close()
    assert three is not None
    assert three.startswith("bank consent ends on")
    assert three.endswith("(+1 more: see /Applications/Journal.app/Contents/MacOS/Journal --finance status)")
    assert three.count(";") == 1


# Item 3: amounts no handler used to catch --------------------------------------------------


@pytest.mark.parametrize("amount", ["1e30", "1e400", "1e17", "1000000000.00"])
def test_huge_amounts_are_set_aside_and_the_run_goes_on(
    paths: Paths, amount: str
) -> None:
    connected(paths)
    bank = FakeBank(
        pages={
            "uid-1": [
                (
                    [
                        tx("2026-10-18", amount, ref="big"),
                        tx("2026-10-19", "3.00", ref="ok"),
                    ],
                    None,
                )
            ]
        }
    )
    result = fetch(paths, bank)
    assert (result.outcome, result.exit_code, result.added) == ("ok", 0, 1)
    assert len(rejected(paths)) == 1
    assert fetch(paths, bank, hours=6).outcome == "ok"


def test_a_bad_balance_amount_is_a_note_not_a_crash(paths: Paths) -> None:
    connected(paths)
    bank = FakeBank(
        pages={"uid-1": [([tx("2026-10-19", "3.00", ref="ok")], None)]},
        balances={
            "uid-1": [
                {
                    "name": "x",
                    "balance_amount": {"currency": "EUR", "amount": "1e400"},
                    "balance_type": "ITAV",
                }
            ]
        },
    )
    result = fetch(paths, bank)
    assert result.outcome == "ok" and "balance not read" in result.message
    assert stored_count(paths) == 1


# Item 4: the direction must be stated ------------------------------------------------------


@pytest.mark.parametrize("indicator", [None, "OTHR"])
@pytest.mark.parametrize("amount", ["5.00", "-5.00"])
def test_a_transaction_without_a_valid_indicator_is_set_aside(
    paths: Paths, indicator: Any, amount: str
) -> None:
    connected(paths)
    item = tx("2026-10-18", amount)
    if indicator is None:
        del item["credit_debit_indicator"]
    else:
        item["credit_debit_indicator"] = indicator
    result = fetch(paths, FakeBank(pages={"uid-1": [([item], None)]}))
    assert result.outcome == "ok" and result.added == 0
    [(reason, _)] = rejected(paths)
    assert "credit_debit_indicator" in reason


# Item 8 (finance): a rejected item is kept once, with its first sighting ------------------


def test_a_rejected_item_is_not_rewritten_by_later_runs(paths: Paths) -> None:
    connected(paths)
    bad = tx("2026-10-18", "5.00")
    del bad["booking_date"]
    del bad["value_date"]
    bank = FakeBank(pages={"uid-1": [([bad], None)]})
    fetch(paths, bank)
    first = rejected(paths)
    fetch(paths, bank, hours=6)
    assert rejected(paths) == first and len(first) == 1


# Item 5: `finance opened` ------------------------------------------------------------------


def _with_history(paths: Paths, *days: str) -> None:
    connected(paths)
    items = [
        tx(day, "10.00", ref=f"r{i}", creditor="COOP") for i, day in enumerate(days)
    ]
    assert fetch(paths, FakeBank(pages={"uid-1": [(items, None)]})).outcome == "ok"


def _opened(
    paths: Paths, capsys: pytest.CaptureFixture[str], *argv: str
) -> tuple[int, str]:
    code = cli.main(["opened", *argv], root=paths.root)
    captured = capsys.readouterr()
    return code, captured.out + captured.err


def test_opened_makes_the_days_before_known(
    paths: Paths, capsys: pytest.CaptureFixture[str]
) -> None:
    _with_history(paths, "2026-10-15", "2026-10-16")
    before = read_entries(
        datetime.date(2026, 1, 1), datetime.date(2026, 12, 31), root=paths.root
    )
    assert before is not None and before.zero_before is None
    assert before.covered_from == datetime.date(2026, 10, 15)
    code, out = _opened(paths, capsys, "2026-10-14")
    assert code == 0 and "opened on 2026-10-14" in out
    after = read_entries(
        datetime.date(2026, 1, 1), datetime.date(2026, 12, 31), root=paths.root
    )
    assert after is not None
    assert (after.covered_from, after.zero_before) == (
        datetime.date(2026, 10, 14),
        datetime.date(2026, 10, 14),
    )


def test_opened_is_refused_when_the_history_disagrees(
    paths: Paths, capsys: pytest.CaptureFixture[str]
) -> None:
    _with_history(paths, "2026-07-14", "2026-10-16")
    code, out = _opened(paths, capsys, "2026-01-01")
    assert code == 1 and "the bank's history starts on 2026-07-14" in out
    code, out = _opened(paths, capsys, "2026-07-20")
    assert code == 1 and "after the account's first booking (2026-07-14)" in out
    entries = read_entries(
        datetime.date(2026, 1, 1), datetime.date(2026, 12, 31), root=paths.root
    )
    assert entries is not None and entries.zero_before is None


def test_opened_needs_a_fetch_and_a_real_account(
    paths: Paths, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out = _opened(paths, capsys, "2026-10-14")
    assert code == 1 and "run a fetch first" in out
    _with_history(paths, "2026-10-15")
    code, out = _opened(paths, capsys, "2026-10-14", "--account", "9999")
    assert code == 1 and "no such account" in out
    code, out = _opened(paths, capsys, "2026-10-14", "--account", "0000")
    assert code == 0


def test_a_broken_opening_date_is_a_read_error_not_a_crash(paths: Paths) -> None:
    _with_history(paths, "2026-10-15")
    db = sqlite3.connect(paths.store)
    with db:
        db.execute("INSERT INTO meta (key, value) VALUES ('opened:hash-1', 'October')")
    db.close()
    with pytest.raises(FinanceReadError, match="opening date 'October'"):
        read_entries(
            datetime.date(2026, 10, 1), datetime.date(2026, 10, 31), root=paths.root
        )


# Review round 3 ------------------------------------------------------------------------


def test_status_shows_the_opening_day_or_says_it_is_broken(
    paths: Paths, capsys: pytest.CaptureFixture[str]
) -> None:
    _with_history(paths, "2026-10-15")
    assert _opened(paths, capsys, "2026-10-14")[0] == 0
    cli.main(["status"], root=paths.root)
    assert (
        "Opened          …0000 on 2026-10-14 (no transactions before)"
        in capsys.readouterr().out
    )
    db = sqlite3.connect(paths.store)
    with db:
        db.execute("UPDATE meta SET value = 'soon' WHERE key = 'opened:hash-1'")
    db.close()
    assert cli.main(["status"], root=paths.root) == 0
    out = capsys.readouterr().out
    assert "Opened          …0000: ERROR" in out and "'soon'" in out


def test_opened_leaves_no_read_connection_open(
    paths: Paths, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    from finance import store as store_module

    _with_history(paths, "2026-10-15")
    opened: list[object] = []
    closed: list[object] = []
    real_reader = store_module.open_reader

    def tracking(path):  # type: ignore[no-untyped-def]
        found = real_reader(path)
        if found is not None:
            opened.append(found)
            real_close = found.close
            found.close = lambda: (closed.append(found), real_close())[1]  # type: ignore[method-assign]
        return found

    monkeypatch.setattr(cli, "open_reader", tracking)
    assert _opened(paths, capsys, "2026-10-14")[0] == 0
    assert opened and opened == closed
