"""connect: the bank link, the pasted redirect, the stored session."""

from __future__ import annotations

import datetime
import os
import stat

import pytest

from finance.config import Paths, Settings
from finance.connect import ConnectError, code_from, run_connect
from finance.session import load_session

from tests.finance.conftest import NOW, connected
from tests.finance.fake_bank import FakeBank, account, client_factory

REDIRECT = "https://localhost/enablebanking/callback"


def connect(
    paths: Paths, settings: Settings, bank: FakeBank, pasted: str
) -> tuple[int, list[str]]:
    out: list[str] = []
    code = run_connect(
        paths,
        settings,
        client_factory=client_factory(bank),
        read_line=lambda prompt: pasted,
        write=out.append,
        now=lambda: NOW,
        make_state=lambda: "STATE123",
    )
    return code, out


def test_connect_asks_the_bank_and_stores_the_session(
    paths: Paths, settings: Settings
) -> None:
    bank = FakeBank(
        accounts=[account("uid-1", "hash-1", "IT00X0000000000000000000000")]
    )
    code, out = connect(paths, settings, bank, f"{REDIRECT}?state=STATE123&code=CODE9")
    assert code == 0, out
    [auth] = bank.requests("POST", "/auth")
    body = auth.body
    assert body["aspsp"] == {"name": "FinecoBank", "country": "IT"}
    assert body["psu_type"] == "personal"
    assert body["redirect_url"] == REDIRECT
    assert body["state"] == "STATE123"
    assert body["access"]["balances"] is True and body["access"]["transactions"] is True
    valid_until = datetime.datetime.fromisoformat(body["access"]["valid_until"])
    assert valid_until.utcoffset() == datetime.timedelta(0)
    assert (
        datetime.timedelta(days=177)
        < valid_until - NOW
        < datetime.timedelta(seconds=15552000)
    )
    [session_call] = bank.requests("POST", "/sessions")
    assert session_call.body == {"code": "CODE9"}
    session = load_session(paths.session)
    assert session is not None and session.session_id == "session-1"
    assert session.valid_until == datetime.datetime(
        2027, 4, 11, 10, tzinfo=datetime.UTC
    )
    assert [(a.uid, a.identification_hash, a.iban) for a in session.accounts] == [
        ("uid-1", "hash-1", "IT00X0000000000000000000000")
    ]
    assert stat.S_IMODE(os.stat(paths.session).st_mode) == 0o600
    assert stat.S_IMODE(os.stat(paths.root).st_mode) == 0o700
    assert paths.rules.exists()
    text = "\n".join(out)
    assert bank.auth_url in text and "can't connect" in text


def test_reconnecting_replaces_the_session_and_matches_accounts(
    paths: Paths, settings: Settings
) -> None:
    connected(paths)
    bank = FakeBank(
        accounts=[account("uid-2", "hash-1"), account("uid-3", "hash-9", "IT11")],
        session_id="session-2",
    )
    code, out = connect(paths, settings, bank, f"{REDIRECT}?code=C&state=STATE123")
    assert code == 0
    session = load_session(paths.session)
    assert session is not None and session.session_id == "session-2"
    assert session.needs_reconsent is None and session.rate_limited_until is None
    assert any("same account as before" in line for line in out)
    assert any("(new)" in line for line in out)
    assert [c.path for c in bank.requests("DELETE", "")] == ["/sessions/session-1"]


@pytest.mark.parametrize(
    ("pasted", "message"),
    [
        (f"{REDIRECT}?code=C&state=OTHER", "another attempt"),
        (
            f"{REDIRECT}?error=access_denied&error_description=Cancelled+by+user&state=STATE123",
            "access_denied (Cancelled by user)",
        ),
        (
            "https://evil.example/enablebanking/callback?code=C&state=STATE123",
            "does not start with",
        ),
        (f"{REDIRECT}?state=STATE123", "has no code"),
        ("   ", "nothing was pasted"),
    ],
)
def test_bad_pastes_store_nothing(
    paths: Paths, settings: Settings, pasted: str, message: str
) -> None:
    bank = FakeBank(accounts=[account("uid-1", "hash-1")])
    code, out = connect(paths, settings, bank, pasted)
    assert code == 1
    assert message in out[-1]
    assert not paths.session.exists()
    assert bank.requests("POST", "/sessions") == []


def test_accepts_the_query_alone_and_quotes() -> None:
    assert code_from("'?code=X&state=S'", redirect_url=REDIRECT, state="S") == "X"
    assert (
        code_from(f" <{REDIRECT}/?code=Y&state=S> ", redirect_url=REDIRECT, state="S")
        == "Y"
    )
    with pytest.raises(ConnectError):
        code_from("code=X&state=T", redirect_url=REDIRECT, state="S")


def test_accounts_without_uid_are_skipped_and_none_at_all_is_an_error(
    paths: Paths, settings: Settings
) -> None:
    card = account("", "hash-card", "IT22")
    bank = FakeBank(accounts=[account("uid-1", "hash-1"), card])
    code, out = connect(paths, settings, bank, f"{REDIRECT}?code=C&state=STATE123")
    assert code == 0 and any("skipped" in line for line in out)
    empty = FakeBank(accounts=[card])
    paths.session.unlink()
    code, out = connect(paths, settings, empty, f"{REDIRECT}?code=C&state=STATE123")
    assert code == 1 and "linked to the application" in out[-1]
    assert not paths.session.exists()


def test_eof_on_stdin_is_a_clean_failure(paths: Paths, settings: Settings) -> None:
    def eof(prompt: str) -> str:
        raise EOFError

    out: list[str] = []
    code = run_connect(
        paths,
        settings,
        client_factory=client_factory(FakeBank()),
        read_line=eof,
        write=out.append,
        now=lambda: NOW,
    )
    assert code == 1 and "no address" in out[-1]
