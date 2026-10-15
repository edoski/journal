"""The read interface: categorised entries for a date range.

`read_entries` is the one function Journal sync calls (through its finance
adapter). It opens the store read-only and applies the category rules as it
reads, so editing `categories.toml` re-categorises history on the next sync.
It returns None while finance is not set up (no store yet) and raises
FinanceReadError when a store exists but cannot be read or the rules file is
invalid.
"""

from __future__ import annotations

import datetime
import sqlite3
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from finance.config import Paths, finance_dir
from finance.rules import Role, Rules, RulesError, load_rules, role_of, words
from finance.store import Account, Store, StoreError, Stored, open_reader
from finance.transactions import Flow

CURRENCY = "EUR"


class FinanceReadError(RuntimeError):
    """The finance store or its rules cannot be read."""


@dataclass(frozen=True)
class Entry:
    """One categorised booked transaction."""

    key: str
    account: str
    day: datetime.date
    flow: Flow
    amount_cents: int
    currency: str
    category: str
    role: Role
    description: str
    counterparty: str
    remittance: str


@dataclass(frozen=True)
class Entries:
    """Entries in a range, and the first day the store has data for."""

    entries: tuple[Entry, ...]
    covered_from: datetime.date | None
    other_currency: int = 0
    # Set when every account has an opening date (`finance opened`): the days
    # before it are known to have no transactions.
    zero_before: datetime.date | None = None


def describe(row: Stored, label: str | None) -> str:
    return (
        label
        or row.counterparty
        or row.remittance
        or row.bank_code
        or "(no description)"
    )


def holder_names(accounts: Sequence[Account]) -> list[tuple[str, ...]]:
    return [words(account.name) for account in accounts if account.name]


def categorise(row: Stored, rules: Rules, holders: Sequence[tuple[str, ...]]) -> Entry:
    match = rules.categorise(
        flow=row.flow,
        counterparty=row.counterparty,
        remittance=row.remittance,
        holders=holders,
    )
    return Entry(
        key=row.key,
        account=row.account,
        day=row.booking_date,
        flow=row.flow,
        amount_cents=row.amount_cents,
        currency=row.currency,
        category=match.category,
        role=role_of(match.category),
        description=describe(row, match.label),
        counterparty=row.counterparty,
        remittance=row.remittance,
    )


def covered_from(
    accounts: Sequence[Account], opened: dict[str, datetime.date] | None = None
) -> datetime.date | None:
    """The first day the bank data covers: the earliest of each account's first
    fetched day and, where set, its opening date."""
    opened = opened or {}
    days = []
    for account in accounts:
        if account.history_from is None:
            continue
        start = account.history_from
        if account.hash in opened:
            start = min(start, opened[account.hash])
        days.append(start)
    return min(days) if days else None


def entries_from(
    store: Store, rules: Rules, start: datetime.date, end: datetime.date
) -> Entries:
    accounts = store.accounts()
    holders = holder_names(accounts)
    kept: list[Entry] = []
    other_currency = 0
    for row in store.transactions(start, end):
        if row.currency != CURRENCY:
            other_currency += 1
            continue
        kept.append(categorise(row, rules, holders))
    opened = {
        a.hash: day for a in accounts if (day := store.opened(a.hash)) is not None
    }
    zero_before = (
        max(opened.values()) if accounts and len(opened) == len(accounts) else None
    )
    return Entries(
        tuple(kept), covered_from(accounts, opened), other_currency, zero_before
    )


def read_entries(
    start: datetime.date, end: datetime.date, *, root: Path | None = None
) -> Entries | None:
    """Categorised EUR entries booked from `start` to `end`, both included."""
    paths = Paths(root if root is not None else finance_dir())
    try:
        store = open_reader(paths.store)
    except StoreError as exc:
        raise FinanceReadError(str(exc)) from exc
    if store is None:
        return None
    try:
        rules = load_rules(paths.rules)
        return entries_from(store, rules, start, end)
    except (RulesError, StoreError) as exc:
        raise FinanceReadError(str(exc)) from exc
    except sqlite3.Error as exc:
        raise FinanceReadError(f"{paths.store} cannot be read: {exc}") from exc
    finally:
        store.close()
