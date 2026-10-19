"""Renewing a consent: the day-of rule, the bank `connect` picks, the callback read
from Chrome's tabs, the paste fallback, and the fetch's own renewal."""

from __future__ import annotations

import datetime
from collections.abc import Callable, Iterator

import pytest

from finance.config import DEFAULT_BANK, Bank, Paths, Settings, load_settings
from finance.connect import (
    LOGIN_WAIT,
    ConnectError,
    callback_in,
    code_from,
    neediest_bank,
    renew_bank,
    run_connect,
    wait_for_callback,
)
from finance.fetch import FetchResult, run_fetch
from finance.files import Busy, exclusive
from finance.session import Session, SessionAccount, load_session

from tests.finance.conftest import NOW, TODAY, connected
from tests.finance.fake_bank import FakeBank, account, client_factory, tx
from tests.finance.fake_desktop import FakeChrome, FakeClock, FakeNotifier
from tests.finance.test_two_banks import (
    FINECO_ACCOUNT,
    TR_ACCOUNT,
    TRADE_REPUBLIC,
    two_banks,
)

REDIRECT = "https://localhost/enablebanking/callback"
OTHER_TAB = "https://mail.example/inbox"
ENDS_TODAY = NOW + datetime.timedelta(hours=1)
ENDS_LATER = NOW + datetime.timedelta(days=2)


def callback(state: str, code: str = "CODE9") -> str:
    return f"{REDIRECT}?state={state}&code={code}"


def states(*values: str) -> Callable[[], str]:
    produced: Iterator[str] = iter(values)
    return lambda: next(produced)


def no_paste(prompt: str) -> str:
    raise AssertionError("connect asked for a paste although Chrome works")


# the day-of rule ---------------------------------------------------------------


def test_renewal_is_due_on_the_day_the_consent_ends_and_after(paths: Paths) -> None:
    now = datetime.datetime(2026, 10, 20, 12, 0).astimezone()
    session = connected(paths)

    def ending(when: datetime.datetime, **changes: object) -> Session:
        return session.__class__(**{**session.__dict__, "valid_until": when, **changes})

    assert ending(now.replace(hour=23, minute=59)).renewal_due(now)
    assert ending(now - datetime.timedelta(days=3)).renewal_due(now)
    tomorrow = (now + datetime.timedelta(days=1)).replace(hour=0, minute=1)
    assert not ending(tomorrow).renewal_due(now)
    assert not ending(now + datetime.timedelta(days=14)).renewal_due(now)
    revoked = ending(now + datetime.timedelta(days=60), needs_reconsent="EXPIRED")
    assert revoked.renewal_due(now)


# the bank connect picks ---------------------------------------------------------


def test_connect_without_a_bank_picks_the_one_that_needs_it_most(paths: Paths) -> None:
    settings = two_banks(paths)
    assert neediest_bank(paths, settings, NOW) == (DEFAULT_BANK, "not connected")
    connected(paths, FINECO_ACCOUNT, valid_until=ENDS_LATER)
    assert neediest_bank(paths, settings, NOW) == (TRADE_REPUBLIC, "not connected")
    connected(paths, TR_ACCOUNT, bank=TRADE_REPUBLIC, valid_until=ENDS_LATER)
    assert (
        neediest_bank(paths, settings, NOW)[0] == DEFAULT_BANK
    )  # tie: finance.toml order
    connected(
        paths,
        TR_ACCOUNT,
        bank=TRADE_REPUBLIC,
        valid_until=ENDS_LATER - datetime.timedelta(hours=1),
    )
    bank, why = neediest_bank(paths, settings, NOW)
    assert bank == TRADE_REPUBLIC and why.startswith("access ends on ")
    connected(paths, FINECO_ACCOUNT, valid_until=ENDS_LATER, needs_reconsent="X")
    assert neediest_bank(paths, settings, NOW) == (DEFAULT_BANK, "access ended")
    paths.session(TRADE_REPUBLIC).write_text("{")
    assert neediest_bank(paths, settings, NOW) == (
        TRADE_REPUBLIC,
        "its session file is unreadable",
    )


def test_connect_without_a_bank_says_which_it_renews(paths: Paths) -> None:
    settings = two_banks(paths)
    connected(paths, FINECO_ACCOUNT, valid_until=ENDS_LATER)
    connected(paths, TR_ACCOUNT, bank=TRADE_REPUBLIC, valid_until=ENDS_TODAY)
    fake = FakeBank(accounts=[account("uid-2b", "hash-2")], session_id="tr-2")
    chrome = FakeChrome(reads=[[OTHER_TAB, callback("S")]])
    out: list[str] = []
    code = run_connect(
        paths,
        settings,
        None,
        browser=chrome,
        client_factory=client_factory(fake),
        read_line=no_paste,
        write=out.append,
        now=lambda: NOW,
        make_state=lambda: "S",
    )
    assert code == 0, out
    assert out[0].startswith("Trade Republic: access ends on ")
    assert out[0].endswith("(name another bank with --bank).")
    [auth] = fake.requests("POST", "/auth")
    assert auth.body["aspsp"] == {"name": "Trade Republic", "country": "IT"}
    renewed = load_session(paths.session(TRADE_REPUBLIC))
    assert renewed is not None and renewed.session_id == "tr-2"


# the callback in Chrome's tabs -------------------------------------------------


def test_the_callback_is_this_attempts_redirect_and_nothing_else() -> None:
    mine = callback("S")
    assert callback_in([OTHER_TAB, mine], redirect_url=REDIRECT, state="S") == mine
    assert callback_in([callback("OLD")], redirect_url=REDIRECT, state="S") is None
    assert (
        callback_in(
            ["https://evil.example/enablebanking/callback?state=S&code=C"],
            redirect_url=REDIRECT,
            state="S",
        )
        is None
    )
    assert callback_in([f"{REDIRECT}?code=C"], redirect_url=REDIRECT, state="S") is None
    error = f"{REDIRECT}/?error=access_denied&error_description=Cancelled&state=S"
    assert callback_in([error], redirect_url=REDIRECT, state="S") == error
    with pytest.raises(ConnectError, match="access_denied"):
        code_from(error, redirect_url=REDIRECT, state="S")


def test_connect_reads_the_callback_from_chrome_and_closes_its_tab(
    paths: Paths, settings: Settings
) -> None:
    previous = connected(paths)
    fake = FakeBank(accounts=[account("uid-2", "hash-1")], session_id="session-2")
    mine = callback("STATE123", "CODE9")
    chrome = FakeChrome(reads=[[OTHER_TAB], [OTHER_TAB, callback("OLD")], [mine]])
    clock = FakeClock()
    out: list[str] = []
    code = run_connect(
        paths,
        settings,
        None,
        browser=chrome,
        client_factory=client_factory(fake),
        read_line=no_paste,
        write=out.append,
        now=lambda: NOW,
        make_state=lambda: "STATE123",
        sleep=clock.sleep,
        monotonic=clock.monotonic,
    )
    assert code == 0, out
    assert chrome.opened == [fake.auth_url]
    assert chrome.closed == [mine]
    assert (chrome.read_count, clock.sleeps) == (3, 2)
    assert out[0].startswith("Log in to FinecoBank in the Chrome tab that just opened")
    [session_call] = fake.requests("POST", "/sessions")
    assert session_call.body == {"code": "CODE9"}
    assert [c.path for c in fake.requests("DELETE", "")] == [
        f"/sessions/{previous.session_id}"
    ]
    assert not any("Paste" in line for line in out)


def test_an_error_callback_stores_nothing(paths: Paths, settings: Settings) -> None:
    fake = FakeBank(accounts=[account("uid-1", "hash-1")])
    error = f"{REDIRECT}?error=access_denied&state=S"
    chrome = FakeChrome(reads=[[error]])
    out: list[str] = []
    code = run_connect(
        paths,
        settings,
        DEFAULT_BANK,
        browser=chrome,
        client_factory=client_factory(fake),
        read_line=no_paste,
        write=out.append,
        now=lambda: NOW,
        make_state=lambda: "S",
    )
    assert code == 1 and "did not authorise access: access_denied" in out[-1]
    assert chrome.closed == [error]
    assert fake.requests("POST", "/sessions") == []
    assert not paths.session(DEFAULT_BANK).exists()


def test_the_wait_ends_after_the_login_wait(paths: Paths, settings: Settings) -> None:
    clock = FakeClock()
    chrome = FakeChrome(reads=[[OTHER_TAB, callback("OLD")]])
    with pytest.raises(ConnectError, match="no bank login within 15 minutes"):
        wait_for_callback(
            chrome,
            redirect_url=REDIRECT,
            state="S",
            sleep=clock.sleep,
            monotonic=clock.monotonic,
        )
    assert clock.seconds == LOGIN_WAIT.total_seconds()
    fake = FakeBank(accounts=[account("uid-1", "hash-1")])
    clock = FakeClock()
    out: list[str] = []
    code = run_connect(
        paths,
        settings,
        DEFAULT_BANK,
        browser=FakeChrome(),
        client_factory=client_factory(fake),
        read_line=no_paste,
        write=out.append,
        now=lambda: NOW,
        sleep=clock.sleep,
        monotonic=clock.monotonic,
    )
    assert code == 1 and out[-1] == "Not connected: no bank login within 15 minutes."
    assert not paths.session(DEFAULT_BANK).exists()


@pytest.mark.parametrize(
    ("chrome", "reason"),
    [
        (FakeChrome(cannot_open="Google Chrome cannot be opened"), "cannot be opened"),
        (
            FakeChrome(cannot_read="Journal may not control Google Chrome"),
            "may not control",
        ),
        (FakeChrome(cannot_read="osascript failed: boom"), "osascript failed"),
    ],
)
def test_without_chrome_connect_asks_for_the_address(
    paths: Paths, settings: Settings, chrome: FakeChrome, reason: str
) -> None:
    fake = FakeBank(accounts=[account("uid-1", "hash-1")])
    out: list[str] = []
    code = run_connect(
        paths,
        settings,
        DEFAULT_BANK,
        browser=chrome,
        client_factory=client_factory(fake),
        read_line=lambda prompt: callback("S", "PASTED"),
        write=out.append,
        now=lambda: NOW,
        make_state=lambda: "S",
    )
    assert code == 0, out
    [why] = [line for line in out if line.startswith("Chrome cannot be used")]
    assert reason in why and why.endswith("paste the address instead.")
    assert any(fake.auth_url in line for line in out)
    assert fake.requests("POST", "/sessions")[0].body == {"code": "PASTED"}


# the fetch renews --------------------------------------------------------------


def renewing(
    paths: Paths,
    settings: Settings,
    fake: FakeBank,
    chrome: FakeChrome,
    notifier: FakeNotifier,
    log: list[str],
    make_state: Callable[[], str],
) -> Callable[[Bank, Session], bool]:
    clock = FakeClock()

    def renew(bank: Bank, session: Session) -> bool:
        return renew_bank(
            paths,
            settings,
            bank,
            session,
            browser=chrome,
            notifier=notifier,
            client_factory=client_factory(fake),
            write=log.append,
            now=lambda: NOW,
            make_state=make_state,
            sleep=clock.sleep,
            monotonic=clock.monotonic,
        )

    return renew


def fetch(
    paths: Paths,
    settings: Settings,
    fake: FakeBank,
    renew: Callable[[Bank, Session], bool],
) -> FetchResult:
    return run_fetch(
        paths,
        settings,
        client_factory=client_factory(fake),
        now=lambda: NOW,
        today=lambda: TODAY,
        renew=renew,
    )


def tr_bank() -> FakeBank:
    return FakeBank(
        accounts=[account("uid-2b", "hash-2")],
        session_id="tr-2",
        valid_until="2027-01-16T07:30:00+00:00",
        pages={
            "uid-1": [([tx("2026-10-18", "40.00", ref="f1")], None)],
            "uid-2": [([tx("2026-10-19", "9.99", ref="t1")], None)],
            "uid-2b": [([tx("2026-10-20", "5.00", ref="t2")], None)],
        },
    )


def test_the_fetch_renews_a_consent_that_ends_today_and_fetches_it_again(
    paths: Paths,
) -> None:
    settings = two_banks(paths)
    connected(paths, FINECO_ACCOUNT, valid_until=ENDS_LATER)
    connected(
        paths,
        TR_ACCOUNT,
        bank=TRADE_REPUBLIC,
        valid_until=ENDS_TODAY,
        session_id="tr-1",
    )
    fake = tr_bank()
    chrome = FakeChrome(reads=[[], [OTHER_TAB, callback("S")]])
    notifier = FakeNotifier()
    log: list[str] = []
    result = fetch(
        paths,
        settings,
        fake,
        renewing(paths, settings, fake, chrome, notifier, log, lambda: "S"),
    )
    assert (result.outcome, result.exit_code) == ("ok", 0)
    assert "Trade Republic: Fetched 1 new" in result.message
    assert notifier.messages == [
        "Trade Republic: bank access ends today. Log in in the Chrome tab that "
        "just opened.",
        "Trade Republic: bank access renewed until 16 Jan 2027.",
    ]
    assert chrome.closed == [callback("S")]
    assert [c.path for c in fake.requests("DELETE", "")] == ["/sessions/tr-1"]
    renewed = load_session(paths.session(TRADE_REPUBLIC))
    assert renewed is not None and renewed.session_id == "tr-2"
    assert [c.path for c in fake.requests("GET", "/transactions")] == [
        "/accounts/uid-1/transactions",
        "/accounts/uid-2/transactions",
        "/accounts/uid-2b/transactions",
    ]
    fineco = load_session(paths.session(DEFAULT_BANK))
    assert fineco is not None and fineco.session_id == "session-1"
    assert [c.body["aspsp"]["name"] for c in fake.requests("POST", "/auth")] == [
        "Trade Republic"
    ]


def test_the_fetch_renews_nothing_before_the_day(paths: Paths) -> None:
    connected(paths, valid_until=ENDS_LATER)
    settings = load_settings(paths)
    asked: list[Bank] = []

    def renew(bank: Bank, session: Session) -> bool:
        asked.append(bank)
        return True

    result = fetch(paths, settings, tr_bank(), renew)
    assert result.outcome == "ok" and asked == []


def test_a_failed_renewal_never_stops_the_other_bank(paths: Paths) -> None:
    settings = two_banks(paths)
    connected(paths, FINECO_ACCOUNT, valid_until=ENDS_TODAY)
    connected(
        paths,
        TR_ACCOUNT,
        bank=TRADE_REPUBLIC,
        valid_until=ENDS_TODAY,
        needs_reconsent="EXPIRED_SESSION on 2026-10-19 19:30",
        session_id="tr-1",
    )
    fake = tr_bank()
    # Only the second attempt's callback ever shows: FinecoBank's wait times out.
    chrome = FakeChrome(reads=[[callback("TR")]])
    notifier = FakeNotifier()
    log: list[str] = []
    result = fetch(
        paths,
        settings,
        fake,
        renewing(paths, settings, fake, chrome, notifier, log, states("FINECO", "TR")),
    )
    assert notifier.messages == [
        "FinecoBank: bank access ends today. Log in in the Chrome tab that just opened.",
        "FinecoBank: bank access not renewed (no bank login within 15 minutes). "
        "The next scheduled fetch tries again.",
        "Trade Republic: bank access ended. Log in in the Chrome tab that just opened.",
        "Trade Republic: bank access renewed until 16 Jan 2027.",
    ]
    assert (result.outcome, result.exit_code) == ("ok", 0)
    assert "FinecoBank: Fetched 1 new" in result.message
    assert "Trade Republic: Fetched 1 new" in result.message
    fineco = load_session(paths.session(DEFAULT_BANK))
    assert fineco is not None and fineco.session_id == "session-1"


def test_a_renewal_error_at_the_bank_is_notified_and_the_run_goes_on(
    paths: Paths,
) -> None:
    settings = two_banks(paths)
    connected(paths, FINECO_ACCOUNT, valid_until=ENDS_TODAY)
    connected(paths, TR_ACCOUNT, bank=TRADE_REPUBLIC, valid_until=ENDS_TODAY)
    fake = tr_bank()
    fake.failures.append(("POST", "/auth", 500, "INTERNAL"))
    chrome = FakeChrome(reads=[[callback("TR")]])
    notifier = FakeNotifier()
    result = fetch(
        paths,
        settings,
        fake,
        renewing(paths, settings, fake, chrome, notifier, [], states("FINECO", "TR")),
    )
    assert notifier.messages[0].startswith("FinecoBank: bank access not renewed (")
    assert (
        notifier.messages[-1]
        == "Trade Republic: bank access renewed until 16 Jan 2027."
    )
    assert chrome.opened == [fake.auth_url]
    assert result.outcome == "ok"


def test_the_renewal_holds_the_fetch_lock(paths: Paths) -> None:
    connected(paths, valid_until=ENDS_TODAY)
    settings = load_settings(paths)
    held: list[bool] = []

    def renew(bank: Bank, session: Session) -> bool:
        with pytest.raises(Busy):
            with exclusive(paths.lock):
                pass
        held.append(True)
        return False

    fetch(paths, settings, tr_bank(), renew)
    assert held == [True]
    out: list[str] = []
    with exclusive(paths.lock):
        code = run_connect(
            paths,
            settings,
            None,
            browser=FakeChrome(),
            client_factory=client_factory(tr_bank()),
            write=out.append,
        )
    assert code == 1 and "waiting up to 15 minutes for a bank login" in out[-1]


def test_the_renewed_session_keeps_the_accounts_matched(paths: Paths) -> None:
    connected(
        paths,
        SessionAccount("uid-1", "hash-1", "IT00X0000000000000000000001", "M", "EUR"),
        valid_until=ENDS_TODAY,
    )
    settings = load_settings(paths)
    fake = FakeBank(accounts=[account("uid-9", "hash-1")], session_id="session-2")
    log: list[str] = []
    renew = renewing(
        paths,
        settings,
        fake,
        FakeChrome(reads=[[callback("S")]]),
        FakeNotifier(),
        log,
        lambda: "S",
    )
    result = fetch(paths, settings, fake, renew)
    assert result.outcome == "ok"
    assert any("same account as before" in line for line in log)
    renewed = load_session(paths.session(DEFAULT_BANK))
    assert renewed is not None and [a.uid for a in renewed.accounts] == ["uid-9"]
