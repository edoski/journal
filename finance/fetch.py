"""One fetch run: booked transactions and balances into the store.

- One run at a time (the fetch lock); a second one exits at once.
- The first fetch of an account asks for the longest history
  (`strategy=longest`); later ones start `OVERLAP_DAYS` before the last booked
  date (`strategy=default`, falling back once to `longest` if the bank answers
  WRONG_TRANSACTIONS_PERIOD), so late bookings are caught and reruns are
  idempotent.
- Pages follow `continuation_key` until there is none; a repeated key stops the
  run there and a page identical to an earlier one is counted once.
- An account's rows are committed only when all its pages arrived.
- A 429 (ASPSP_RATE_LIMIT_EXCEEDED) is recorded and the fetch pauses for 6
  hours without retrying; an ended session (EXPIRED_SESSION and the other
  session errors) is recorded as "needs reconsent" and the run exits 3.
- Balances are fetched with the first successful run of each day, after the
  transactions, so a failing balance call never blocks the transactions and
  the run makes about four bank calls a day at three runs.
"""

from __future__ import annotations

import datetime
import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from finance.client import PERIOD_ERROR, ApiError, EnableBankingClient, NetworkError
from finance.config import Paths, Settings
from finance.files import Busy, exclusive
from finance.jwt import SigningError
from finance.session import Session, SessionAccount, load_session, save_session
from finance.store import Balance, Run, Store, open_writer
from finance.tls import TrustError
from finance.transactions import (
    Booked,
    MalformedTransaction,
    assign_keys,
    canonical_json,
    parse_booked,
    to_cents,
)

OVERLAP_DAYS = 10
RATE_LIMIT_PAUSE = datetime.timedelta(hours=6)
# The pause ends a little early so the run scheduled 6 hours later is not skipped
# by a fraction of a second.
PAUSE_SLACK = datetime.timedelta(minutes=5)
MAX_PAGES = 500

Outcome = Literal[
    "ok", "rate_limited", "needs_reconsent", "error", "skipped", "busy", "not_connected"
]
EXIT_OK = 0
EXIT_ERROR = 1
EXIT_RECONSENT = 3


@dataclass(frozen=True)
class FetchResult:
    outcome: Outcome
    message: str
    exit_code: int
    added: int = 0
    updated: int = 0
    calls: int = 0


class FetchIncomplete(RuntimeError):
    """The pages did not end."""


def utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


def local_today() -> datetime.date:
    return datetime.date.today()


def _stamp(value: datetime.datetime) -> str:
    return value.astimezone(datetime.UTC).isoformat(timespec="seconds")


def _local(value: datetime.datetime) -> str:
    return value.astimezone().strftime("%Y-%m-%d %H:%M")


@dataclass
class _Pages:
    booked: list[Booked]
    rejected: list[tuple[str, str]]  # (raw JSON, reason)
    warnings: list[str]


def _pages(
    client: EnableBankingClient,
    uid: str,
    *,
    date_from: str | None,
    strategy: str,
    strict: bool,
) -> _Pages:
    """All pages of one request. A booked item that cannot be read is set aside,
    not fatal; a malformed page is. With `strict` (the first, longest fetch) a
    repeated continuation key is an error, so the history is fetched again."""
    found = _Pages([], [], [])
    seen_keys: set[str] = set()
    seen_pages: set[str] = set()
    key: str | None = None
    for _ in range(MAX_PAGES):
        page = client.transactions(
            uid, date_from=date_from, strategy=strategy, continuation_key=key
        )
        items = page.get("transactions")
        if not isinstance(items, list):
            raise MalformedTransaction("the answer has no transactions list")
        signature = canonical_json(items)
        if items and signature in seen_pages:
            found.warnings.append(
                "the bank sent the same page twice; it was counted once"
            )
        else:
            seen_pages.add(signature)
            for raw in items:
                try:
                    entry = parse_booked(raw)
                except MalformedTransaction as exc:
                    found.rejected.append((canonical_json(raw), str(exc)))
                    continue
                if entry is not None:
                    found.booked.append(entry)
        following = page.get("continuation_key")
        if not following:
            return found
        if not isinstance(following, str):
            raise MalformedTransaction("continuation_key is not a string")
        if following in seen_keys:
            if strict:
                raise FetchIncomplete(
                    "the bank repeated a continuation key during the first fetch; "
                    "the whole history is asked for again next time"
                )
            found.warnings.append(
                "the bank repeated a continuation key; the pages stop there"
            )
            return found
        seen_keys.add(following)
        key = following
    raise FetchIncomplete(f"the bank kept sending pages (more than {MAX_PAGES})")


def _fetch_transactions(
    client: EnableBankingClient, uid: str, *, date_from: str | None, first: bool
) -> _Pages:
    if first:
        return _pages(client, uid, date_from=None, strategy="longest", strict=True)
    try:
        return _pages(
            client, uid, date_from=date_from, strategy="default", strict=False
        )
    except ApiError as exc:
        if exc.error != PERIOD_ERROR:
            raise
        found = _pages(
            client, uid, date_from=date_from, strategy="longest", strict=False
        )
        found.warnings.insert(0, f"{PERIOD_ERROR}: fetched what the bank still has")
        return found


def parse_balances(payload: dict[str, Any]) -> list[tuple[Balance, str]]:
    items = payload.get("balances")
    if not isinstance(items, list):
        raise MalformedTransaction("the answer has no balances list")
    parsed: list[tuple[Balance, str]] = []
    for item in items:
        if not isinstance(item, dict):
            raise MalformedTransaction("a balance is not a JSON object")
        amount = item.get("balance_amount")
        if not isinstance(amount, dict) or not isinstance(amount.get("amount"), str):
            raise MalformedTransaction("a balance has no balance_amount.amount")
        reference = item.get("reference_date")
        parsed.append(
            (
                Balance(
                    account="",
                    fetched_at="",
                    balance_type=str(item.get("balance_type") or "OTHR"),
                    name=str(item.get("name") or ""),
                    amount_cents=to_cents(amount["amount"]),
                    currency=str(amount.get("currency") or "EUR"),
                    reference_date=reference if isinstance(reference, str) else None,
                ),
                canonical_json(item),
            )
        )
    return parsed


def account_label(iban: str, account: str) -> str:
    """An account in run notes and logs: the last four IBAN digits, never the whole IBAN."""
    return f"…{iban[-4:]}" if iban else f"account {account[:8]}"


def _vanished_key(account: str) -> str:
    return f"vanished:{account}"


def vanished_keys(store: Store) -> list[str]:
    """Stored rows the latest fetch of each account no longer returned."""
    keys: list[str] = []
    for account in store.accounts():
        value = store.meta(_vanished_key(account.hash))
        if value:
            keys.extend(json.loads(value))
    return keys


def _balance_key(account: str) -> str:
    return f"balance_day:{account}"


def _needs_balance(store: Store, account: str, today: datetime.date) -> bool:
    """One balance call per account and day, whatever the bank answered."""
    return store.meta(_balance_key(account)) != today.isoformat()


@dataclass
class _Tally:
    added: int = 0
    updated: int = 0


def _sync_account(
    store: Store,
    client: EnableBankingClient,
    session_account: SessionAccount,
    *,
    now: datetime.datetime,
    today: datetime.date,
    tally: _Tally,
    notes: list[str],
) -> None:
    account = session_account.identification_hash
    known = {item.hash: item for item in store.accounts()}[account]
    first = known.last_fetch is None
    since: datetime.date | None = None
    if not first:
        latest = store.latest_booking(account)
        base = latest or datetime.datetime.fromisoformat(str(known.last_fetch)).date()
        since = min(base, today) - datetime.timedelta(days=OVERLAP_DAYS)
    found = _fetch_transactions(
        client,
        session_account.uid,
        date_from=since.isoformat() if since else None,
        first=first,
    )
    keyed = assign_keys(found.booked)
    earliest = min((entry.booking_date for entry in found.booked), default=today)
    stamp = _stamp(now)
    with store.transaction():
        before = store.keys_between(account, since)
        added, updated = store.upsert(account, keyed, stamp)
        store.mark_fetched(account, history_from=min(earliest, today), now=stamp)
        new_rejects = sum(
            store.reject(account, raw, reason, stamp) for raw, reason in found.rejected
        )
        vanished = sorted(before - set(keyed))
        store.set_meta(_vanished_key(account), json.dumps(vanished))
    tally.added += added
    tally.updated += updated
    label = account_label(session_account.iban, account)
    notes.append(f"{label}: {added} new, {updated} changed")
    if found.rejected:
        notes.append(
            f"{label}: {len(found.rejected)} transactions could not be read "
            f"({new_rejects} new; kept aside: {found.rejected[0][1]})"
        )
    conflicts = sum(1 for entry in found.booked if entry.sign_conflict)
    if conflicts:
        notes.append(
            f"{label}: {conflicts} credits with a negative amount (indicator and sign disagree)"
        )
    if vanished:
        notes.append(
            f"{label}: {len(vanished)} stored transactions no longer returned by the bank "
            f"({', '.join(vanished[:3])}{', ...' if len(vanished) > 3 else ''})"
        )
    notes.extend(f"{label}: {warning}" for warning in found.warnings)
    if not _needs_balance(store, account, today):
        return
    try:
        balances = parse_balances(client.balances(session_account.uid))
    except ApiError as exc:
        if exc.rate_limited or exc.needs_reconsent:
            raise
        notes.append(f"{label}: balance not read ({exc})")
        return
    except (NetworkError, MalformedTransaction) as exc:
        notes.append(f"{label}: balance not read ({exc})")
        return
    with store.transaction():
        store.add_balances(
            account,
            _stamp(now),
            [balance for balance, _ in balances],
            [raw for _, raw in balances],
        )
        store.set_meta(_balance_key(account), today.isoformat())


def run_fetch(
    paths: Paths,
    settings: Settings,
    *,
    client_factory: Callable[[Settings], EnableBankingClient] = EnableBankingClient,
    now: Callable[[], datetime.datetime] = utc_now,
    today: Callable[[], datetime.date] = local_today,
) -> FetchResult:
    try:
        with exclusive(paths.lock):
            return _locked_fetch(paths, settings, client_factory, now, today())
    except Busy as exc:
        return FetchResult("busy", f"Skipped: {exc}.", EXIT_OK)


def _record(
    store: Store,
    started: datetime.datetime,
    result: FetchResult,
    detail: str,
    clock: Callable[[], datetime.datetime],
) -> None:
    store.record_run(
        Run(
            started_at=_stamp(started),
            finished_at=_stamp(max(clock(), started)),
            outcome=result.outcome,
            detail=detail,
            added=result.added,
            updated=result.updated,
            calls=result.calls,
        )
    )


def _locked_fetch(
    paths: Paths,
    settings: Settings,
    client_factory: Callable[[Settings], EnableBankingClient],
    clock: Callable[[], datetime.datetime],
    today: datetime.date,
) -> FetchResult:
    started = clock()
    session = load_session(paths.session)
    if session is None:
        return FetchResult(
            "not_connected",
            "Not connected to the bank yet: run `python -m finance connect`.",
            EXIT_RECONSENT,
        )
    store = open_writer(paths.store)
    try:
        return _fetch_with(
            paths, store, session, settings, client_factory, started, today, clock
        )
    finally:
        store.close()


def _fetch_with(
    paths: Paths,
    store: Store,
    session: Session,
    settings: Settings,
    client_factory: Callable[[Settings], EnableBankingClient],
    started: datetime.datetime,
    today: datetime.date,
    clock: Callable[[], datetime.datetime],
) -> FetchResult:
    reconnect = (
        "run `python -m finance connect` and approve the access in the Fineco app"
    )
    if session.needs_reconsent is None and session.expired(started):
        session = session.flag_reconsent(
            f"the consent ended on {_local(session.valid_until)}", started
        )
        save_session(paths.session, session)
    if session.needs_reconsent is not None:
        result = FetchResult(
            "needs_reconsent",
            f"The bank consent needs renewing ({session.needs_reconsent}): {reconnect}.",
            EXIT_RECONSENT,
        )
        _record(store, started, result, session.needs_reconsent, clock)
        return result
    if session.rate_limited_until is not None and session.paused(started):
        result = FetchResult(
            "skipped",
            "Skipped: paused after the bank's rate limit until "
            f"{_local(session.rate_limited_until)}.",
            EXIT_OK,
        )
        _record(store, started, result, "rate-limit pause", clock)
        return result

    client = client_factory(settings)
    tally = _Tally()
    notes: list[str] = []
    with store.transaction():
        for account in session.accounts:
            store.remember_account(
                account.identification_hash,
                iban=account.iban,
                name=account.name,
                currency=account.currency,
            )
    try:
        for account in session.accounts:
            _sync_account(
                store,
                client,
                account,
                now=started,
                today=today,
                tally=tally,
                notes=notes,
            )
    except ApiError as exc:
        partial = "; ".join(notes)
        if exc.rate_limited:
            until = started + RATE_LIMIT_PAUSE - PAUSE_SLACK
            save_session(paths.session, session.pause(until))
            result = FetchResult(
                "rate_limited",
                f"The bank's rate limit was reached ({exc.status} {exc.error or ''}"
                f"): not retried; fetching resumes after {_local(until)}.",
                EXIT_OK,
                tally.added,
                tally.updated,
                client.calls,
            )
        elif exc.needs_reconsent:
            reason = f"{exc.error} on {_local(started)}"
            save_session(paths.session, session.flag_reconsent(reason, started))
            result = FetchResult(
                "needs_reconsent",
                f"The bank session has ended ({exc.error}): {reconnect}.",
                EXIT_RECONSENT,
                tally.added,
                tally.updated,
                client.calls,
            )
        else:
            result = FetchResult(
                "error",
                f"Fetch failed: {exc}",
                EXIT_ERROR,
                tally.added,
                tally.updated,
                client.calls,
            )
        _record(
            store, started, result, "; ".join(filter(None, [str(exc), partial])), clock
        )
        return result
    except (
        NetworkError,
        SigningError,
        TrustError,
        MalformedTransaction,
        FetchIncomplete,
    ) as exc:
        result = FetchResult(
            "error",
            f"Fetch failed: {exc}",
            EXIT_ERROR,
            tally.added,
            tally.updated,
            client.calls,
        )
        _record(store, started, result, "; ".join([str(exc), *notes]), clock)
        return result
    if session.rate_limited_until is not None:
        save_session(paths.session, session.resume())
    summary = "; ".join(notes) or "no accounts in the session"
    result = FetchResult(
        "ok",
        f"Fetched {tally.added} new and {tally.updated} changed transactions ({summary}).",
        EXIT_OK,
        tally.added,
        tally.updated,
        client.calls,
    )
    _record(store, started, result, summary, clock)
    return result
