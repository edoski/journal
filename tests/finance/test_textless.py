"""Rules for a bank that sends no text: Trade Republic's month as the feed shows it."""

from __future__ import annotations

import datetime

import pytest

from finance.config import Paths, Settings
from finance.read import read_entries
from finance.rules import Booking, RulesError, parse_rules, role_of, words

from tests.finance.test_read import build
from tests.finance.fake_bank import tx

CARD = "IT00X0000000000000000000001"
MAIN = "IT00X0000000000000000000002"
HOLDERS = [words("ROSSI MARIO")]

RULES = f"""
[[rule]]
category = "Transfer"
holder = true
match = ["GIROCONTO"]

[[rule]]
category = "Gifts"
flow = "in"
match = ["BONIFICO FIGLIO", "REGALO"]

[[rule]]
category = "Card"
label = "Saveback"
account = "{CARD}"
flow = "in"
days = 1
amount = [0.01, 15]
pair = 0.25

[[rule]]
category = "Investing"
label = "Saveback: Bitcoin"
account = "{CARD}"
flow = "out"
days = [1, 4]
amount = [0.01, 15]
pair = 0.25

[[rule]]
category = "Interest"
account = "{CARD}"
flow = "in"
days = 1

[[rule]]
category = "Investing"
label = "Bitcoin savings plan"
account = "{CARD}"
flow = "out"
days = [1, 6]
amount = [49.75, 50]

[[rule]]
category = "Card"
account = "{CARD}"
"""


def booking(
    iban: str, day: str, flow: str, euros: str, party: str = "", text: str = ""
) -> Booking:
    cents = round(float(euros) * 100)
    return Booking(iban, datetime.date.fromisoformat(day), flow, cents, party, text)  # type: ignore[arg-type]


def test_a_card_account_month_without_text() -> None:
    found = parse_rules(RULES, "categories.toml")
    assert found.warnings == ()
    month = [
        booking(
            MAIN, "2026-10-20", "OUT", "4300", "Mario Rossi", "Giroconto tra miei conti"
        ),
        booking(CARD, "2026-10-21", "IN", "4300"),
        booking(CARD, "2026-10-24", "OUT", "22.99"),
        booking(CARD, "2026-10-29", "OUT", "25.80"),
        booking(CARD, "2026-11-01", "IN", "2.38"),
        booking(CARD, "2026-11-01", "IN", "0.48"),
        booking(CARD, "2026-11-02", "OUT", "0.43"),
        booking(CARD, "2026-11-02", "OUT", "49.99"),
        booking(CARD, "2026-11-03", "IN", "12.00"),
        booking(MAIN, "2026-11-02", "IN", "1900", "BIANCHI ANNA", "Bonifico figlio"),
    ]
    matches = found.categorise(month, HOLDERS)
    seen = [(m.category, m.label, m.holder) for m in matches]
    assert seen == [
        ("Transfer", None, True),
        ("Transfer", None, True),  # paired with the holder's debit on the other account
        ("Card", None, False),
        ("Card", None, False),
        ("Interest", None, False),
        ("Card", "Saveback", False),  # a refund of card spending
        ("Investing", "Saveback: Bitcoin", False),
        ("Investing", "Bitcoin savings plan", False),
        ("Card", None, False),  # any other money in reduces card spending
        ("Gifts", None, False),
    ]
    assert role_of("Interest") == "income"
    assert role_of("Gifts") == "gift"


def test_a_textless_entry_pairs_with_one_holder_entry_only() -> None:
    found = parse_rules(RULES, "categories.toml")
    entries = [
        booking(MAIN, "2026-11-20", "OUT", "250", "ROSSI MARIO", "Giroconto"),
        booking(CARD, "2026-11-20", "IN", "250"),
        booking(CARD, "2026-11-24", "IN", "250"),  # beyond PAIR_DAYS of the debit
        booking(CARD, "2026-11-21", "IN", "250"),  # the debit is taken already
    ]
    assert [m.holder for m in found.categorise(entries, HOLDERS)] == [
        True,
        True,
        False,
        False,
    ]


def test_saveback_needs_its_buy() -> None:
    found = parse_rules(RULES, "categories.toml")
    alone = [
        booking(CARD, "2026-12-01", "IN", "0.48"),
        booking(CARD, "2026-12-02", "OUT", "0.60"),
    ]
    assert [m.category for m in found.categorise(alone)] == ["Interest", "Card"]


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ('[[rule]]\ncategory = "Gifts"\nmatch = ["a"]\n', 'add flow = "in"'),
        (
            '[[rule]]\ncategory = "X"\nflow = "out"\n',
            "give match, holder = true or an account",
        ),
        (
            '[[rule]]\ncategory = "X"\naccount = "not an iban"\n',
            "account must be an IBAN",
        ),
        (
            f'[[rule]]\ncategory = "X"\naccount = "{CARD}"\namount = [50, 49]\n',
            "starts above",
        ),
        (
            f'[[rule]]\ncategory = "X"\naccount = "{CARD}"\namount = [1, 2, 3]\n',
            "one value or two",
        ),
        (
            f'[[rule]]\ncategory = "X"\naccount = "{CARD}"\namount = "50"\n',
            "amount in euros",
        ),
        (f'[[rule]]\ncategory = "X"\naccount = "{CARD}"\ndays = 0\n', "from 1 to 31"),
        (
            f'[[rule]]\ncategory = "X"\naccount = "{CARD}"\npair = -1\n',
            "must not be negative",
        ),
        (
            '[[rule]]\ncategory = "interest"\nmatch = ["a"]\n',
            'write the category as "Interest"',
        ),
    ],
)
def test_validation(text: str, message: str) -> None:
    with pytest.raises(RulesError) as error:
        parse_rules(text, "categories.toml")
    assert message in str(error.value)


def test_a_rule_after_an_account_catch_all_is_reported() -> None:
    found = parse_rules(
        f'[[rule]]\ncategory = "Card"\naccount = "{CARD}"\n\n'
        f'[[rule]]\ncategory = "Interest"\naccount = "{CARD}"\nflow = "in"\ndays = 1\n',
        "categories.toml",
    )
    assert any("never matches" in warning for warning in found.warnings)


def test_reading_one_day_still_sees_the_pair_next_day(
    paths: Paths, settings: Settings
) -> None:
    build(
        paths,
        settings,
        [
            tx("2026-10-01", "0.48", "CRDT", ref="a"),
            tx("2026-10-02", "0.43", ref="b"),
        ],
    )
    paths.rules.write_text(RULES.replace(CARD, "IT00X0000000000000000000000"))
    day = datetime.date(2026, 10, 1)
    found = read_entries(day, day, root=paths.root)
    assert found is not None
    assert [(e.category, e.description) for e in found.entries] == [
        ("Card", "Saveback")
    ]
