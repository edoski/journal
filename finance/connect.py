"""`connect`: authorise access at the bank and store the new session.

Flow (Enable Banking quick start and API reference): POST /auth with the
consent scope, the bank and a random `state`; the user opens the returned
`url`, logs in to the bank and approves; the bank sends the browser back to
the redirect URL with `code` and `state` (or `error` and
`error_description`); POST /sessions with the code returns the session id,
the accounts and the confirmed `access.valid_until`.

The redirect URL is https://localhost/..., which nothing serves, so the
browser shows a connection error: that page's address is what gets pasted.
Running connect again replaces the session; accounts are matched on their
`identification_hash` (uids and session ids change with every consent).
"""

from __future__ import annotations

import datetime
import hmac
import secrets
import urllib.parse
from collections.abc import Callable
from typing import Any

from finance.client import ApiError, EnableBankingClient, NetworkError
from finance.config import COMMAND, Paths, Settings
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

# Fineco's maximum_consent_validity is 15552000 s (180 days); asking for the
# exact maximum risks a 422 from rounding or a DST shift, so ask a bit less.
CONSENT = datetime.timedelta(days=178)


class ConnectError(RuntimeError):
    """The authorisation did not complete."""


def _query(pasted: str, redirect_url: str) -> dict[str, str]:
    text = pasted.strip().strip("'\"<>")
    if not text:
        raise ConnectError("nothing was pasted")
    parts = urllib.parse.urlsplit(text)
    expected = urllib.parse.urlsplit(redirect_url)
    if parts.scheme or parts.netloc:
        same = (parts.scheme, parts.netloc, parts.path.rstrip("/")) == (
            expected.scheme,
            expected.netloc,
            expected.path.rstrip("/"),
        )
        if not same:
            raise ConnectError(
                f"that address does not start with {redirect_url}: paste the address "
                "the bank sent the browser to"
            )
        query = parts.query
    else:
        query = text.lstrip("?")
    values = urllib.parse.parse_qs(query, keep_blank_values=True)
    return {key: items[0] for key, items in values.items() if items}


def code_from(pasted: str, *, redirect_url: str, state: str) -> str:
    """The authorisation code from the pasted address, after checking `state`."""
    values = _query(pasted, redirect_url)
    if "error" in values:
        detail = values.get("error_description", "")
        raise ConnectError(
            f"the bank did not authorise access: {values['error']}"
            + (f" ({detail})" if detail else "")
        )
    returned = values.get("state", "")
    if not hmac.compare_digest(returned.encode(), state.encode()):
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


def run_connect(
    paths: Paths,
    settings: Settings,
    *,
    client_factory: Callable[[Settings], EnableBankingClient] = EnableBankingClient,
    read_line: Callable[[str], str] = input,
    write: Callable[[str], None] = print,
    now: Callable[[], datetime.datetime] = utc_now,
    make_state: Callable[[], str] = lambda: secrets.token_urlsafe(24),
) -> int:
    try:
        with exclusive(paths.lock):
            return _connect(
                paths, settings, client_factory, read_line, write, now, make_state
            )
    except Busy:
        write("Not connected: a fetch is running; try again in a minute.")
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


def _connect(
    paths: Paths,
    settings: Settings,
    client_factory: Callable[[Settings], EnableBankingClient],
    read_line: Callable[[str], str],
    write: Callable[[str], None],
    now: Callable[[], datetime.datetime],
    make_state: Callable[[], str],
) -> int:
    try:
        previous = load_session(paths.session)
    except SessionError as exc:
        write(f"The stored session is unreadable and will be replaced ({exc}).")
        previous = None
    client = client_factory(settings)
    state = make_state()
    started = now()
    requested = (started + CONSENT).isoformat(timespec="microseconds")
    auth = client.start_authorization(valid_until=requested, state=state)
    url = auth.get("url")
    if not isinstance(url, str) or not url:
        raise ConnectError("Enable Banking returned no bank link")
    write(
        f"1. Open this link, log in to {settings.aspsp_name} and approve the access:\n"
        f"   {url}\n"
        f"2. The bank then sends the browser to {settings.redirect_url}?...; the page\n"
        '   will not load ("can\'t connect" or similar). That is expected: copy the\n'
        "   whole address from the address bar.\n"
    )
    code = code_from(
        read_line("3. Paste the address here: "),
        redirect_url=settings.redirect_url,
        state=state,
    )
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
    valid_until = parse_instant(confirmed if isinstance(confirmed, str) else requested)
    session = Session(
        session_id=session_id,
        valid_until=valid_until,
        connected_at=started,
        accounts=accounts,
        aspsp={"name": settings.aspsp_name, "country": settings.aspsp_country},
    )
    save_session(paths.session, session)
    installed = install_starter(paths.rules)

    known = {a.identification_hash for a in previous.accounts} if previous else set()
    for account in accounts:
        state_label = (
            "same account as before" if account.identification_hash in known else "new"
        )
        write(
            f"Account {account.iban or account.identification_hash[:12]} ({state_label})"
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
    write(f"Connected until {local_end}.")
    if installed:
        write(f"Starter category rules written to {paths.rules}.")
    write(f"Next: {COMMAND} fetch")
    write(
        f"If the account is new, then run `{COMMAND} opened YYYY-MM-DD` with its opening "
        "day, so the days before it count as no spending."
    )
    return 0
