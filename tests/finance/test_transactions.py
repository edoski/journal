"""Normalising Enable Banking transactions and their store keys."""

from __future__ import annotations

import datetime

import pytest

from finance.transactions import (
    MalformedTransaction,
    assign_keys,
    parse_booked,
    to_cents,
)

from tests.finance.fake_bank import tx


def test_amounts_become_cents() -> None:
    assert [to_cents(a) for a in ("12.30", "12.3", "-0.01", "1000", "2.345")] == [
        1230,
        1230,
        -1,
        100000,
        235,
    ]
    for bad in ("", "abc", "NaN", "Infinity"):
        with pytest.raises(MalformedTransaction):
            to_cents(bad)


def test_flow_counterparty_and_remittance() -> None:
    out = parse_booked(
        tx(
            "2026-10-15",
            "12.30",
            creditor=" ESSELUNGA\nSPA ",
            debtor="ME",
            remittance=["PAGAMENTO  POS", "12/10"],
        )
    )
    assert out is not None
    assert (out.flow, out.amount_cents, out.counterparty, out.remittance) == (
        "OUT",
        1230,
        "ESSELUNGA SPA",
        "PAGAMENTO POS 12/10",
    )
    incoming = parse_booked(
        tx("2026-10-15", "2500.00", "CRDT", creditor="ME", debtor="CLIENT LTD")
    )
    assert incoming is not None and (incoming.flow, incoming.counterparty) == (
        "IN",
        "CLIENT LTD",
    )


def test_missing_fields_fall_back() -> None:
    raw = {
        "transaction_amount": {"amount": "-4.00", "currency": "EUR"},
        "credit_debit_indicator": "DBIT",
        "status": "BOOK",
        "value_date": "2026-10-14",
    }
    entry = parse_booked(raw)
    assert entry is not None
    assert (entry.flow, entry.amount_cents, entry.booking_date) == (
        "OUT",
        400,
        datetime.date(2026, 10, 14),
    )
    assert (entry.counterparty, entry.remittance, entry.entry_reference) == (
        "",
        "",
        None,
    )
    assert (
        parse_booked({**raw, "remittance_information": "ONE STRING"}).remittance
        == "ONE STRING"
    )  # type: ignore[union-attr]


def test_pending_entries_are_skipped_and_broken_ones_refused() -> None:
    assert parse_booked(tx("2026-10-15", "1.00", status="PDNG")) is None
    with pytest.raises(MalformedTransaction):
        parse_booked({"status": "BOOK", "booking_date": "2026-10-15"})
    with pytest.raises(MalformedTransaction):
        parse_booked({"status": "BOOK", "transaction_amount": {"amount": "1.00"}})
    with pytest.raises(MalformedTransaction):
        parse_booked(["not", "an", "object"])


def test_keys_by_reference_by_content_and_by_occurrence() -> None:
    coffee = parse_booked(tx("2026-10-15", "1.20", creditor="BAR"))
    tea = parse_booked(tx("2026-10-15", "1.50", creditor="BAR"))
    ref = parse_booked(tx("2026-10-15", "9.00", ref="R1"))
    ref_twin = parse_booked(tx("2026-10-15", "9.00", ref="R1"))
    reused = parse_booked(tx("2026-10-20", "55.00", ref="R1"))
    entries = [e for e in (coffee, coffee, tea, ref, ref_twin, reused) if e]
    keys = sorted(assign_keys(entries))
    assert coffee is not None
    assert keys == sorted(
        [
            f"sha:{coffee.content_hash}:0",
            f"sha:{coffee.content_hash}:1",
            next(
                k for k in keys if k.startswith("sha:") and coffee.content_hash not in k
            ),
            "ref:R1:2026-10-15:DBIT:900:0",
            "ref:R1:2026-10-15:DBIT:900:1",
            "ref:R1:2026-10-20:DBIT:5500:0",
        ]
    )


def test_numeric_amounts_and_sign_conflicts() -> None:
    numeric = parse_booked(
        {
            "status": "BOOK",
            "booking_date": "2026-10-01",
            "transaction_amount": {"amount": 12.5},
            "credit_debit_indicator": "DBIT",
        }
    )
    assert numeric is not None and numeric.amount_cents == 1250
    with pytest.raises(MalformedTransaction):
        parse_booked(
            {
                "status": "BOOK",
                "booking_date": "2026-10-01",
                "transaction_amount": {"amount": True},
                "credit_debit_indicator": "DBIT",
            }
        )
    odd = parse_booked(tx("2026-10-01", "-5.00", "CRDT"))
    assert odd is not None and (odd.flow, odd.amount_cents, odd.sign_conflict) == (
        "IN",
        500,
        True,
    )
    plain = parse_booked(tx("2026-10-01", "5.00", "DBIT"))
    assert plain is not None and not plain.sign_conflict


def test_the_content_hash_ignores_key_order_and_fields_outside_the_identity() -> None:
    a = tx("2026-10-15", "1.20", creditor="BAR")
    b = dict(reversed(list(a.items())))
    b["transaction_id"] = "changes-every-time"
    b["balance_after_transaction"] = {"amount": "10.00", "currency": "EUR"}
    first, second = parse_booked(a), parse_booked(b)
    assert first is not None and second is not None
    assert first.content_hash == second.content_hash
