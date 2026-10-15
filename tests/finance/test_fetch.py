"""The fetch run against a fake Enable Banking API (no network)."""

from __future__ import annotations

import datetime
import json
import os
import stat

import pytest

from finance.client import EnableBankingClient, HttpResponse, NetworkError
from finance.config import Paths, Settings
from finance.fetch import OVERLAP_DAYS, run_fetch
from finance.files import exclusive
from finance.session import SessionAccount, load_session
from finance.store import open_reader

from tests.finance.conftest import NOW, TODAY, connected
from tests.finance.fake_bank import FakeBank, client_factory, tx


def fetch(
    paths: Paths,
    settings: Settings,
    bank: FakeBank,
    now: datetime.datetime = NOW,
    today: datetime.date = TODAY,
):
    return run_fetch(
        paths,
        settings,
        client_factory=client_factory(bank),
        now=lambda: now,
        today=lambda: today,
    )


def stored(paths: Paths):
    store = open_reader(paths.store)
    assert store is not None
    try:
        return store.transactions()
    finally:
        store.close()


def test_not_connected_exits_3_without_creating_the_store(
    paths: Paths, settings: Settings
) -> None:
    result = fetch(paths, settings, FakeBank())
    assert (result.outcome, result.exit_code) == ("not_connected", 3)
    assert not paths.store.exists()


def test_first_fetch_asks_for_the_longest_history_and_follows_pages(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    bank = FakeBank(
        pages={
            "uid-1": [
                (
                    [tx("2026-10-15", "12.30", ref="a", creditor="ESSELUNGA SPA")],
                    "key-1",
                ),
                ([], "key-2"),  # an empty page with a key still continues
                (
                    [tx("2026-10-16", "2500.00", "CRDT", ref="b", debtor="CLIENT LTD")],
                    None,
                ),
            ]
        },
        balances={
            "uid-1": [
                {
                    "name": "Disponibile",
                    "balance_amount": {"currency": "EUR", "amount": "1234.56"},
                    "balance_type": "ITAV",
                }
            ]
        },
    )
    result = fetch(paths, settings, bank)
    assert (result.outcome, result.exit_code, result.added) == ("ok", 0, 2)
    pages = bank.requests("GET", "/transactions")
    assert [c.query for c in pages] == [
        {"transaction_status": "BOOK", "strategy": "longest"},
        {
            "transaction_status": "BOOK",
            "strategy": "longest",
            "continuation_key": "key-1",
        },
        {
            "transaction_status": "BOOK",
            "strategy": "longest",
            "continuation_key": "key-2",
        },
    ]
    rows = stored(paths)
    assert [(r.key, r.flow, r.amount_cents, r.counterparty) for r in rows] == [
        ("ref:a:2026-10-15:DBIT:1230:0", "OUT", 1230, "ESSELUNGA SPA"),
        ("ref:b:2026-10-16:CRDT:250000:0", "IN", 250000, "CLIENT LTD"),
    ]
    assert json.loads(rows[0].raw)["creditor"] == {"name": "ESSELUNGA SPA"}
    # The store and its folder are private.
    assert stat.S_IMODE(os.stat(paths.store).st_mode) == 0o600
    assert stat.S_IMODE(os.stat(paths.root).st_mode) == 0o700
    assert stat.S_IMODE(os.stat(paths.session).st_mode) == 0o600


def test_reruns_are_idempotent_and_later_fetches_overlap(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    page = [tx("2026-10-15", "12.30", ref="a"), tx("2026-10-18", "4.00")]
    bank = FakeBank(pages={"uid-1": [(page, None)]})
    assert fetch(paths, settings, bank).added == 2
    later = NOW + datetime.timedelta(hours=6)
    second = fetch(paths, settings, bank, now=later)
    assert (second.added, second.updated) == (0, 0)
    assert len(stored(paths)) == 2
    query = bank.requests("GET", "/transactions")[-1].query
    expected_from = datetime.date(2026, 10, 18) - datetime.timedelta(days=OVERLAP_DAYS)
    assert query == {
        "transaction_status": "BOOK",
        "strategy": "default",
        "date_from": expected_from.isoformat(),
    }


def test_identical_entries_without_reference_stay_two_rows(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    coffee = tx("2026-10-15", "1.20", creditor="BAR CENTRALE")
    bank = FakeBank(pages={"uid-1": [([coffee, dict(coffee)], None)]})
    assert fetch(paths, settings, bank).added == 2
    assert (
        fetch(paths, settings, bank, now=NOW + datetime.timedelta(hours=6)).added == 0
    )
    assert len(stored(paths)) == 2


def test_a_repeated_continuation_key_stops_and_a_repeated_page_counts_once(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    first = [tx("2026-10-15", "5.00", creditor="A")]
    bank = FakeBank(pages={"uid-1": [(first, None)]})
    assert fetch(paths, settings, bank).outcome == "ok"
    bank.pages = {
        "uid-1": [
            (first, "key-1"),
            (first, "key-1"),  # the bank sends the same page and the same key again
        ]
    }
    result = fetch(paths, settings, bank, now=NOW + datetime.timedelta(hours=6))
    assert result.outcome == "ok"
    assert len(bank.requests("GET", "/transactions")) == 3
    assert len(stored(paths)) == 1
    assert "repeated a continuation key" in result.message
    assert "same page twice" in result.message


def test_a_repeated_key_in_the_first_fetch_asks_for_the_history_again(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    page = [tx("2026-10-15", "5.00", ref="a")]
    bank = FakeBank(pages={"uid-1": [(page, "key-1"), (page, "key-1")]})
    result = fetch(paths, settings, bank)
    assert (result.outcome, result.exit_code) == ("error", 1)
    assert "first fetch" in result.message
    assert stored(paths) == []
    bank.pages = {"uid-1": [(page, None)]}
    fetch(paths, settings, bank, now=NOW + datetime.timedelta(hours=6))
    assert bank.requests("GET", "/transactions")[-1].query["strategy"] == "longest"
    assert len(stored(paths)) == 1


def test_rate_limit_is_recorded_without_retry_and_pauses_six_hours(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    bank = FakeBank(
        failures=[
            ("GET", "/accounts/uid-1/transactions", 429, "ASPSP_RATE_LIMIT_EXCEEDED")
        ]
    )
    result = fetch(paths, settings, bank)
    assert (result.outcome, result.exit_code) == ("rate_limited", 0)
    assert len(bank.calls) == 1
    session = load_session(paths.session)
    assert session is not None
    # 6 hours, ending 5 minutes early so the run scheduled 6 hours later goes ahead
    assert session.rate_limited_until == NOW + datetime.timedelta(hours=6, minutes=-5)
    skipped = fetch(paths, settings, bank, now=NOW + datetime.timedelta(hours=5))
    assert (skipped.outcome, skipped.exit_code) == ("skipped", 0)
    assert len(bank.calls) == 1
    resumed = fetch(paths, settings, bank, now=NOW + datetime.timedelta(hours=6))
    assert resumed.outcome == "ok"
    assert load_session(paths.session).rate_limited_until is None  # type: ignore[union-attr]


def test_a_failure_on_a_later_page_commits_nothing_for_that_account(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    bank = FakeBank(
        pages={
            "uid-1": [
                ([tx("2026-10-15", "5.00", ref="a")], "key-1"),
                ([tx("2026-10-14", "6.00", ref="b")], None),
            ]
        },
    )
    original = bank._route

    def flaky(method, path, query, body):  # type: ignore[no-untyped-def]
        if path.endswith("/transactions") and "continuation_key" in query:
            return HttpResponse(
                429, b'{"error": "ASPSP_RATE_LIMIT_EXCEEDED", "message": "x"}'
            )
        return original(method, path, query, body)

    bank._route = flaky  # type: ignore[method-assign]
    result = fetch(paths, settings, bank)
    assert result.outcome == "rate_limited"
    assert stored(paths) == []
    store = open_reader(paths.store)
    assert store is not None
    assert (
        store.accounts()[0].last_fetch is None
    )  # the next fetch asks for the whole history again
    store.close()


def test_expired_session_needs_reconsent_and_stops_calling(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    bank = FakeBank(
        failures=[("GET", "/accounts/uid-1/transactions", 401, "EXPIRED_SESSION")]
    )
    result = fetch(paths, settings, bank)
    assert (result.outcome, result.exit_code) == ("needs_reconsent", 3)
    assert "Journal --finance connect" in result.message
    again = fetch(paths, settings, bank, now=NOW + datetime.timedelta(days=1))
    assert (again.outcome, again.exit_code) == ("needs_reconsent", 3)
    assert len(bank.calls) == 1


def test_a_bare_401_is_an_error_not_a_reconsent(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    bank = FakeBank(failures=[("GET", "/accounts/uid-1/transactions", 401, None)])
    result = fetch(paths, settings, bank)
    assert (result.outcome, result.exit_code) == ("error", 1)
    assert load_session(paths.session).needs_reconsent is None  # type: ignore[union-attr]


def test_consent_past_valid_until_needs_reconsent_without_a_call(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    bank = FakeBank()
    result = fetch(
        paths,
        settings,
        bank,
        now=datetime.datetime(2027, 4, 11, 10, tzinfo=datetime.UTC),
    )
    assert (result.outcome, result.exit_code) == ("needs_reconsent", 3)
    assert bank.calls == []


def test_one_fetch_at_a_time(paths: Paths, settings: Settings) -> None:
    connected(paths)
    bank = FakeBank()
    with exclusive(paths.lock):
        result = fetch(paths, settings, bank)
    assert (result.outcome, result.exit_code) == ("busy", 0)
    assert bank.calls == []


def test_balances_once_a_day_and_never_blocking_transactions(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    bank = FakeBank(
        pages={"uid-1": [([tx("2026-10-15", "5.00", ref="a")], None)]},
        failures=[("GET", "/accounts/uid-1/balances", 500, "ASPSP_ERROR")],
    )
    first = fetch(paths, settings, bank)
    assert first.outcome == "ok" and "balance not read" in first.message
    assert len(stored(paths)) == 1
    second = fetch(paths, settings, bank, now=NOW + datetime.timedelta(hours=6))
    assert (
        len(bank.requests("GET", "/balances")) == 2
    )  # the failed one did not count for the day
    third = fetch(paths, settings, bank, now=NOW + datetime.timedelta(hours=12))
    assert second.outcome == third.outcome == "ok"
    assert len(bank.requests("GET", "/balances")) == 2


def test_period_errors_fall_back_to_what_the_bank_still_has(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    bank = FakeBank(pages={"uid-1": [([tx("2026-10-15", "5.00", ref="a")], None)]})
    fetch(paths, settings, bank)
    bank.failures.append(
        ("GET", "/accounts/uid-1/transactions", 422, "WRONG_TRANSACTIONS_PERIOD")
    )
    result = fetch(paths, settings, bank, now=NOW + datetime.timedelta(hours=6))
    assert result.outcome == "ok"
    strategies = [c.query["strategy"] for c in bank.requests("GET", "/transactions")]
    assert strategies == ["longest", "default", "longest"]


def test_network_errors_are_recorded_and_exit_1(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)

    def offline(request):  # type: ignore[no-untyped-def]
        raise NetworkError("could not reach api.enablebanking.com")

    result = run_fetch(
        paths,
        settings,
        client_factory=lambda s: EnableBankingClient(
            s, transport=offline, token_factory=lambda now: "t"
        ),
        now=lambda: NOW,
        today=lambda: TODAY,
    )
    assert (result.outcome, result.exit_code) == ("error", 1)
    store = open_reader(paths.store)
    assert store is not None and store.last_run() is not None
    assert store.last_run().outcome == "error"  # type: ignore[union-attr]
    store.close()


def test_accounts_are_kept_by_identification_hash_across_consents(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    bank = FakeBank(pages={"uid-1": [([tx("2026-10-15", "5.00", ref="a")], None)]})
    fetch(paths, settings, bank)
    connected(
        paths,
        SessionAccount(
            "uid-NEW", "hash-1", "IT00X0000000000000000000000", "ROSSI MARIO", "EUR"
        ),
    )
    bank.pages = {
        "uid-NEW": [
            (
                [tx("2026-10-15", "5.00", ref="a"), tx("2026-10-19", "7.00", ref="c")],
                None,
            )
        ]
    }
    result = fetch(paths, settings, bank, now=NOW + datetime.timedelta(hours=6))
    assert (result.added, result.updated) == (1, 0)
    assert {r.account for r in stored(paths)} == {"hash-1"}
    assert bank.requests("GET", "/transactions")[-1].query["strategy"] == "default"


@pytest.mark.parametrize("status", ["PDNG", "HOLD"])
def test_only_booked_entries_are_stored(
    paths: Paths, settings: Settings, status: str
) -> None:
    connected(paths)
    bank = FakeBank(
        pages={"uid-1": [([tx("2026-10-15", "5.00", ref="p", status=status)], None)]}
    )
    fetch(paths, settings, bank)
    assert stored(paths) == []
