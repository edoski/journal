"""python -m finance: setup, status, rules and the JSON interface for biz."""

from __future__ import annotations

import datetime
import json
import os
import stat
from pathlib import Path

import pytest

from finance import cli
from finance.config import DEFAULT_BANK, Paths, Settings, load_settings
from finance.fetch import run_fetch
from finance.session import load_session, save_session

from tests.finance.conftest import NOW, TODAY, connected
from tests.finance.fake_bank import FakeBank, client_factory, tx


def run(
    capsys: pytest.CaptureFixture[str], paths: Paths, *argv: str
) -> tuple[int, str, str]:
    code = cli.main(list(argv), root=paths.root)
    captured = capsys.readouterr()
    return code, captured.out, captured.err


def populate(paths: Paths, settings: Settings) -> FakeBank:
    connected(paths)
    bank = FakeBank(
        pages={
            "uid-1": [
                (
                    [
                        tx(
                            "2026-10-15",
                            "2500.00",
                            "CRDT",
                            ref="pay",
                            debtor="CLIENT LTD",
                            remittance=["INVOICE 1/2026"],
                        ),
                        tx("2026-10-16", "48.62", ref="g1", creditor="ESSELUNGA SPA"),
                        tx(
                            "2026-10-17",
                            "27.80",
                            ref="o1",
                            remittance=["PAGAMENTO CARTA 17/10"],
                        ),
                        tx(
                            "2026-10-18",
                            "27.80",
                            ref="o2",
                            remittance=["PAGAMENTO CARTA 17/10"],
                        ),
                        tx(
                            "2026-10-18",
                            "5000.00",
                            "CRDT",
                            ref="t1",
                            debtor="ROSSI MARIO",
                        ),
                        tx("2026-10-19", "12.00", "CRDT", ref="o3", debtor="FRIEND"),
                    ],
                    None,
                )
            ]
        },
        balances={
            "uid-1": [
                {
                    "name": "Contabile",
                    "balance_amount": {"currency": "EUR", "amount": "5400.00"},
                    "balance_type": "CLBD",
                },
                {
                    "name": "Disponibile",
                    "balance_amount": {"currency": "EUR", "amount": "5380.18"},
                    "balance_type": "ITAV",
                    "reference_date": "2026-10-20",
                },
            ]
        },
    )
    result = run_fetch(
        paths,
        settings,
        client_factory=client_factory(bank),
        now=lambda: NOW,
        today=lambda: TODAY,
    )
    assert result.outcome == "ok"
    return bank


def test_setup_writes_private_settings_without_reading_the_key(
    capsys: pytest.CaptureFixture[str], paths: Paths, tmp_path: Path
) -> None:
    key = tmp_path / "app.pem"
    key.write_text("placeholder, never read")
    os.chmod(key, 0o644)
    code, out, _ = run(
        capsys, paths, "setup", "--application-id", "app-1", "--key", str(key)
    )
    assert code == 0
    assert stat.S_IMODE(os.stat(paths.settings).st_mode) == 0o600
    assert stat.S_IMODE(os.stat(paths.root).st_mode) == 0o700
    assert load_settings(paths) == Settings("app-1", key)
    assert "readable by others" in out
    assert paths.rules.exists()
    code, _, err = run(
        capsys,
        paths,
        "setup",
        "--application-id",
        "a",
        "--key",
        str(tmp_path / "none.pem"),
    )
    assert code == 1 and "no key file" in err


def test_fetch_and_connect_need_settings(
    capsys: pytest.CaptureFixture[str], paths: Paths
) -> None:
    code, _, err = run(capsys, paths, "fetch")
    assert code == 1 and "finance setup" in err


def test_credits_and_balance_before_setup(
    capsys: pytest.CaptureFixture[str], paths: Paths
) -> None:
    for argv in (("credits", "--since", "2026-10-01", "--json"), ("balance", "--json")):
        code, out, _ = run(capsys, paths, *argv)
        assert code == 0 and json.loads(out) == {"status": "not_set_up"}


def test_credits_json(
    capsys: pytest.CaptureFixture[str],
    paths: Paths,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    populate(paths, settings)
    monkeypatch.setattr(cli, "_now", lambda: NOW + datetime.timedelta(hours=1))
    code, out, _ = run(capsys, paths, "credits", "--since", "2026-10-16", "--json")
    assert code == 0
    payload = json.loads(out)
    assert payload["status"] == "ok" and payload["problem"] is None
    assert payload["last_fetch"] is not None
    assert [
        (c["date"], c["amount"], c["counterparty"], c["category"])
        for c in payload["credits"]
    ] == [
        ("2026-10-18", "5000.00", "ROSSI MARIO", "Transfer"),
        ("2026-10-19", "12.00", "FRIEND", "Other"),
    ]
    assert payload["credits"][0]["transaction"]["entry_reference"] == "t1"
    code, out, _ = run(capsys, paths, "credits", "--since", "2026-10-01", "--json")
    first = json.loads(out)["credits"][0]
    assert (first["key"], first["remittance"], first["iban"]) == (
        "ref:pay:2026-10-15:CRDT:250000:0",
        "INVOICE 1/2026",
        "IT00X0000000000000000000000",
    )


def test_balance_json_prefers_the_available_balance(
    capsys: pytest.CaptureFixture[str], paths: Paths, settings: Settings
) -> None:
    populate(paths, settings)
    code, out, _ = run(capsys, paths, "balance", "--json")
    payload = json.loads(out)
    assert code == 0
    [balance] = payload["balances"]
    assert (
        balance["amount"],
        balance["type"],
        balance["date"],
        balance["currency"],
    ) == ("5380.18", "ITAV", "2026-10-20", "EUR")


def test_json_reports_problems_in_one_line(
    capsys: pytest.CaptureFixture[str],
    paths: Paths,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    populate(paths, settings)
    later = NOW + datetime.timedelta(days=3)
    monkeypatch.setattr(cli, "_now", lambda: later)
    _, out, _ = run(capsys, paths, "balance", "--json")
    assert json.loads(out)["problem"].startswith("no successful bank fetch since")
    session = load_session(paths.session(DEFAULT_BANK))
    assert session is not None
    save_session(
        paths.session(DEFAULT_BANK),
        session.flag_reconsent("EXPIRED_SESSION on 20 Oct", NOW),
    )
    _, out, _ = run(capsys, paths, "credits", "--since", "2026-10-01", "--json")
    assert "consent needs renewing" in json.loads(out)["problem"]


def test_json_errors_exit_1(capsys: pytest.CaptureFixture[str], paths: Paths) -> None:
    paths.root.mkdir(parents=True)
    paths.store.write_text("this is not sqlite")
    code, out, _ = run(capsys, paths, "credits", "--since", "2026-10-01", "--json")
    assert code == 1
    payload = json.loads(out)
    assert payload["status"] == "error" and "not a finance store" in payload["message"]


def test_status(
    capsys: pytest.CaptureFixture[str],
    paths: Paths,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cli, "_now", lambda: NOW + datetime.timedelta(hours=1))
    code, out, _ = run(capsys, paths, "status")
    assert code == 0 and "not connected" in out and "none yet" in out
    populate(paths, settings)
    code, out, _ = run(capsys, paths, "status")
    assert code == 0
    assert "valid until 11 Apr 2027" in out
    assert "Balance         €5,380.18 on 2026-10-20 (ITAV)" in out
    assert "Transactions    6 stored, 2026-10-15 to 2026-10-19" in out
    assert "This month      6 transactions, 4 in Other" in out
    assert "Last fetch      20 Oct 2026" in out
    assert "Attention" not in out
    assert "Rules           " in out


def test_status_shows_rule_errors(
    capsys: pytest.CaptureFixture[str], paths: Paths
) -> None:
    paths.root.mkdir(parents=True)
    paths.rules.write_text('[[rule]]\ncategory = "X"\nmatch = []\n')
    _, out, _ = run(capsys, paths, "status")
    assert "Rules           ERROR" in out and "rule 1" in out
    code, _, err = run(capsys, paths, "rules", "check")
    assert code == 1 and "rule 1" in err


def test_rules_unmatched_counts_texts_in_other(
    capsys: pytest.CaptureFixture[str], paths: Paths, settings: Settings
) -> None:
    populate(paths, settings)
    code, out, _ = run(capsys, paths, "rules", "unmatched", "--month", "2026-10")
    assert code == 0
    lines = out.splitlines()
    # The client is not in the starter Income rule yet, so its payment is in Other too.
    assert lines[0] == "Other in 2026-10: 4 of 6 transactions, €55.60 out, €2,512.00 in"
    assert lines[2].split() == [
        "2",
        "€55.60",
        "OUT",
        "(none)",
        "|",
        "PAGAMENTO",
        "CARTA",
        "17/10",
    ]
    assert lines[3].split()[:4] == ["1", "€2,500.00", "IN", "CLIENT"]
    assert lines[4].split()[:4] == ["1", "€12.00", "IN", "FRIEND"]
    code, _, err = run(capsys, paths, "rules", "unmatched", "--month", "October")
    assert code == 1 and "YYYY-MM" in err
