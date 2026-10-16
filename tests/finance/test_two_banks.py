"""Two banks: finance.toml lists both, each has its own consent, one fetch reads both."""

from __future__ import annotations

import datetime

import pytest

from finance import cli
from finance.config import (
    DEFAULT_BANK,
    Bank,
    Paths,
    Settings,
    SettingsError,
    load_settings,
    settings_text,
)
from finance.connect import run_connect
from finance.fetch import last_ok_key, run_fetch
from finance.session import SessionAccount, load_session
from finance.store import open_reader

from tests.finance.conftest import NOW, TODAY, connected
from tests.finance.fake_bank import FakeBank, account, client_factory, tx

TRADE_REPUBLIC = Bank("Trade Republic", "IT")
REDIRECT = "https://localhost/enablebanking/callback"
FINECO_ACCOUNT = SessionAccount(
    "uid-1", "hash-1", "IT00X0000000000000000000001", "ROSSI MARIO", "EUR"
)
TR_ACCOUNT = SessionAccount(
    "uid-2", "hash-2", "IT00X0000000000000000000002", "ROSSI MARIO", "EUR"
)


def two_banks(paths: Paths) -> Settings:
    paths.root.mkdir(parents=True, exist_ok=True)
    paths.settings.write_text(
        settings_text("test-app-id", "/no-key.pem")
        + '\n[[bank]]\nname = "FinecoBank"\ncountry = "IT"\n'
        + '\n[[bank]]\nname = "Trade Republic"\ncountry = "it"\n'
    )
    return load_settings(paths)


def fetch(paths: Paths, settings: Settings, bank: FakeBank, hours: int = 0):
    return run_fetch(
        paths,
        settings,
        client_factory=client_factory(bank),
        now=lambda: NOW + datetime.timedelta(hours=hours),
        today=lambda: TODAY,
    )


def both_pages() -> FakeBank:
    return FakeBank(
        pages={
            "uid-1": [
                ([tx("2026-10-18", "40.00", ref="f1", creditor="ESSELUNGA")], None)
            ],
            "uid-2": [([tx("2026-10-19", "9.99", ref="t1", creditor="SPOTIFY")], None)],
        }
    )


def test_finance_toml_lists_banks_and_defaults_to_fineco(paths: Paths) -> None:
    settings = two_banks(paths)
    assert settings.banks == (DEFAULT_BANK, TRADE_REPUBLIC)
    assert TRADE_REPUBLIC.key == "trade-republic-it"
    assert paths.session(TRADE_REPUBLIC).name == "session-trade-republic-it.json"
    assert settings.bank("trade republic") == TRADE_REPUBLIC
    with pytest.raises(SettingsError, match="say which bank"):
        settings.bank(None)
    with pytest.raises(SettingsError, match=r"\[\[bank\]\]"):
        settings.bank("Revolut")
    paths.settings.write_text(settings_text("test-app-id", "/no-key.pem"))
    assert load_settings(paths).banks == (DEFAULT_BANK,)
    assert load_settings(paths).bank(None) == DEFAULT_BANK


@pytest.mark.parametrize(
    "tables",
    [
        '[[bank]]\nname = "FinecoBank"\n',
        '[[bank]]\nname = "FinecoBank"\ncountry = "IT"\nbic = "X"\n',
        '[[bank]]\nname = ""\ncountry = "IT"\n',
        '[[bank]]\nname = "FinecoBank"\ncountry = "IT"\n'
        '[[bank]]\nname = "finecobank"\ncountry = "it"\n',
        'bank = "FinecoBank"\n',
    ],
)
def test_finance_toml_rejects_broken_bank_tables(paths: Paths, tables: str) -> None:
    paths.root.mkdir(parents=True)
    if tables.startswith("bank ="):
        paths.settings.write_text(tables + settings_text("a", "/k.pem"))
    else:
        paths.settings.write_text(settings_text("a", "/k.pem") + tables)
    with pytest.raises(SettingsError):
        load_settings(paths)


def test_connect_asks_for_the_banks_own_consent_length(paths: Paths) -> None:
    settings = two_banks(paths)
    bank = FakeBank(accounts=[account("uid-2", "hash-2")])
    out: list[str] = []
    code = run_connect(
        paths,
        settings,
        TRADE_REPUBLIC,
        client_factory=client_factory(bank),
        read_line=lambda prompt: f"{REDIRECT}?state=S&code=C",
        write=out.append,
        now=lambda: NOW,
        make_state=lambda: "S",
    )
    assert code == 0, out
    [auth] = bank.requests("POST", "/auth")
    assert auth.body["aspsp"] == {"name": "Trade Republic", "country": "IT"}
    asked = datetime.datetime.fromisoformat(auth.body["access"]["valid_until"]) - NOW
    assert asked == datetime.timedelta(days=88)  # 90 days less the margin
    assert bank.requests("GET", "/aspsps")[0].query == {"country": "IT"}
    assert load_session(paths.session(TRADE_REPUBLIC)) is not None
    assert load_session(paths.session(DEFAULT_BANK)) is None
    assert "log in to Trade Republic" in out[0]


def test_connect_refuses_a_bank_enable_banking_does_not_list(paths: Paths) -> None:
    settings = two_banks(paths)
    out: list[str] = []
    code = run_connect(
        paths,
        settings,
        TRADE_REPUBLIC,
        client_factory=client_factory(FakeBank(aspsps=[])),
        read_line=lambda prompt: "",
        write=out.append,
        now=lambda: NOW,
    )
    assert code == 1 and "does not list 'Trade Republic'" in out[-1]
    assert not paths.session(TRADE_REPUBLIC).exists()


def test_one_fetch_reads_both_banks(paths: Paths) -> None:
    settings = two_banks(paths)
    connected(paths, FINECO_ACCOUNT)
    connected(paths, TR_ACCOUNT, bank=TRADE_REPUBLIC)
    result = fetch(paths, settings, both_pages())
    assert (result.outcome, result.exit_code, result.added) == ("ok", 0, 2)
    assert "FinecoBank: Fetched 1 new" in result.message
    assert "Trade Republic: Fetched 1 new" in result.message
    store = open_reader(paths.store)
    assert store is not None
    try:
        assert {row.account for row in store.transactions()} == {"hash-1", "hash-2"}
        details = [run.detail for run in store.runs()]
        assert any(d.startswith("FinecoBank: ") for d in details)
        assert any(d.startswith("Trade Republic: ") for d in details)
        assert store.meta(last_ok_key(DEFAULT_BANK)) is not None
        assert store.meta(last_ok_key(TRADE_REPUBLIC)) is not None
    finally:
        store.close()


def test_a_bank_not_yet_connected_does_not_stop_the_other(paths: Paths) -> None:
    settings = two_banks(paths)
    connected(paths, FINECO_ACCOUNT)
    result = fetch(paths, settings, both_pages())
    assert (result.outcome, result.exit_code, result.added) == ("not_connected", 3, 1)
    assert "connect --bank 'Trade Republic'" in result.message
    store = open_reader(paths.store)
    assert store is not None
    try:
        assert store.meta(last_ok_key(TRADE_REPUBLIC)) is None
        assert [row.account for row in store.transactions()] == ["hash-1"]
    finally:
        store.close()


def test_an_ended_session_at_one_bank_does_not_stop_the_other(paths: Paths) -> None:
    settings = two_banks(paths)
    connected(paths, FINECO_ACCOUNT)
    connected(paths, TR_ACCOUNT, bank=TRADE_REPUBLIC)
    bank = both_pages()
    bank.failures.append(("GET", "/accounts/uid-2/", 401, "EXPIRED_SESSION"))
    result = fetch(paths, settings, bank)
    assert (result.outcome, result.exit_code, result.added) == ("needs_reconsent", 3, 1)
    assert "The Trade Republic session has ended" in result.message
    tr = load_session(paths.session(TRADE_REPUBLIC))
    assert tr is not None and tr.needs_reconsent is not None
    fineco = load_session(paths.session(DEFAULT_BANK))
    assert fineco is not None and fineco.needs_reconsent is None


def test_problems_name_the_bank(paths: Paths, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = two_banks(paths)
    connected(paths, FINECO_ACCOUNT)
    fetch(paths, settings, both_pages())
    store = open_reader(paths.store)
    assert store is not None
    try:
        assert cli.problems(paths, store, NOW + datetime.timedelta(hours=1)) == [
            "Trade Republic not connected: run Journal --finance connect "
            "--bank 'Trade Republic'",
            "no successful Trade Republic fetch yet",
        ]
        later = cli.problems(paths, store, NOW + datetime.timedelta(days=3))
        assert later[0].startswith("no successful FinecoBank fetch since")
    finally:
        store.close()


def test_status_shows_each_bank(
    paths: Paths, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = two_banks(paths)
    connected(paths, FINECO_ACCOUNT)
    fetch(paths, settings, both_pages())
    monkeypatch.setattr(cli, "_now", lambda: NOW + datetime.timedelta(hours=1))
    assert cli.main(["status"], root=paths.root) == 0
    out = capsys.readouterr().out
    assert "Bank            FinecoBank (IT)" in out
    assert "Bank            Trade Republic (IT)" in out
    assert (
        "Consent         not connected (run Journal --finance connect "
        "--bank 'Trade Republic')" in out
    )
