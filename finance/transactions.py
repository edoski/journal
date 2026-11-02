"""Booked transactions as Enable Banking returns them, and their store keys.

A transaction (API reference, `Transaction`) carries `transaction_amount`
{`amount` as a decimal string, `currency`}, `credit_debit_indicator` (CRDT
money in, DBIT money out), `status` (BOOK for booked), `booking_date`,
`creditor`/`debtor` {`name`}, `remittance_information` (a list of strings) and,
usually, `entry_reference`: unique and immutable per account
`identification_hash`, though "some do not provide transaction entry
references at all, and some provide duplicate values" (FAQ).

Keys, `n` counting equal tuples within one fetch in the bank's order (two equal
coffees on one day stay two rows; a repeated page is dropped before counting):

- with an entry_reference: `ref:<entry_reference>:<booking date>:<CRDT|DBIT>:<cents>:<n>`.
  Text never chooses the key, so a bank that enriches a name or remittance later
  updates the row in place, and a reference the bank reuses for another booking
  (another date, direction or amount) never overwrites the first one.
- without one: `sha:<content hash>:<n>`, the hash covering the fields that
  identify a booked entry.
"""

from __future__ import annotations

import datetime
import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

Flow = Literal["IN", "OUT"]
CENT = Decimal("0.01")


class MalformedTransaction(ValueError):
    """A transaction lacks what is needed to store it."""


@dataclass(frozen=True)
class Booked:
    """One booked transaction, normalised, with the JSON it came from."""

    booking_date: datetime.date
    flow: Flow
    amount_cents: int
    currency: str
    counterparty: str
    remittance: str
    bank_code: str
    entry_reference: str | None
    content_hash: str
    raw: Mapping[str, Any]
    sign_conflict: bool = False  # the indicator and the amount's sign disagree

    @property
    def raw_json(self) -> str:
        return canonical_json(self.raw)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def collapse(text: str) -> str:
    """Single spaces, no surrounding whitespace."""
    return " ".join(text.split())


def _text(value: Any) -> str:
    return collapse(value) if isinstance(value, str) else ""


def _name(party: Any) -> str:
    return _text(party.get("name")) if isinstance(party, Mapping) else ""


def _iban(account: Any) -> str:
    return _text(account.get("iban")) if isinstance(account, Mapping) else ""


def _remittance(value: Any) -> str:
    if isinstance(value, str):
        return collapse(value)
    if isinstance(value, list):
        return collapse(" ".join(part for part in value if isinstance(part, str)))
    return ""


MAX_CENTS = 100_000_000_000  # €1,000,000,000: beyond any real amount, and far inside SQLite's INTEGER range


def to_cents(amount: str) -> int:
    """A decimal string such as "12.30" or "-12.3" as signed cents, below €1 billion either way."""
    try:
        value = Decimal(amount.strip())
        if not value.is_finite():
            raise MalformedTransaction(f"amount {amount!r} is not a number")
        cents = int(
            (value.quantize(CENT, rounding=ROUND_HALF_UP) * 100).to_integral_value()
        )
    except MalformedTransaction:
        raise
    except (ArithmeticError, AttributeError, ValueError) as exc:
        raise MalformedTransaction(f"amount {amount!r} is not a usable number") from exc
    if abs(cents) >= MAX_CENTS:
        raise MalformedTransaction(f"amount {amount!r} is out of range")
    return cents


def _date(value: Any) -> datetime.date | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.date.fromisoformat(value[:10])
    except ValueError:
        return None


def _identity(raw: Mapping[str, Any]) -> dict[str, Any]:
    """The fields that identify a booked entry, for the content hash."""
    amount = raw.get("transaction_amount")
    amount = amount if isinstance(amount, Mapping) else {}
    code = raw.get("bank_transaction_code")
    return {
        "amount": amount.get("amount"),
        "currency": amount.get("currency"),
        "indicator": raw.get("credit_debit_indicator"),
        "booking_date": raw.get("booking_date"),
        "value_date": raw.get("value_date"),
        "transaction_date": raw.get("transaction_date"),
        "creditor": _name(raw.get("creditor")),
        "debtor": _name(raw.get("debtor")),
        "creditor_account": _iban(raw.get("creditor_account")),
        "debtor_account": _iban(raw.get("debtor_account")),
        "remittance": raw.get("remittance_information"),
        "reference_number": raw.get("reference_number"),
        "bank_code": code if isinstance(code, Mapping) else None,
    }


def content_hash(raw: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_json(_identity(raw)).encode("utf-8")).hexdigest()


def parse_booked(raw: Any) -> Booked | None:
    """Normalise one transaction; None for one that is not booked."""
    if not isinstance(raw, Mapping):
        raise MalformedTransaction("a transaction is not a JSON object")
    status = raw.get("status")
    if status is not None and status != "BOOK":
        return None
    day = (
        _date(raw.get("booking_date"))
        or _date(raw.get("value_date"))
        or _date(raw.get("transaction_date"))
    )
    if day is None:
        raise MalformedTransaction("a booked transaction has no date")
    amount = raw.get("transaction_amount")
    value = amount.get("amount") if isinstance(amount, Mapping) else None
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise MalformedTransaction("a transaction has no transaction_amount.amount")
    cents = to_cents(str(value))
    indicator = raw.get("credit_debit_indicator")
    if indicator == "CRDT":
        flow: Flow = "IN"
    elif indicator == "DBIT":
        flow = "OUT"
    else:
        # Required by the API schema: without it the direction is a guess.
        raise MalformedTransaction(
            f"credit_debit_indicator is {indicator!r}, not CRDT or DBIT"
        )
    conflict = cents < 0 and indicator == "CRDT"
    currency = (
        _text(amount.get("currency")) if isinstance(amount, Mapping) else ""
    ) or "EUR"
    party = raw.get("debtor") if flow == "IN" else raw.get("creditor")
    code = raw.get("bank_transaction_code")
    bank_code = ""
    if isinstance(code, Mapping):
        bank_code = _text(code.get("description")) or _text(code.get("code"))
    reference = raw.get("entry_reference")
    return Booked(
        booking_date=day,
        flow=flow,
        amount_cents=abs(cents),
        currency=currency,
        counterparty=_name(party),
        remittance=_remittance(raw.get("remittance_information")),
        bank_code=bank_code,
        entry_reference=reference.strip()
        if isinstance(reference, str) and reference.strip()
        else None,
        content_hash=content_hash(raw),
        raw=raw,
        sign_conflict=conflict,
    )


def assign_keys(entries: Sequence[Booked]) -> dict[str, Booked]:
    """Store keys for one fetch's entries (see the module docstring)."""
    counts: dict[str, int] = {}
    keyed: dict[str, Booked] = {}
    for entry in entries:
        if entry.entry_reference is not None:
            indicator = "CRDT" if entry.flow == "IN" else "DBIT"
            base = (
                f"ref:{entry.entry_reference}:{entry.booking_date.isoformat()}:"
                f"{indicator}:{entry.amount_cents}"
            )
        else:
            base = f"sha:{entry.content_hash}"
        index = counts.get(base, 0)
        counts[base] = index + 1
        keyed[f"{base}:{index}"] = entry
    return keyed
