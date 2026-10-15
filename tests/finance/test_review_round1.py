"""Review round 1 fixes in the finance package (items 2, 3, 4, 9, 10, 13, 16)."""

from __future__ import annotations

import datetime
import email.message
import io
import json
import plistlib
import ssl
import urllib.request
from pathlib import Path
from typing import Any

import pytest

from finance import cli, tls
from finance.client import HttpRequest, urllib_transport
from finance.config import Paths, Settings
from finance.fetch import run_fetch, vanished_keys
from finance.session import SessionAccount, load_session
from finance.store import open_reader, open_writer
from finance.transactions import assign_keys, parse_booked

from tests.finance.conftest import NOW, TODAY, connected
from tests.finance.fake_bank import FakeBank, client_factory, tx

REPO = Path(__file__).resolve().parents[2]


def fetch(paths: Paths, bank: FakeBank, hours: int = 0):  # type: ignore[no-untyped-def]
    return run_fetch(
        paths,
        Settings("app", Path("/nonexistent.pem")),
        client_factory=client_factory(bank),
        now=lambda: NOW + datetime.timedelta(hours=hours),
        today=lambda: TODAY,
    )


def rows(paths: Paths):  # type: ignore[no-untyped-def]
    store = open_reader(paths.store)
    assert store is not None
    try:
        return store.transactions()
    finally:
        store.close()


# Item 2: references the bank reuses, twins, and enrichment ------------------------------


def _ref(
    ref: str, day: str, amount: str, text: str, remittance: str | None = None
) -> dict[str, Any]:
    item = tx(day, amount, ref=ref, creditor=text)
    if remittance is not None:
        item["remittance_information"] = [remittance]
    return item


def test_a_reused_reference_keeps_both_bookings_whatever_the_fetch_windows(
    tmp_path: Path,
) -> None:
    store = open_writer(tmp_path / "s.sqlite3")
    with store.transaction():
        store.remember_account("acct", iban="", name="", currency="EUR")
    a = parse_booked(_ref("X1", "2026-10-01", "10.00", "COFFEE"))
    b = parse_booked(_ref("X1", "2026-10-20", "55.00", "ESSELUNGA"))
    assert a is not None and b is not None
    for batch in ([a], [a, b], [b]):
        with store.transaction():
            store.upsert("acct", assign_keys(batch), "t")
    found = store.transactions()
    assert [(r.booking_date.day, r.amount_cents, r.counterparty) for r in found] == [
        (1, 1000, "COFFEE"),
        (20, 5500, "ESSELUNGA"),
    ]
    assert sum(r.amount_cents for r in found) == 6500
    store.close()


def test_identical_items_sharing_a_reference_stay_two_rows(paths: Paths) -> None:
    connected(paths)
    twin = _ref("R9", "2026-10-15", "1.20", "BAR")
    bank = FakeBank(pages={"uid-1": [([twin, dict(twin)], None)]})
    assert fetch(paths, bank).added == 2
    assert fetch(paths, bank, hours=6).added == 0
    assert len(rows(paths)) == 2


def test_enriched_text_under_the_same_reference_updates_the_row(paths: Paths) -> None:
    connected(paths)
    bank = FakeBank(
        pages={
            "uid-1": [([_ref("R5", "2026-10-15", "12.00", "", "PAGAMENTO POS")], None)]
        }
    )
    fetch(paths, bank)
    bank.pages = {
        "uid-1": [
            (
                [
                    _ref(
                        "R5",
                        "2026-10-15",
                        "12.00",
                        "BAR ROSSI",
                        "PAGAMENTO POS BAR ROSSI MILANO",
                    )
                ],
                None,
            )
        ]
    }
    result = fetch(paths, bank, hours=6)
    assert (result.added, result.updated) == (0, 1)
    [row] = rows(paths)
    assert (row.counterparty, row.remittance) == (
        "BAR ROSSI",
        "PAGAMENTO POS BAR ROSSI MILANO",
    )
    assert json.loads(row.raw)["creditor"] == {"name": "BAR ROSSI"}


# Item 3: one unreadable item no longer blocks the account --------------------------------


def _bad() -> dict[str, Any]:
    item = tx("2026-10-18", "5.00")
    del item["booking_date"]
    del item["value_date"]
    return item


def test_an_unreadable_item_is_kept_aside_and_the_rest_stored(
    paths: Paths, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    connected(paths)
    bank = FakeBank(
        pages={
            "uid-1": [
                (
                    [
                        tx("2026-10-01", "10.00", creditor="ESSELUNGA"),
                        _bad(),
                        tx("2026-10-19", "3.00"),
                    ],
                    None,
                )
            ]
        }
    )
    first = fetch(paths, bank)
    assert (first.outcome, first.exit_code, first.added) == ("ok", 0, 2)
    assert "1 transactions could not be read" in first.message
    second = fetch(paths, bank, hours=6)
    assert (second.outcome, second.added) == ("ok", 0)
    store = open_reader(paths.store)
    assert store is not None
    assert store._db.execute(
        "SELECT COUNT(*), MIN(reason) FROM rejected"
    ).fetchone() == (
        1,
        "a booked transaction has no date",
    )
    assert cli.problem(paths, store, NOW + datetime.timedelta(hours=7)) == (
        "1 bank transaction could not be read in the last 30 days: see /Applications/Journal.app/Contents/MacOS/Journal --finance status"
    )
    store.close()
    monkeypatch.setattr(cli, "_now", lambda: NOW + datetime.timedelta(hours=7))
    cli.main(["status"], root=paths.root)
    assert "Unreadable      1 transactions" in capsys.readouterr().out


def test_a_malformed_page_is_still_an_error(paths: Paths) -> None:
    connected(paths)
    bank = FakeBank()
    original = bank._route

    def broken(method, path, query, body):  # type: ignore[no-untyped-def]
        if path.endswith("/transactions"):
            from finance.client import HttpResponse

            return HttpResponse(200, b'{"transactions": "nope"}')
        return original(method, path, query, body)

    bank._route = broken  # type: ignore[method-assign]
    assert fetch(paths, bank).outcome == "error"


# Item 4 (finance half): credits need no rules and say who is the holder --------------------


def test_credits_survive_a_broken_rules_file_and_flag_own_transfers(
    paths: Paths, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    connected(paths)
    bank = FakeBank(
        pages={
            "uid-1": [
                (
                    [
                        tx(
                            "2026-10-15",
                            "3000.00",
                            "CRDT",
                            ref="c",
                            debtor="AMOREG LIMITED",
                        ),
                        tx(
                            "2026-10-16",
                            "500.00",
                            "CRDT",
                            ref="h",
                            debtor="Mario Rossi",
                        ),
                    ],
                    None,
                )
            ]
        }
    )
    fetch(paths, bank)
    paths.rules.write_text('[[rule]]\ncategory = "Food"\nmatch = "ESSELUNGA"\n')
    monkeypatch.setattr(cli, "_now", lambda: NOW + datetime.timedelta(hours=1))
    code = cli.main(["credits", "--since", "2026-10-01", "--json"], root=paths.root)
    payload = json.loads(capsys.readouterr().out)
    assert code == 0 and payload["status"] == "ok"
    assert "category rules unreadable" in payload["problem"]
    assert [
        (c["counterparty"], c["category"], c["holder"]) for c in payload["credits"]
    ] == [
        ("AMOREG LIMITED", None, False),
        ("Mario Rossi", None, True),
    ]


# Item 9: rows the bank no longer returns are reported ------------------------------------


def test_vanished_rows_are_reported_not_hidden(
    paths: Paths, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    connected(paths)
    plain = {
        "status": "BOOK",
        "booking_date": "2026-10-15",
        "transaction_amount": {"amount": "12.00", "currency": "EUR"},
        "credit_debit_indicator": "DBIT",
        "remittance_information": ["PAGAMENTO POS"],
    }
    rich = dict(plain, remittance_information=["PAGAMENTO POS BAR ROSSI MILANO"])
    bank = FakeBank(pages={"uid-1": [([plain], None)]})
    fetch(paths, bank)
    bank.pages = {"uid-1": [([rich], None)]}
    second = fetch(paths, bank, hours=6)
    assert len(rows(paths)) == 2
    assert "1 stored transactions no longer returned by the bank" in second.message
    store = open_reader(paths.store)
    assert store is not None and len(vanished_keys(store)) == 1
    store.close()
    monkeypatch.setattr(cli, "_now", lambda: NOW + datetime.timedelta(hours=7))
    cli.main(["status"], root=paths.root)
    assert "Vanished        1 stored transactions" in capsys.readouterr().out
    bank.pages = {"uid-1": [([plain, rich], None)]}
    fetch(paths, bank, hours=12)
    store = open_reader(paths.store)
    assert store is not None and vanished_keys(store) == []
    store.close()


# Item 10: no whole IBAN in run notes; the LaunchAgent -------------------------------------


def test_run_notes_name_accounts_by_the_last_four_digits(paths: Paths) -> None:
    iban = "IT79Q0301503200000005310653"
    connected(paths, SessionAccount("uid-1", "hash-1", iban, "ROSSI MARIO", "EUR"))
    result = fetch(
        paths, FakeBank(pages={"uid-1": [([tx("2026-10-15", "1.00", ref="a")], None)]})
    )
    assert iban not in result.message and "…0653" in result.message
    store = open_reader(paths.store)
    assert store is not None
    assert all(iban not in run.detail for run in store.runs())
    store.close()


def test_the_launch_agent_is_private_absolute_and_on_schedule() -> None:
    path = REPO / "macos" / "LaunchAgents" / "com.edo.journal.finance.plist"
    text = path.read_text()
    assert "~" not in text
    agent = plistlib.loads(path.read_bytes())
    assert agent["Umask"] == 63
    assert agent["ProgramArguments"] == [
        "/Applications/Journal.app/Contents/MacOS/Journal",
        "--finance",
        "fetch",
    ]
    assert agent["StandardOutPath"] == "/Users/edo/Library/Logs/Journal/finance.out"
    assert agent["StandardErrorPath"] == "/Users/edo/Library/Logs/Journal/finance.err"
    assert [(t["Hour"], t["Minute"]) for t in agent["StartCalendarInterval"]] == [
        (7, 30),
        (13, 30),
        (19, 30),
    ]


# Item 13: closing mutation survivors -------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "error", "outcome", "code"),
    [
        (429, "ASPSP_RATE_LIMIT_EXCEEDED", "rate_limited", 0),
        (401, "EXPIRED_SESSION", "needs_reconsent", 3),
    ],
)
def test_a_limit_or_session_error_on_the_balance_call_stops_the_run(
    paths: Paths, status: int, error: str, outcome: str, code: int
) -> None:
    connected(paths)
    bank = FakeBank(
        pages={"uid-1": [([tx("2026-10-15", "1.00", ref="a")], None)]},
        failures=[("GET", "/accounts/uid-1/balances", status, error)],
    )
    result = fetch(paths, bank)
    assert (result.outcome, result.exit_code) == (outcome, code)
    assert len(rows(paths)) == 1  # the transactions were already committed
    session = load_session(paths.session)
    assert session is not None
    assert (session.rate_limited_until is not None) == (outcome == "rate_limited")


def test_the_rate_limit_error_code_counts_whatever_the_status(paths: Paths) -> None:
    connected(paths)
    bank = FakeBank(
        failures=[
            ("GET", "/accounts/uid-1/transactions", 503, "ASPSP_RATE_LIMIT_EXCEEDED")
        ]
    )
    assert fetch(paths, bank).outcome == "rate_limited"


class _RedirectingHTTPS(urllib.request.HTTPSHandler):
    def __init__(self) -> None:
        super().__init__()
        self.seen: list[tuple[str, str | None]] = []

    def https_open(self, req: urllib.request.Request) -> Any:
        self.seen.append((req.full_url, req.get_header("Authorization")))
        headers = email.message.Message()
        headers["Location"] = "https://evil.example/steal"
        response = urllib.response.addinfourl(
            io.BytesIO(b""), headers, req.full_url, 302
        )
        response.msg = "Found"
        return response


def test_redirects_are_refused_and_the_token_never_follows() -> None:
    import urllib.response  # noqa: F401

    handler = _RedirectingHTTPS()
    send = urllib_transport(https=handler)
    answer = send(
        HttpRequest(
            "GET",
            "https://api.enablebanking.com/application",
            {"Authorization": "Bearer secret"},
            None,
        )
    )
    assert answer.status == 302
    assert handler.seen == [
        ("https://api.enablebanking.com/application", "Bearer secret")
    ]


def test_tls_requires_1_2_and_refuses_unverified_contexts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = tls.build_context()
    assert context.minimum_version == ssl.TLSVersion.TLSv1_2
    lax = ssl.create_default_context()
    lax.check_hostname = False
    monkeypatch.setattr(tls.ssl, "create_default_context", lambda purpose=None: lax)
    with pytest.raises(tls.TrustError, match="not enabled"):
        tls.build_context()


def test_a_changed_row_is_refreshed_in_place(tmp_path: Path) -> None:
    store = open_writer(tmp_path / "s.sqlite3")
    with store.transaction():
        store.remember_account("acct", iban="", name="", currency="EUR")
    first = parse_booked(_ref("R1", "2026-10-01", "10.00", "OLD"))
    second = parse_booked(_ref("R1", "2026-10-01", "10.00", "NEW"))
    assert first is not None and second is not None
    with store.transaction():
        assert store.upsert("acct", assign_keys([first]), "t1") == (1, 0)
    with store.transaction():
        assert store.upsert("acct", assign_keys([second]), "t2") == (0, 1)
    [row] = store.transactions()
    assert row.counterparty == "NEW"
    assert store._db.execute(
        "SELECT first_seen, last_seen FROM transactions"
    ).fetchone() == ("t1", "t2")
    store.close()


# Item 16 -------------------------------------------------------------------------------


def test_the_overlap_never_starts_after_today(paths: Paths) -> None:
    connected(paths)
    future = tx(
        "2026-11-30", "1.00", ref="f"
    )  # a booking date the bank puts in the future
    bank = FakeBank(pages={"uid-1": [([future], None)]})
    fetch(paths, bank)
    fetch(paths, bank, hours=6)
    query = bank.requests("GET", "/transactions")[-1].query
    assert query["date_from"] == (TODAY - datetime.timedelta(days=10)).isoformat()


def test_a_credit_with_a_negative_amount_is_noted(paths: Paths) -> None:
    connected(paths)
    bank = FakeBank(
        pages={"uid-1": [([tx("2026-10-15", "-5.00", "CRDT", ref="x")], None)]}
    )
    result = fetch(paths, bank)
    assert result.outcome == "ok"
    assert "1 credits with a negative amount" in result.message
