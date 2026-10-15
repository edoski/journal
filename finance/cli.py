"""`python -m finance`: setup, connect, fetch, status, rules, credits, balance.

`credits` and `balance` with `--json` are the read-only interface of the biz
tool. Their JSON always has `status`: "ok", "not_set_up" (no store yet) or
"error" (with `message`, exit status 1); with "ok" it also has `last_fetch`
(the last successful fetch, UTC, or null) and `problem` (one line worth
showing, or null).
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import stat
import sys
from collections import Counter
from collections.abc import Sequence
from decimal import Decimal
from pathlib import Path
from typing import Any

from finance.config import (
    Paths,
    SettingsError,
    finance_dir,
    load_settings,
    settings_text,
)
from finance.connect import run_connect
from finance.fetch import run_fetch
from finance.files import Busy, ensure_private_dir, exclusive, write_private
from finance.read import FinanceReadError, categorise, entries_from, holder_names
from finance.rules import OTHER, RulesError, install_starter, is_holder, load_rules
from finance.fetch import vanished_keys
from finance.session import SessionError, load_session
from finance.store import Account, Balance, Store, StoreError, open_reader, open_writer

STALE_AFTER = datetime.timedelta(days=2)
REJECTED_WINDOW = datetime.timedelta(days=30)
PROBLEMS_SHOWN = 2
OPENED_SLACK = datetime.timedelta(days=31)
CONSENT_WARNING = datetime.timedelta(days=14)
# Most useful first for "what can be paid now".
BALANCE_PREFERENCE = (
    "ITAV",
    "CLAV",
    "XPCD",
    "OPAV",
    "ITBD",
    "CLBD",
    "OPBD",
    "FWAV",
    "VALU",
    "PRCD",
    "INFO",
    "OTHR",
)
RECONNECT = "Journal --finance connect"


class CliError(RuntimeError):
    """A command failed with a message for the user."""


def euro(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    return f"{sign}€{abs(cents) // 100:,}.{abs(cents) % 100:02d}"


def decimal_text(cents: int) -> str:
    return str((Decimal(cents) / 100).quantize(Decimal("0.01")))


def _local(stamp: str) -> str:
    return (
        datetime.datetime.fromisoformat(stamp).astimezone().strftime("%d %b %Y %H:%M")
    )


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


# setup ---------------------------------------------------------------------


def cmd_setup(paths: Paths, args: argparse.Namespace) -> int:
    key = Path(os.path.expanduser(args.key))
    if not key.is_file():
        raise CliError(f"no key file at {key}")
    mode = stat.S_IMODE(key.stat().st_mode)
    ensure_private_dir(paths.root)
    write_private(paths.settings, settings_text(args.application_id, str(key)).encode())
    print(f"Wrote {paths.settings}")
    if install_starter(paths.rules):
        print(f"Wrote starter category rules to {paths.rules}")
    if mode & 0o077:
        print(f"Warning: {key} is readable by others (mode {mode:o}); chmod 600 it.")
    print("Next: python -m finance connect")
    return 0


# connect / fetch ---------------------------------------------------------------


def cmd_connect(paths: Paths, args: argparse.Namespace) -> int:
    settings = load_settings(paths)
    if not sys.stdin.isatty() and not args.stdin:
        raise CliError(
            "connect reads the pasted address from a terminal (or pass --stdin)"
        )
    return run_connect(paths, settings)


def cmd_fetch(paths: Paths, args: argparse.Namespace) -> int:
    settings = load_settings(paths)
    result = run_fetch(paths, settings)
    stream = sys.stdout if result.exit_code == 0 else sys.stderr
    print(result.message, file=stream)
    return result.exit_code


# shared reads -----------------------------------------------------------------


def _reader(paths: Paths) -> Store | None:
    try:
        return open_reader(paths.store)
    except StoreError as exc:
        raise CliError(str(exc)) from exc


def pick_balance(balances: Sequence[Balance]) -> Balance | None:
    order = {name: index for index, name in enumerate(BALANCE_PREFERENCE)}
    ranked = sorted(
        balances, key=lambda b: (order.get(b.balance_type, len(order)), b.name)
    )
    return ranked[0] if ranked else None


def balance_day(balance: Balance) -> str:
    if balance.reference_date:
        return balance.reference_date[:10]
    return (
        datetime.datetime.fromisoformat(balance.fetched_at)
        .astimezone()
        .date()
        .isoformat()
    )


def problems(paths: Paths, store: Store, now: datetime.datetime) -> list[str]:
    """Everything that keeps the bank data from being current, consent first."""
    try:
        session = load_session(paths.session)
    except SessionError as exc:
        return [f"bank session file unreadable: {exc}"]
    found: list[str] = []
    if session is None:
        found.append(f"bank not connected: run {RECONNECT}")
    elif session.needs_reconsent is not None:
        found.append(
            f"bank consent needs renewing ({session.needs_reconsent}): run {RECONNECT}"
        )
    elif session.expired(now):
        found.append(f"bank consent ended: run {RECONNECT}")
    elif session.valid_until - now <= CONSENT_WARNING:
        end = session.valid_until.astimezone().strftime("%d %b %Y")
        found.append(f"bank consent ends on {end}: renew it with {RECONNECT}")
    last = store.last_run("ok")
    if last is None:
        found.append("no successful bank fetch yet")
    elif now - datetime.datetime.fromisoformat(last.finished_at) > STALE_AFTER:
        found.append(f"no successful bank fetch since {_local(last.finished_at)}")
    rejected = store.rejected_since(
        (now - REJECTED_WINDOW).isoformat(timespec="seconds")
    )
    if rejected:
        found.append(
            f"{rejected} bank transaction{'' if rejected == 1 else 's'} could not be read "
            "in the last 30 days"
        )
    return found


def problem(paths: Paths, store: Store, now: datetime.datetime) -> str | None:
    """The problems as one line: the first two, then how many more."""
    found = problems(paths, store, now)
    if not found:
        return None
    line = "; ".join(found[:PROBLEMS_SHOWN])
    if len(found) > PROBLEMS_SHOWN:
        line += f" (+{len(found) - PROBLEMS_SHOWN} more: see python -m finance status)"
    elif any("could not be read" in item for item in found):
        line += ": see python -m finance status"
    return line


def _envelope(paths: Paths, store: Store) -> dict[str, Any]:
    last = store.last_run("ok")
    return {
        "status": "ok",
        "last_fetch": last.finished_at if last else None,
        "problem": problem(paths, store, _now()),
    }


def _emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))


# credits / balance -------------------------------------------------------------


def cmd_credits(paths: Paths, args: argparse.Namespace) -> int:
    since = datetime.date.fromisoformat(args.since)
    store = _reader(paths)
    if store is None:
        if args.json:
            _emit({"status": "not_set_up"})
        else:
            print("Finance is not set up (no fetch yet).")
        return 0
    try:
        # Categories are a convenience here: a broken rules file must not stop
        # biz from seeing payments, and own transfers are known without rules.
        rules_problem = None
        try:
            rules = load_rules(paths.rules)
        except RulesError as exc:
            rules, rules_problem = None, f"category rules unreadable: {exc}"
        accounts = store.accounts()
        holders = holder_names(accounts)
        ibans = {account.hash: account.iban for account in accounts}
        rows = store.transactions(since, None, flow="IN")
        credits = []
        for row in rows:
            category = categorise(row, rules, holders).category if rules else None
            credits.append(
                {
                    "key": row.key,
                    "account": row.account,
                    "iban": ibans.get(row.account, ""),
                    "date": row.booking_date.isoformat(),
                    "amount": decimal_text(row.amount_cents),
                    "currency": row.currency,
                    "counterparty": row.counterparty,
                    "remittance": row.remittance,
                    "category": category,
                    "holder": is_holder(row.counterparty, holders),
                    "transaction": json.loads(row.raw),
                }
            )
        if args.json:
            envelope = _envelope(paths, store)
            envelope["problem"] = envelope["problem"] or rules_problem
            _emit({**envelope, "credits": credits})
            return 0
        if rules_problem:
            print(f"warning: {rules_problem}", file=sys.stderr)
        for item in credits:
            print(
                f"{item['date']}  {item['amount']:>10} {item['currency']}  "
                f"{item['counterparty'] or '-'} | {item['remittance'] or '-'}"
            )
        return 0
    finally:
        store.close()


def cmd_balance(paths: Paths, args: argparse.Namespace) -> int:
    store = _reader(paths)
    if store is None:
        if args.json:
            _emit({"status": "not_set_up"})
        else:
            print("Finance is not set up (no fetch yet).")
        return 0
    try:
        accounts = {account.hash: account for account in store.accounts()}
        latest: dict[str, list[Balance]] = {}
        for balance in store.latest_balances():
            latest.setdefault(balance.account, []).append(balance)
        rows = []
        for account, balances in sorted(latest.items()):
            chosen = pick_balance(balances)
            if chosen is None:
                continue
            known = accounts.get(account)
            rows.append(
                {
                    "account": account,
                    "iban": known.iban if known else "",
                    "amount": decimal_text(chosen.amount_cents),
                    "currency": chosen.currency,
                    "type": chosen.balance_type,
                    "date": balance_day(chosen),
                    "fetched_at": chosen.fetched_at,
                }
            )
        if args.json:
            _emit({**_envelope(paths, store), "balances": rows})
            return 0
        for row in rows:
            print(
                f"{row['iban'] or row['account'][:12]}  {row['amount']} {row['currency']}  "
                f"({row['type']}, {row['date']})"
            )
        if not rows:
            print("No balance fetched yet.")
        return 0
    finally:
        store.close()


# status ------------------------------------------------------------------------


def cmd_status(paths: Paths, args: argparse.Namespace) -> int:
    now = _now()
    print(f"Finance folder  {paths.root}")
    try:
        session = load_session(paths.session)
    except SessionError as exc:
        session = None
        print(f"Consent         ERROR: {exc}")
    if session is not None:
        days = (session.valid_until - now).days
        end = session.valid_until.astimezone().strftime("%d %b %Y")
        if session.needs_reconsent is not None:
            print(
                f"Consent         NEEDS RENEWING: {session.needs_reconsent}; run connect"
            )
        elif session.expired(now):
            print(f"Consent         ENDED on {end}; run connect")
        else:
            print(f"Consent         valid until {end} ({days} days left)")
        if session.rate_limited_until is not None and session.paused(now):
            until = session.rate_limited_until.astimezone().strftime("%d %b %H:%M")
            print(f"Paused          after the bank's rate limit, until {until}")
        for account in session.accounts:
            print(f"Account         {account.iban or account.identification_hash[:12]}")
    elif not paths.session.exists():
        print("Consent         not connected (run setup, then connect)")
    store = _reader(paths)
    if store is None:
        print("Store           none yet (created by the first fetch)")
    else:
        try:
            _status_store(paths, store, now)
        finally:
            store.close()
    try:
        rules = load_rules(paths.rules)
        where = (
            paths.rules
            if paths.rules.exists()
            else "starter rules (no categories.toml yet)"
        )
        print(f"Rules           {where}: {len(rules.rules)} rules")
        for warning in rules.warnings:
            print(f"  warning: {warning}")
    except RulesError as exc:
        print(f"Rules           ERROR: {exc}")
    return 0


def _status_store(paths: Paths, store: Store, now: datetime.datetime) -> None:
    last_ok = store.last_run("ok")
    last = store.last_run()
    if last_ok:
        print(f"Last fetch      {_local(last_ok.finished_at)} ({last_ok.added} new)")
    else:
        print("Last fetch      none successful yet")
    if last and last is not last_ok and last.outcome != "ok":
        print(
            f"Last attempt    {_local(last.finished_at)}: {last.outcome}, {last.detail}"
        )
    for account in store.accounts():
        label = f"…{account.iban[-4:]}" if account.iban else account.hash[:8]
        try:
            opened = store.opened(account.hash)
        except StoreError as exc:
            print(
                f"Opened          {label}: ERROR, {exc} (set it again with finance opened)"
            )
            continue
        if opened is not None:
            print(f"Opened          {label} on {opened} (no transactions before)")
    latest: dict[str, list[Balance]] = {}
    for balance in store.latest_balances():
        latest.setdefault(balance.account, []).append(balance)
    for balances in latest.values():
        chosen = pick_balance(balances)
        if chosen:
            print(
                f"Balance         {euro(chosen.amount_cents)} on {balance_day(chosen)} "
                f"({chosen.balance_type})"
            )
    rows = store.transactions()
    if rows:
        print(
            f"Transactions    {len(rows)} stored, {rows[0].booking_date} to {rows[-1].booking_date}"
        )
    else:
        print("Transactions    none stored")
    today = now.astimezone().date()
    try:
        rules = load_rules(paths.rules)
        month = entries_from(store, rules, today.replace(day=1), today)
        other = sum(1 for entry in month.entries if entry.category == OTHER)
        count = len(month.entries)
        print(
            f"This month      {count} transaction{'' if count == 1 else 's'}, {other} in Other"
        )
        if month.other_currency:
            print(
                f"  warning: {month.other_currency} not in EUR, left out of the notes"
            )
    except (RulesError, StoreError):  # both are reported on their own lines
        pass
    rejected = store.rejected_since(
        (now - REJECTED_WINDOW).isoformat(timespec="seconds")
    )
    if rejected:
        print(
            f"Unreadable      {rejected} transactions in the last 30 days kept aside (table rejected)"
        )
    vanished = vanished_keys(store)
    if vanished:
        print(
            f"Vanished        {len(vanished)} stored transactions no longer returned by the bank"
        )
    line = problem(paths, store, now)
    if line:
        print(f"Attention       {line}")


# opened ------------------------------------------------------------------------


def _pick_account(accounts: Sequence[Account], wanted: str | None) -> Account:
    if wanted:
        key = wanted.replace("…", "").replace(" ", "")
        found = [
            a
            for a in accounts
            if (a.iban and a.iban.endswith(key)) or a.hash.startswith(key)
        ]
    else:
        found = list(accounts)
    if len(found) != 1:
        raise CliError(
            "say which account with --account (the last IBAN digits)"
            if found
            else "no such account in the store"
        )
    return found[0]


def cmd_opened(paths: Paths, args: argparse.Namespace) -> int:
    """Record the day an account was opened, so the days before it count as known
    zero. Never set automatically; refused when the bank's history says otherwise."""
    day = datetime.date.fromisoformat(args.date)
    existing = open_reader(paths.store)
    if existing is None:
        raise CliError("no store yet: run a fetch first")
    existing.close()
    with exclusive(paths.lock):
        store = open_writer(paths.store)
        try:
            account = _pick_account(store.accounts(), args.account)
            if account.history_from is None:
                raise CliError(
                    "this account has not been fetched yet: run a fetch first"
                )
            first = store.earliest_booking(account.hash) or account.history_from
            if day > first:
                raise CliError(
                    f"{day} is after the account's first booking ({first}): it was open by then"
                )
            if first - day > OPENED_SLACK:
                raise CliError(
                    f"the bank's history starts on {first}; the days before would count as zero "
                    "spending: not set (this is not a new account, or the bank cut its history)"
                )
            with store.transaction():
                store.set_opened(account.hash, day)
        finally:
            store.close()
    label = f"…{account.iban[-4:]}" if account.iban else account.hash[:8]
    print(f"Account {label} opened on {day}: the days before count as no transactions.")
    return 0


# rules -------------------------------------------------------------------------


def cmd_rules_check(paths: Paths, args: argparse.Namespace) -> int:
    rules = load_rules(paths.rules)
    source = paths.rules if paths.rules.exists() else "the starter rules"
    print(f"{source}: {len(rules.rules)} rules, valid")
    for warning in rules.warnings:
        print(f"warning: {warning}")
    return 0


def cmd_rules_unmatched(paths: Paths, args: argparse.Namespace) -> int:
    try:
        year, month = (int(part) for part in args.month.split("-"))
        start = datetime.date(year, month, 1)
    except ValueError as exc:
        raise CliError("--month must be YYYY-MM") from exc
    end = (start + datetime.timedelta(days=32)).replace(day=1) - datetime.timedelta(
        days=1
    )
    store = _reader(paths)
    if store is None:
        print("Finance is not set up (no fetch yet).")
        return 0
    try:
        entries = entries_from(store, load_rules(paths.rules), start, end).entries
    finally:
        store.close()
    other = [entry for entry in entries if entry.category == OTHER]
    groups: Counter[tuple[str, str, str]] = Counter()
    totals: Counter[tuple[str, str, str]] = Counter()
    for entry in other:
        key: tuple[str, str, str] = (entry.flow, entry.counterparty, entry.remittance)
        groups[key] += 1
        totals[key] += entry.amount_cents
    out_total = sum(e.amount_cents for e in other if e.flow == "OUT")
    in_total = sum(e.amount_cents for e in other if e.flow == "IN")
    print(
        f"Other in {args.month}: {len(other)} of {len(entries)} transactions, "
        f"{euro(out_total)} out, {euro(in_total)} in"
    )
    if not other:
        return 0
    print(f"{'COUNT':>5}  {'AMOUNT':>11}  FLOW  COUNTERPARTY | REMITTANCE")
    ranked = sorted(groups, key=lambda key: (-groups[key], -totals[key], key))
    for group in ranked:
        flow, party, remittance = group
        print(
            f"{groups[group]:>5}  {euro(totals[group]):>11}  {flow:<4}  "
            f"{party or '(none)'} | {remittance or '(none)'}"
        )
    return 0


# main --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m finance", description=__doc__.splitlines()[0]
    )
    commands = parser.add_subparsers(dest="command", required=True)
    setup = commands.add_parser(
        "setup", help="write finance.toml and the starter rules"
    )
    setup.add_argument("--application-id", required=True)
    setup.add_argument(
        "--key", required=True, help="path of the application's private key (.pem)"
    )
    connect = commands.add_parser("connect", help="authorise access at the bank")
    connect.add_argument(
        "--stdin", action="store_true", help="read the address from a pipe"
    )
    commands.add_parser("fetch", help="fetch balances and booked transactions")
    commands.add_parser("status", help="consent, last fetch, balance, counts, errors")
    rules = commands.add_parser("rules", help="category rules")
    rules_commands = rules.add_subparsers(dest="rules_command", required=True)
    rules_commands.add_parser("check", help="validate categories.toml")
    unmatched = rules_commands.add_parser(
        "unmatched", help="texts that fell into Other"
    )
    unmatched.add_argument("--month", required=True, help="YYYY-MM")
    credits = commands.add_parser("credits", help="money in since a date (for biz)")
    credits.add_argument("--since", required=True, help="YYYY-MM-DD")
    credits.add_argument("--json", action="store_true")
    opened = commands.add_parser(
        "opened",
        help="record the day a new account was opened (days before: no spending)",
    )
    opened.add_argument("date", help="YYYY-MM-DD")
    opened.add_argument(
        "--account", help="the last IBAN digits, when there are several accounts"
    )
    balance = commands.add_parser("balance", help="the latest balance (for biz)")
    balance.add_argument("--json", action="store_true")
    return parser


HANDLERS = {
    "setup": cmd_setup,
    "connect": cmd_connect,
    "fetch": cmd_fetch,
    "status": cmd_status,
    "credits": cmd_credits,
    "balance": cmd_balance,
    "opened": cmd_opened,
}


def main(argv: Sequence[str] | None = None, *, root: Path | None = None) -> int:
    os.umask(0o077)
    args = build_parser().parse_args(argv)
    paths = Paths(root if root is not None else finance_dir())
    if args.command == "rules":
        handler = (
            cmd_rules_check if args.rules_command == "check" else cmd_rules_unmatched
        )
    else:
        handler = HANDLERS[args.command]
    as_json = bool(getattr(args, "json", False))
    try:
        return handler(paths, args)
    except (
        CliError,
        SettingsError,
        RulesError,
        StoreError,
        FinanceReadError,
        ValueError,
        Busy,
    ) as exc:
        if as_json:
            _emit({"status": "error", "message": str(exc)})
        else:
            print(f"finance: {exc}", file=sys.stderr)
        return 1
