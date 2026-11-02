"""categories.toml: validation, first match wins, holder transfers, starter file."""

from __future__ import annotations

import os
import stat
import datetime
from collections.abc import Iterable
from pathlib import Path

import pytest

from finance.rules import (
    Booking,
    Match,
    Rules,
    RulesError,
    install_starter,
    load_rules,
    parse_rules,
    starter_text,
    words,
)
from finance.transactions import Flow

DAY = datetime.date(2026, 10, 20)


def rules(text: str) -> Rules:
    return parse_rules(text, "categories.toml")


def one(
    found: Rules,
    *,
    flow: Flow,
    counterparty: str,
    remittance: str,
    holders: Iterable[tuple[str, ...]] = (),
) -> Match:
    """The match of a single entry, with no other entries around it."""
    [match] = found.classify(
        [Booking("acct", "", DAY, flow, 100, "EUR", counterparty, remittance)], holders
    ).matches
    return match


def test_first_match_wins_on_counterparty_or_remittance() -> None:
    found = rules(
        """
[[rule]]
category = "Groceries"
match = ["coop"]

[[rule]]
category = "Transport"
match = ["COOPERATIVA TAXI", "trenitalia"]
"""
    )
    assert (
        one(found, flow="OUT", counterparty="COOP ALLEANZA", remittance="").category
        == "Groceries"
    )
    assert (
        one(
            found, flow="OUT", counterparty="", remittance="PAGAMENTO  POS\nTRENITALIA"
        ).category
        == "Transport"
    )
    # the later, longer pattern is shadowed by the earlier "coop": reported, not an error
    assert any("never matches" in warning for warning in found.warnings)
    assert (
        one(found, flow="IN", counterparty="UNKNOWN", remittance="").category == "Other"
    )


def test_flow_and_label() -> None:
    found = rules(
        """
[[rule]]
category = "Income"
flow = "in"
match = ["CLIENT LTD"]
label = "Client"
"""
    )
    hit = one(found, flow="IN", counterparty="CLIENT LTD", remittance="")
    assert (hit.category, hit.label) == ("Income", "Client")
    assert (
        one(found, flow="OUT", counterparty="CLIENT LTD", remittance="").category
        == "Other"
    )


def test_holder_matches_the_account_holder_in_any_word_order() -> None:
    found = rules(
        """
[[rule]]
category = "Transfer"
holder = true
match = ["GIROCONTO"]
"""
    )
    holders = [words("ROSSI MARIO")]
    for party in ("ROSSI MARIO", "Mario Rossi", "MARIO ROSSI ", "Rossi, Mario"):
        assert (
            one(
                found, flow="IN", counterparty=party, remittance="", holders=holders
            ).category
            == "Transfer"
        )
    assert (
        one(
            found,
            flow="IN",
            counterparty="MARIO BIANCHI",
            remittance="",
            holders=holders,
        ).category
        == "Other"
    )
    # the holder's name in the remittance (e.g. a client paying "to Mario Rossi") is not a transfer
    assert (
        one(
            found,
            flow="IN",
            counterparty="CLIENT",
            remittance="to Mario Rossi",
            holders=holders,
        ).category
        == "Other"
    )
    # a one-word holder name is too weak to trust
    assert (
        one(
            found,
            flow="IN",
            counterparty="ROSSI SRL",
            remittance="",
            holders=[words("ROSSI")],
        ).category
        == "Other"
    )


@pytest.mark.parametrize(
    ("text", "message"),
    [
        (
            '[[rule]]\ncategory = "X"\nmatch = []\n',
            'rule 1 ("X"): match must be a non-empty list',
        ),
        (
            '[[rule]]\ncategory = "X"\nmatch = ["a"]\nflow = "both"\n',
            'rule 1 ("X"): flow must be "in" or "out"',
        ),
        (
            '[[rule]]\ncategory = "X"\nmatch = ["a"]\n\n[[rule]]\ncategory = "Y"\nmatch = ["b"]\ncolour = "red"\n',
            "rule 2: unknown key colour",
        ),
        ('[[rule]]\nmatch = ["a"]\n', "rule 1: category must be a non-empty string"),
        (
            '[[rule]]\ncategory = "income"\nmatch = ["a"]\n',
            'write the category as "Income"',
        ),
        (
            '[[rule]]\ncategory = "Eat `out`"\nmatch = ["a"]\n',
            "backtick, pipe or control character",
        ),
        (
            '[[rule]]\ncategory = "Food"\nmatch = ["a"]\n\n[[rule]]\ncategory = "food"\nmatch = ["b"]\n',
            "different capitals",
        ),
        ('[rules]\ncategory = "X"\n', "unknown top-level key rules"),
        ('[[rule]\ncategory = "X"\n', "does not parse"),
        (
            '[[rule]]\ncategory = "X"\nmatch = ["  "]\n',
            "every match entry must be a non-empty string",
        ),
        (
            '[[rule]]\ncategory = "X"\nmatch = ["a"]\nholder = "yes"\n',
            "holder must be true or false",
        ),
    ],
)
def test_validation_names_the_rule(text: str, message: str) -> None:
    with pytest.raises(RulesError) as error:
        rules(text)
    assert message in str(error.value)
    assert "categories.toml" in str(error.value)


def test_starter_file_is_valid_installed_once_and_private(tmp_path: Path) -> None:
    starter = rules(starter_text())
    assert [r.category for r in starter.rules][:5] == [
        "Transfer",
        "Transfer",
        "Income",
        "Taxes",
        "Investing",
    ]
    assert starter.warnings == ()
    lowered = starter_text().lower()
    for personal in ("galli", "edoardo", "amoreg", "it79", "be26c2ad"):
        assert personal not in lowered
    path = tmp_path / "finance" / "categories.toml"
    assert (
        load_rules(path).rules == starter.rules
    )  # missing file: the starter rules, nothing written
    assert not path.exists()
    assert install_starter(path) is True
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    path.write_text('[[rule]]\ncategory = "Mine"\nmatch = ["x"]\n')
    assert install_starter(path) is False
    assert [r.category for r in load_rules(path).rules] == ["Mine"]


def test_starter_seeds_route_the_expected_texts() -> None:
    starter = rules(starter_text())

    def category(party: str, remittance: str = "", flow: str = "OUT") -> str:
        return one(
            starter, flow=flow, counterparty=party, remittance=remittance
        ).category  # type: ignore[arg-type]

    assert category("AGENZIA DELLE ENTRATE", "F24 SEMPLIFICATO") == "Taxes"
    assert category("", "PAGAMENTO PAGOPA IMPOSTA DI BOLLO") == "Taxes"
    assert category("SCALABLE CAPITAL GMBH") == "Investing"
    assert category("", "GIROCONTO DA CONTO BANCOPOSTA", "IN") == "Transfer"
    # Revolut text marks only money out as a transfer (a client may pay from Revolut)
    assert category("REVOLUT LTD", "Top-up", "OUT") == "Transfer"
    assert category("AMOREG LIMITED", "Sent from Revolut", "IN") == "Other"
    assert category("LUCA BIANCHI", "Sent from Revolut", "IN") == "Other"
    holders = [words("GALLI EDOARDO")]
    assert (
        one(
            starter,
            flow="IN",
            counterparty="EDOARDO GALLI",
            remittance="",
            holders=holders,
        ).category
        == "Transfer"
    )
    with_client = rules(
        starter_text().replace(
            'match = ["STIPENDIO", "EMOLUMENTI"]',
            'match = ["AMOREG", "STIPENDIO", "EMOLUMENTI"]',
        )
    )
    assert (
        one(
            with_client,
            flow="IN",
            counterparty="AMOREG LIMITED",
            remittance="Sent from Revolut",
        ).category
        == "Income"
    )
    assert with_client.warnings == ()
    assert category("COOPERATIVA RADIO TAXI") == "Transport"
    assert category("AMAZON PRIME") == "Subscriptions"
    assert category("AMAZON EU SARL") == "Shopping"
    assert (
        category("ESSELUNGA SPA", "", "IN") == "Groceries"
    )  # a refund reduces Groceries
