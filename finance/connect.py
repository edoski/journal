"""`connect`: authorise access at the bank and store the new session.

Flow (Enable Banking quick start and API reference): POST /auth with the
consent scope, the bank and a random `state`; the user opens the returned
`url`, logs in to the bank and approves; the bank sends the browser back to
the redirect URL with `code` and `state` (or `error` and
`error_description`); POST /sessions with the code returns the session id,
the accounts and the confirmed `access.valid_until`.

The redirect URL is https://localhost/..., which nothing serves, so the
browser shows a connection error; the address of that page is the answer.
`connect` opens the bank link in Google Chrome and reads Chrome's tabs until one
shows the redirect URL with this attempt's `state`, then closes it; only when
Chrome cannot be opened or read does it print the link and ask for the address
to be pasted. Without `--bank` it connects the bank that needs it most (not
connected, then an ended consent, then the consent ending soonest).

The fetch renews by itself (`renew_bank`, under the fetch lock): for a bank
whose consent ends today or has ended it opens the link, posts a notification,
waits up to `LOGIN_WAIT` for the login and completes the connection, or
notifies the failure and leaves it to the next scheduled fetch.

Each bank has its own session; connecting a bank again replaces its session and
closes the previous one. Accounts are matched on their `identification_hash` (uids and session ids
change with every consent).
"""

from __future__ import annotations

import datetime
import hmac
import secrets
import time
import urllib.parse
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from finance.client import ApiError, EnableBankingClient, NetworkError
from finance.config import COMMAND, Bank, Paths, Settings
from finance.desktop import Browser, BrowserUnavailable, Notifier
from finance.fetch import utc_now
from finance.files import Busy, exclusive
from finance.jwt import SigningError
from finance.rules import install_starter
from finance.session import (
    Session,
    SessionAccount,
    SessionError,
    load_session,
    parse_instant,
    save_session,
)
from finance.tls import TrustError

# The consent asked for is the bank's `maximum_consent_validity` (Fineco 180
# days, Trade Republic 90) less this margin: asking for the exact maximum risks
# a 422 from rounding or a DST shift.
CONSENT_MARGIN = datetime.timedelta(days=2)
# How long `connect` and the fetch's renewal wait for the bank login in Chrome,
# and how often they read Chrome's tabs meanwhile.
LOGIN_WAIT = datetime.timedelta(minutes=15)
POLL_INTERVAL = datetime.timedelta(seconds=2)
_LOGIN_WAIT_MINUTES = int(LOGIN_WAIT.total_seconds() // 60)


def consent_length(aspsp: dict[str, Any] | None, bank: Bank) -> datetime.timedelta:
    """How long a consent to ask for, from the bank's entry in GET /aspsps."""
    if aspsp is None:
        raise ConnectError(
            f"Enable Banking does not list '{bank.name}' in {bank.country}: check the "
            "[[bank]] name in finance.toml"
        )
    seconds = aspsp.get("maximum_consent_validity")
    if not isinstance(seconds, int) or seconds <= 0:
        raise ConnectError(f"Enable Banking gives no consent length for {bank.name}")
    return max(
        datetime.timedelta(seconds=seconds) - CONSENT_MARGIN,
        datetime.timedelta(seconds=seconds) / 2,
    )


class ConnectError(RuntimeError):
    """The authorisation did not complete."""


def _same_endpoint(parts: urllib.parse.SplitResult, redirect_url: str) -> bool:
    expected = urllib.parse.urlsplit(redirect_url)
    return (parts.scheme, parts.netloc, parts.path.rstrip("/")) == (
        expected.scheme,
        expected.netloc,
        expected.path.rstrip("/"),
    )


def _values(query: str) -> dict[str, str]:
    parsed = urllib.parse.parse_qs(query, keep_blank_values=True)
    return {key: items[0] for key, items in parsed.items() if items}


def _query(pasted: str, redirect_url: str) -> dict[str, str]:
    text = pasted.strip().strip("'\"<>")
    if not text:
        raise ConnectError("nothing was pasted")
    parts = urllib.parse.urlsplit(text)
    if parts.scheme or parts.netloc:
        if not _same_endpoint(parts, redirect_url):
            raise ConnectError(
                f"that address does not start with {redirect_url}: paste the address "
                "the bank sent the browser to"
            )
        return _values(parts.query)
    return _values(text.lstrip("?"))


def _same_state(returned: str, state: str) -> bool:
    return hmac.compare_digest(returned.encode(), state.encode())


def callback_in(urls: Iterable[str], *, redirect_url: str, state: str) -> str | None:
    """The first address that is this attempt's callback: the redirect URL with
    this `state`. Other tabs, and callbacks of other attempts, are passed over."""
    for url in urls:
        parts = urllib.parse.urlsplit(url.strip())
        if not _same_endpoint(parts, redirect_url):
            continue
        if _same_state(_values(parts.query).get("state", ""), state):
            return url.strip()
    return None


def wait_for_callback(
    browser: Browser,
    *,
    redirect_url: str,
    state: str,
    sleep: Callable[[float], None],
    monotonic: Callable[[], float],
) -> str:
    """Read Chrome's tabs until this attempt's callback shows, for at most
    LOGIN_WAIT. BrowserUnavailable passes through."""
    deadline = monotonic() + LOGIN_WAIT.total_seconds()
    while True:
        found = callback_in(browser.tab_urls(), redirect_url=redirect_url, state=state)
        if found is not None:
            return found
        if monotonic() >= deadline:
            raise ConnectError(f"no bank login within {_LOGIN_WAIT_MINUTES} minutes")
        sleep(POLL_INTERVAL.total_seconds())


def code_from(pasted: str, *, redirect_url: str, state: str) -> str:
    """The authorisation code from the callback address (read from Chrome or
    pasted), after checking `state`."""
    values = _query(pasted, redirect_url)
    if "error" in values:
        detail = values.get("error_description", "")
        raise ConnectError(
            f"the bank did not authorise access: {values['error']}"
            + (f" ({detail})" if detail else "")
        )
    if not _same_state(values.get("state", ""), state):
        raise ConnectError(
            "the address belongs to another attempt (its state does not match): "
            "run connect again and use the new link"
        )
    code = values.get("code", "")
    if not code:
        raise ConnectError("the address has no code: paste the whole address")
    return code


def accounts_from(
    payload: dict[str, Any],
) -> tuple[tuple[SessionAccount, ...], list[str]]:
    items = payload.get("accounts")
    if not isinstance(items, list):
        raise ConnectError("the session has no accounts list")
    accounts: list[SessionAccount] = []
    skipped: list[str] = []
    for item in items:
        if not isinstance(item, dict) or not isinstance(
            item.get("identification_hash"), str
        ):
            raise ConnectError("an account has no identification_hash")
        account_id = item.get("account_id")
        iban = account_id.get("iban") if isinstance(account_id, dict) else None
        iban = iban if isinstance(iban, str) else ""
        uid = item.get("uid")
        if not isinstance(uid, str) or not uid:
            skipped.append(iban or item["identification_hash"][:12])
            continue
        name = item.get("name")
        currency = item.get("currency")
        accounts.append(
            SessionAccount(
                uid=uid,
                identification_hash=item["identification_hash"],
                iban=iban,
                name=name if isinstance(name, str) else "",
                currency=currency if isinstance(currency, str) else "",
            )
        )
    return tuple(accounts), skipped


@dataclass(frozen=True)
class _Attempt:
    """One authorisation: the bank link and the `state` its callback must carry."""

    url: str
    state: str
    started: datetime.datetime
    requested: str


_NO_END = datetime.datetime.min.replace(tzinfo=datetime.UTC)


def _need(
    paths: Paths, bank: Bank, now: datetime.datetime
) -> tuple[int, datetime.datetime, str]:
    """How much `bank` needs connecting: (rank, consent end, why); lowest first."""
    try:
        session = load_session(paths.session(bank))
    except SessionError:
        return 0, _NO_END, "its session file is unreadable"
    if session is None:
        return 0, _NO_END, "not connected"
    if session.needs_reconsent is not None or session.expired(now):
        return 1, session.valid_until, "access ended"
    end = session.valid_until.astimezone().strftime("%d %b %Y")
    return 2, session.valid_until, f"access ends on {end}"


def neediest_bank(
    paths: Paths, settings: Settings, now: datetime.datetime
) -> tuple[Bank, str]:
    """The bank `connect` renews when none is named, and why: not connected, then
    an ended consent, then the consent ending soonest (finance.toml order on ties)."""
    needs = {bank: _need(paths, bank, now) for bank in settings.banks}
    bank = min(settings.banks, key=lambda item: needs[item][:2])
    return bank, needs[bank][2]


def run_connect(
    paths: Paths,
    settings: Settings,
    bank: Bank | None,
    *,
    browser: Browser,
    client_factory: Callable[[Settings], EnableBankingClient] = EnableBankingClient,
    read_line: Callable[[str], str] = input,
    write: Callable[[str], None] = print,
    now: Callable[[], datetime.datetime] = utc_now,
    make_state: Callable[[], str] = lambda: secrets.token_urlsafe(24),
    sleep: Callable[[float], None] = time.sleep,
    monotonic: Callable[[], float] = time.monotonic,
) -> int:
    """Connect `bank`, or the bank that needs it most when it is None."""
    try:
        with exclusive(paths.lock):
            if bank is None:
                bank, why = neediest_bank(paths, settings, now())
                if len(settings.banks) > 1:
                    write(f"{bank.name}: {why} (name another bank with --bank).")
            client = client_factory(settings)
            attempt = _start(client, bank, now, make_state)
            code = _capture(
                attempt,
                settings.redirect_url,
                bank,
                browser=browser,
                read_line=read_line,
                write=write,
                sleep=sleep,
                monotonic=monotonic,
            )
            _finish(paths, client, bank, attempt, code, write)
    except Busy:
        write(
            "Not connected: a fetch is running (it may be waiting up to "
            f"{_LOGIN_WAIT_MINUTES} minutes for a bank login in Chrome); try again later."
        )
        return 1
    except ConnectError as exc:
        write(f"Not connected: {exc}.")
        return 1
    except (ApiError, NetworkError, SigningError, TrustError) as exc:
        write(f"Not connected: {exc}")
        return 1
    except EOFError:
        write("Not connected: no address was pasted.")
        return 1
    except KeyboardInterrupt:
        write("\nNot connected: stopped.")
        return 1
    installed = install_starter(paths.rules)
    if installed:
        write(f"Starter category rules written to {paths.rules}.")
    write(f"Next: {COMMAND} fetch")
    write(
        f"If the account is new, then run `{COMMAND} opened YYYY-MM-DD` with its opening "
        "day (add --account with its last IBAN digits when there are several accounts), "
        "so the days before it count as no spending."
    )
    return 0


def renew_bank(
    paths: Paths,
    settings: Settings,
    bank: Bank,
    session: Session,
    *,
    browser: Browser,
    notifier: Notifier,
    client_factory: Callable[[Settings], EnableBankingClient] = EnableBankingClient,
    write: Callable[[str], None] = print,
    now: Callable[[], datetime.datetime] = utc_now,
    make_state: Callable[[], str] = lambda: secrets.token_urlsafe(24),
    sleep: Callable[[float], None] = time.sleep,
    monotonic: Callable[[], float] = time.monotonic,
) -> bool:
    """Renew `bank`'s consent from the fetch, which holds the lock: open the link in
    Chrome, notify, wait for the login, store the new session. Every failure is
    notified and returns False; the next scheduled fetch tries again."""
    ended = session.needs_reconsent is not None or session.expired(now())
    try:
        client = client_factory(settings)
        attempt = _start(client, bank, now, make_state)
        browser.open(attempt.url)
        notifier.notify(
            f"{bank.name}: bank access {'ended' if ended else 'ends today'}. "
            "Log in in the Chrome tab that just opened."
        )
        write(f"{bank.name}: waiting for the bank login in Chrome.")
        url = wait_for_callback(
            browser,
            redirect_url=settings.redirect_url,
            state=attempt.state,
            sleep=sleep,
            monotonic=monotonic,
        )
        browser.close_tab(url)
        code = code_from(url, redirect_url=settings.redirect_url, state=attempt.state)
        renewed = _finish(paths, client, bank, attempt, code, write)
    except (
        ConnectError,
        BrowserUnavailable,
        ApiError,
        NetworkError,
        SigningError,
        TrustError,
        OSError,
    ) as exc:
        reason = str(exc).rstrip(".")
        write(f"{bank.name}: bank access not renewed: {reason}.")
        notifier.notify(
            f"{bank.name}: bank access not renewed ({reason}). "
            "The next scheduled fetch tries again."
        )
        return False
    end = renewed.valid_until.astimezone().strftime("%d %b %Y")
    notifier.notify(f"{bank.name}: bank access renewed until {end}.")
    return True


def _start(
    client: EnableBankingClient,
    bank: Bank,
    now: Callable[[], datetime.datetime],
    make_state: Callable[[], str],
) -> _Attempt:
    state = make_state()
    started = now()
    length = consent_length(client.aspsp(bank), bank)
    requested = (started + length).isoformat(timespec="microseconds")
    auth = client.start_authorization(bank=bank, valid_until=requested, state=state)
    url = auth.get("url")
    if not isinstance(url, str) or not url:
        raise ConnectError("Enable Banking returned no bank link")
    return _Attempt(url=url, state=state, started=started, requested=requested)


def _capture(
    attempt: _Attempt,
    redirect_url: str,
    bank: Bank,
    *,
    browser: Browser,
    read_line: Callable[[str], str],
    write: Callable[[str], None],
    sleep: Callable[[float], None],
    monotonic: Callable[[], float],
) -> str:
    """The authorisation code: from Chrome's tabs, else pasted (one line says why)."""
    try:
        browser.open(attempt.url)
        write(
            f"Log in to {bank.name} in the Chrome tab that just opened and approve the "
            f"access. Waiting up to {_LOGIN_WAIT_MINUTES} minutes for the bank to send "
            "Chrome back (Ctrl-C stops)."
        )
        url = wait_for_callback(
            browser,
            redirect_url=redirect_url,
            state=attempt.state,
            sleep=sleep,
            monotonic=monotonic,
        )
    except BrowserUnavailable as exc:
        write(f"Chrome cannot be used ({exc}); paste the address instead.")
        write(
            f"1. Open this link, log in to {bank.name} and approve the access:\n"
            f"   {attempt.url}\n"
            f"2. The bank then sends the browser to {redirect_url}?...; the page\n"
            '   will not load ("can\'t connect" or similar). That is expected: copy the\n'
            "   whole address from the address bar.\n"
        )
        pasted = read_line("3. Paste the address here: ")
        return code_from(pasted, redirect_url=redirect_url, state=attempt.state)
    browser.close_tab(url)
    return code_from(url, redirect_url=redirect_url, state=attempt.state)


def _finish(
    paths: Paths,
    client: EnableBankingClient,
    bank: Bank,
    attempt: _Attempt,
    code: str,
    write: Callable[[str], None],
) -> Session:
    """Exchange the code for a session, store it and close the previous one."""
    try:
        previous = load_session(paths.session(bank))
    except SessionError as exc:
        write(f"The stored session is unreadable and will be replaced ({exc}).")
        previous = None
    payload = client.create_session(code)
    session_id = payload.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        raise ConnectError("Enable Banking returned no session id")
    accounts, skipped = accounts_from(payload)
    if not accounts:
        raise ConnectError(
            "the bank gave no account that can be read: check that the account is "
            "linked to the application in the Enable Banking Control Panel"
        )
    access = payload.get("access")
    confirmed = access.get("valid_until") if isinstance(access, dict) else None
    valid_until = parse_instant(
        confirmed if isinstance(confirmed, str) else attempt.requested
    )
    session = Session(
        session_id=session_id,
        valid_until=valid_until,
        connected_at=attempt.started,
        accounts=accounts,
        aspsp={"name": bank.name, "country": bank.country},
    )
    save_session(paths.session(bank), session)

    known = {a.identification_hash for a in previous.accounts} if previous else set()
    for account in accounts:
        state_label = (
            "same account as before" if account.identification_hash in known else "new"
        )
        write(
            f"{bank.name} account {account.iban or account.identification_hash[:12]} "
            f"({state_label})"
        )
    for label in skipped:
        write(
            f"Account {label}: the bank allows no balances or transactions for it; skipped"
        )
    if previous:
        missing = known - {a.identification_hash for a in accounts}
        for hash_ in sorted(missing):
            write(
                f"An account of the previous consent is not in this one ({hash_[:12]}...)"
            )
        if previous.session_id != session_id:
            try:
                client.delete_session(previous.session_id)
                write("The previous session was closed.")
            except (ApiError, NetworkError) as exc:
                write(
                    f"The previous session could not be closed ({exc}); it ends by itself."
                )
    local_end = valid_until.astimezone().strftime("%d %b %Y")
    write(f"{bank.name} connected until {local_end}.")
    return session
