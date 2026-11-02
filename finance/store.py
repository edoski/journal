"""The local SQLite store: booked transactions, balances and fetch runs.

The fetch is its only writer (one at a time, under the fetch lock). Readers
open it read-only. Accounts are identified by Enable Banking's
`identification_hash`, which stays the same across re-consents, while account
uids and session ids change.
"""

from __future__ import annotations

import datetime
import os
import sqlite3
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from finance.files import FILE_MODE, ensure_private_dir
from finance.transactions import Booked, Flow

SCHEMA_VERSION = 1

_SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE accounts (
    hash TEXT PRIMARY KEY,
    iban TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL,
    history_from TEXT,
    last_fetch TEXT
);
CREATE TABLE transactions (
    account TEXT NOT NULL,
    key TEXT NOT NULL,
    booking_date TEXT NOT NULL,
    flow TEXT NOT NULL CHECK (flow IN ('IN', 'OUT')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency TEXT NOT NULL,
    counterparty TEXT NOT NULL,
    remittance TEXT NOT NULL,
    bank_code TEXT NOT NULL,
    raw TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    PRIMARY KEY (account, key)
);
CREATE INDEX transactions_by_date ON transactions (booking_date);
CREATE TABLE balances (
    account TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    balance_type TEXT NOT NULL,
    name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    reference_date TEXT,
    raw TEXT NOT NULL,
    PRIMARY KEY (account, fetched_at, balance_type, name)
);
CREATE TABLE rejected (
    account TEXT NOT NULL,
    raw TEXT NOT NULL,
    reason TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    PRIMARY KEY (account, raw)
);
CREATE TABLE runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    outcome TEXT NOT NULL,
    detail TEXT NOT NULL,
    added INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    calls INTEGER NOT NULL
);
"""


class StoreError(RuntimeError):
    """The store exists but cannot be read as a finance store."""


@dataclass(frozen=True)
class Account:
    hash: str
    iban: str
    name: str
    currency: str
    history_from: datetime.date | None
    last_fetch: str | None


@dataclass(frozen=True)
class Stored:
    """One stored transaction row."""

    account: str
    key: str
    booking_date: datetime.date
    flow: Flow
    amount_cents: int
    currency: str
    counterparty: str
    remittance: str
    bank_code: str
    raw: str


@dataclass(frozen=True)
class Balance:
    account: str
    fetched_at: str
    balance_type: str
    name: str
    amount_cents: int
    currency: str
    reference_date: str | None


@dataclass(frozen=True)
class Run:
    started_at: str
    finished_at: str
    outcome: str
    detail: str
    added: int
    updated: int
    calls: int


def _date_or_none(value: object) -> datetime.date | None:
    return datetime.date.fromisoformat(value) if isinstance(value, str) else None


class Store:
    """A connection to the store; use `open_writer` or `open_reader`."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._db = connection

    def close(self) -> None:
        self._db.close()

    # Reads -----------------------------------------------------------------

    def accounts(self) -> list[Account]:
        rows = self._db.execute(
            "SELECT hash, iban, name, currency, history_from, last_fetch "
            "FROM accounts ORDER BY hash"
        ).fetchall()
        return [
            Account(row[0], row[1], row[2], row[3], _date_or_none(row[4]), row[5])
            for row in rows
        ]

    def transactions(
        self,
        start: datetime.date | None = None,
        end: datetime.date | None = None,
        *,
        flow: Flow | None = None,
    ) -> list[Stored]:
        clauses: list[str] = []
        params: list[str] = []
        if start is not None:
            clauses.append("booking_date >= ?")
            params.append(start.isoformat())
        if end is not None:
            clauses.append("booking_date <= ?")
            params.append(end.isoformat())
        if flow is not None:
            clauses.append("flow = ?")
            params.append(flow)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self._db.execute(
            "SELECT account, key, booking_date, flow, amount_cents, currency, "
            "counterparty, remittance, bank_code, raw FROM transactions "
            f"{where} ORDER BY booking_date, account, key",
            params,
        ).fetchall()
        return [
            Stored(
                row[0],
                row[1],
                datetime.date.fromisoformat(row[2]),
                row[3],
                row[4],
                row[5],
                row[6],
                row[7],
                row[8],
                row[9],
            )
            for row in rows
        ]

    def earliest_booking(self, account: str) -> datetime.date | None:
        row = self._db.execute(
            "SELECT MIN(booking_date) FROM transactions WHERE account = ?",
            (account,),
        ).fetchone()
        return _date_or_none(row[0] if row else None)

    def opened(self, account: str) -> datetime.date | None:
        """The day the account was opened, if set with `finance opened`."""
        value = self.meta(f"opened:{account}")
        if value is None:
            return None
        try:
            return datetime.date.fromisoformat(value)
        except ValueError:
            raise StoreError(
                f"the stored opening date {value!r} of an account is not a date"
            ) from None

    def set_opened(self, account: str, day: datetime.date) -> None:
        self.set_meta(f"opened:{account}", day.isoformat())

    def latest_booking(self, account: str) -> datetime.date | None:
        row = self._db.execute(
            "SELECT MAX(booking_date) FROM transactions WHERE account = ?",
            (account,),
        ).fetchone()
        return _date_or_none(row[0] if row else None)

    def latest_balances(self) -> list[Balance]:
        rows = self._db.execute(
            "SELECT b.account, b.fetched_at, b.balance_type, b.name, b.amount_cents, "
            "b.currency, b.reference_date FROM balances b JOIN ("
            "SELECT account, MAX(fetched_at) AS fetched_at FROM balances "
            "GROUP BY account) last ON last.account = b.account "
            "AND last.fetched_at = b.fetched_at ORDER BY b.account, b.balance_type"
        ).fetchall()
        return [Balance(*row) for row in rows]

    def balances_since(self, since: datetime.date) -> list[Balance]:
        """Every balance fetched on or after `since` (UTC), oldest first."""
        rows = self._db.execute(
            "SELECT account, fetched_at, balance_type, name, amount_cents, currency, "
            "reference_date FROM balances WHERE fetched_at >= ? "
            "ORDER BY account, fetched_at, balance_type",
            (since.isoformat(),),
        ).fetchall()
        return [Balance(*row) for row in rows]

    def runs(self, limit: int = 20) -> list[Run]:
        rows = self._db.execute(
            "SELECT started_at, finished_at, outcome, detail, added, updated, calls "
            "FROM runs ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [Run(*row) for row in rows]

    def last_run(self, outcome: str | None = None) -> Run | None:
        if outcome is None:
            runs = self.runs(1)
            return runs[0] if runs else None
        row = self._db.execute(
            "SELECT started_at, finished_at, outcome, detail, added, updated, calls "
            "FROM runs WHERE outcome = ? ORDER BY id DESC LIMIT 1",
            (outcome,),
        ).fetchone()
        return Run(*row) if row else None

    def meta(self, key: str) -> str | None:
        row = self._db.execute(
            "SELECT value FROM meta WHERE key = ?", (key,)
        ).fetchone()
        return str(row[0]) if row else None

    def set_meta(self, key: str, value: str) -> None:
        self._db.execute(
            "INSERT INTO meta (key, value) VALUES (?, ?) "
            "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            (key, value),
        )

    def keys_between(self, account: str, start: datetime.date | None) -> set[str]:
        """Keys of the account's rows booked on or after `start` (all rows when None)."""
        if start is None:
            rows = self._db.execute(
                "SELECT key FROM transactions WHERE account = ?", (account,)
            ).fetchall()
        else:
            rows = self._db.execute(
                "SELECT key FROM transactions WHERE account = ? AND booking_date >= ?",
                (account, start.isoformat()),
            ).fetchall()
        return {str(row[0]) for row in rows}

    def reject(self, account: str, raw: str, reason: str, now: str) -> bool:
        """Keep an item that could not be read; return whether it is new."""
        cursor = self._db.execute(
            "INSERT OR IGNORE INTO rejected (account, raw, reason, first_seen) "
            "VALUES (?, ?, ?, ?)",
            (account, raw, reason, now),
        )
        return cursor.rowcount > 0

    def rejected_since(self, since: str) -> int:
        row = self._db.execute(
            "SELECT COUNT(*) FROM rejected WHERE first_seen >= ?", (since,)
        ).fetchone()
        return int(row[0]) if row else 0

    def count(self) -> int:
        row = self._db.execute("SELECT COUNT(*) FROM transactions").fetchone()
        return int(row[0]) if row else 0

    # Writes ----------------------------------------------------------------

    @contextmanager
    def transaction(self) -> Iterator[None]:
        with self._db:
            yield

    def remember_account(
        self, hash_: str, *, iban: str, name: str, currency: str
    ) -> None:
        self._db.execute(
            "INSERT INTO accounts (hash, iban, name, currency) VALUES (?, ?, ?, ?) "
            "ON CONFLICT (hash) DO UPDATE SET "
            "iban = CASE WHEN excluded.iban != '' THEN excluded.iban ELSE iban END, "
            "name = CASE WHEN excluded.name != '' THEN excluded.name ELSE name END, "
            "currency = CASE WHEN excluded.currency != '' "
            "THEN excluded.currency ELSE currency END",
            (hash_, iban, name, currency),
        )

    def upsert(
        self, account: str, keyed: Mapping[str, Booked], now: str
    ) -> tuple[int, int]:
        """Insert new rows, refresh changed ones; return (added, updated)."""
        added = updated = 0
        for key, entry in sorted(keyed.items()):
            raw = entry.raw_json
            row = self._db.execute(
                "SELECT raw FROM transactions WHERE account = ? AND key = ?",
                (account, key),
            ).fetchone()
            values = (
                entry.booking_date.isoformat(),
                entry.flow,
                entry.amount_cents,
                entry.currency,
                entry.counterparty,
                entry.remittance,
                entry.bank_code,
                raw,
            )
            if row is None:
                self._db.execute(
                    "INSERT INTO transactions (account, key, booking_date, flow, "
                    "amount_cents, currency, counterparty, remittance, bank_code, raw, "
                    "first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (account, key, *values, now, now),
                )
                added += 1
            elif row[0] != raw:
                self._db.execute(
                    "UPDATE transactions SET booking_date = ?, flow = ?, "
                    "amount_cents = ?, currency = ?, counterparty = ?, remittance = ?, "
                    "bank_code = ?, raw = ?, last_seen = ? WHERE account = ? AND key = ?",
                    (*values, now, account, key),
                )
                updated += 1
            else:
                self._db.execute(
                    "UPDATE transactions SET last_seen = ? WHERE account = ? AND key = ?",
                    (now, account, key),
                )
        return added, updated

    def mark_fetched(
        self, account: str, *, history_from: datetime.date, now: str
    ) -> None:
        self._db.execute(
            "UPDATE accounts SET last_fetch = ?, history_from = CASE "
            "WHEN history_from IS NULL OR history_from > ? THEN ? "
            "ELSE history_from END WHERE hash = ?",
            (now, history_from.isoformat(), history_from.isoformat(), account),
        )

    def add_balances(
        self,
        account: str,
        fetched_at: str,
        balances: Sequence[Balance],
        raws: Sequence[str],
    ) -> None:
        for balance, raw in zip(balances, raws, strict=True):
            self._db.execute(
                "INSERT OR REPLACE INTO balances (account, fetched_at, balance_type, "
                "name, amount_cents, currency, reference_date, raw) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    account,
                    fetched_at,
                    balance.balance_type,
                    balance.name,
                    balance.amount_cents,
                    balance.currency,
                    balance.reference_date,
                    raw,
                ),
            )

    def record_run(self, run: Run) -> None:
        with self._db:
            self._db.execute(
                "INSERT INTO runs (started_at, finished_at, outcome, detail, added, "
                "updated, calls) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    run.started_at,
                    run.finished_at,
                    run.outcome,
                    run.detail,
                    run.added,
                    run.updated,
                    run.calls,
                ),
            )


def _check_schema(connection: sqlite3.Connection, path: Path) -> None:
    try:
        row = connection.execute(
            "SELECT value FROM meta WHERE key = 'schema_version'"
        ).fetchone()
    except sqlite3.DatabaseError as exc:
        raise StoreError(f"{path} is not a finance store: {exc}") from exc
    if row is None or row[0] != str(SCHEMA_VERSION):
        found = row[0] if row else "none"
        raise StoreError(
            f"{path} has schema version {found}; this code reads version {SCHEMA_VERSION}"
        )


def open_writer(path: Path) -> Store:
    """Open (creating if needed) the store for the fetch."""
    ensure_private_dir(path.parent)
    fresh = not path.exists()
    try:
        connection = sqlite3.connect(path, timeout=30)
        if fresh:
            with connection:
                connection.executescript(_SCHEMA)
                connection.execute(
                    "INSERT INTO meta (key, value) VALUES ('schema_version', ?)",
                    (str(SCHEMA_VERSION),),
                )
        os.chmod(path, FILE_MODE)
        _check_schema(connection, path)
    except sqlite3.DatabaseError as exc:
        raise StoreError(f"{path}: {exc}") from exc
    return Store(connection)


def open_reader(path: Path) -> Store | None:
    """Open the store read-only; None when it does not exist (not set up)."""
    if not path.exists():
        return None
    try:
        connection = sqlite3.connect(
            f"{path.resolve().as_uri()}?mode=ro", uri=True, timeout=10
        )
    except sqlite3.DatabaseError as exc:
        raise StoreError(f"{path} cannot be opened: {exc}") from exc
    try:
        _check_schema(connection, path)
    except StoreError:
        connection.close()
        raise
    return Store(connection)
