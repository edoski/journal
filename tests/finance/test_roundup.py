"""Trade Republic's Round up: each run's debit told from the card payments by its exact amount."""

from __future__ import annotations

import datetime
import json

import pytest

from finance.config import Paths, Settings
from finance.roundup import round_up
from finance.rules import UNRESOLVED, Booking, Categorised, RulesError, parse_rules

from tests.finance.fake_bank import tx
from tests.finance.test_cli import run
from tests.finance.test_read import build
from tests.finance.test_textless import CARD, RULES, booking

ROUNDUP = f"""
[[rule]]
category = "Investing"
label = "Round up"
account = "{CARD}"
roundup = 1
runs = [2, 9, 16, 23]
since = 2026-10-23
"""
# The round-up rule goes after the Bitcoin plan and Saveback, before the card rule.
WITH_ROUNDUP = RULES.replace(
    '[[rule]]\ncategory = "Card"\naccount',
    ROUNDUP + '\n[[rule]]\ncategory = "Card"\naccount',
)


def card(day: str, euros: str) -> Booking:
    return booking(CARD, day, "OUT", euros)


# Trade Republic as the feed showed it from 24 Oct to 2 Nov 2026: Round up's
# first run, EUR 3.21 on 2 Nov, is 22.99 (0.01) and 25.80 (0.20) booked 24 and
# 29 Oct, and 7.00, 9.00 and 21.00 (a full euro each) paid 1 Nov, booked 2 Nov.
FIRST_RUN = [
    card("2026-10-24", "22.99"),
    card("2026-10-29", "25.80"),
    booking(CARD, "2026-11-01", "IN", "2.38"),
    booking(CARD, "2026-11-01", "IN", "0.48"),
    card("2026-11-02", "9.00"),
    card("2026-11-02", "7.00"),
    card("2026-11-02", "3.21"),
    card("2026-11-02", "0.43"),
    card("2026-11-02", "49.99"),
    card("2026-11-02", "21.00"),
]


def classify(entries: list[Booking], rules: str = WITH_ROUNDUP) -> Categorised:
    found = parse_rules(rules, "categories.toml")
    assert found.warnings == ()
    return found.classify(entries)


def labels(found: Categorised) -> list[tuple[str, str | None]]:
    return [(m.category, m.label) for m in found.matches]


def test_round_up_amounts() -> None:
    assert round_up(2299, 1) == 1
    assert round_up(2580, 1) == 20
    assert round_up(700, 1) == 100  # a whole euro rounds up by a full euro
    assert round_up(2299, 3) == 3


def test_the_first_run_of_2_november_2026() -> None:
    found = classify(FIRST_RUN)
    assert labels(found) == [
        ("Card", None),
        ("Card", None),
        ("Interest", None),
        ("Card", "Saveback"),
        ("Card", None),
        ("Card", None),
        ("Investing", "Round up"),
        ("Investing", "Saveback: Bitcoin"),
        ("Investing", "Bitcoin savings plan"),
        ("Card", None),
    ]
    (only,) = found.runs
    assert (only.day, only.status, only.debit) == (
        datetime.date(2026, 11, 2),
        "matched",
        6,
    )
    assert sorted(only.covers) == [0, 1, 4, 5, 9]
    assert only.expected[-1] == 321


def test_a_payment_booked_after_the_run_belongs_to_the_next() -> None:
    entries = FIRST_RUN + [
        card("2026-11-04", "10.50"),  # 0.50, paid 1-4 Nov: optional for the 2nd
        card("2026-11-06", "4.10"),  # 0.90, certainly the 9th's
        card("2026-11-09", "1.40"),  # the 9th's round-up: 0.50 + 0.90
        card("2026-11-10", "8.75"),  # 0.25, paid 7-10 Nov: the 9th's or the 16th's
        card("2026-11-16", "1.15"),  # the 16th's: 0.25 + 0.90 below
        card("2026-11-13", "3.10"),
    ]
    found = classify(entries)
    assert [r.status for r in found.runs] == ["matched", "matched", "matched"]
    assert [found.matches[i].label for i in (10, 11, 12, 13, 14, 15)] == [
        None,
        None,
        "Round up",
        None,
        "Round up",
        None,
    ]
    ninth, sixteenth = found.runs[1:]
    assert sorted(ninth.covers) == [10, 11]
    assert sorted(sixteenth.covers) == [13, 15]


def test_a_debit_no_sum_matches_stays_uncategorised() -> None:
    entries = FIRST_RUN + [
        card("2026-11-05", "4.10"),  # 0.90
        card(
            "2026-11-09", "0.95"
        ),  # not 0.90: a refund or a foreign payment rounded otherwise
    ]
    found = classify(entries)
    assert found.matches[-1].category == "Other"
    assert found.matches[-1].label == UNRESOLVED
    ninth = found.runs[1]
    assert (ninth.status, ninth.candidates) == ("unmatched", (11,))
    assert ninth.expected == (90,)


def test_two_debits_that_could_each_be_the_run_are_both_left() -> None:
    entries = FIRST_RUN + [
        card("2026-11-02", "3.21")
    ]  # a card payment of the same amount
    found = classify(entries)
    assert [found.matches[i].label for i in (6, 10)] == [UNRESOLVED, UNRESOLVED]
    (only,) = found.runs
    assert (only.status, only.candidates) == ("ambiguous", (6, 10))


def test_two_choices_that_pass_on_the_same_round_ups_still_match() -> None:
    found = classify(
        [
            card("2026-10-28", "12.50"),  # 0.50, certain
            card("2026-10-24", "9.70"),  # 0.30, low: before Round up was on, or after
            card("2026-10-24", "4.90"),  # 0.10, low
            card("2026-10-25", "7.80"),  # 0.20, low
            card("2026-11-02", "0.80"),  # 0.50 and 0.30, or 0.50, 0.10 and 0.20
        ]
    )
    assert found.runs[0].status == "matched"


def test_two_windows_with_the_same_sum_are_ambiguous() -> None:
    found = classify(
        [
            card("2026-10-28", "9.50"),  # 0.50, certainly the first run's
            card(
                "2026-10-24", "4.70"
            ),  # 0.30, paid 21-24 Oct: before Round up was on, or after
            card(
                "2026-11-02", "6.70"
            ),  # 0.30, paid 30 Oct to 2 Nov: the 2nd's or the 9th's
            card(
                "2026-11-02", "0.80"
            ),  # 0.50 and one 0.30, but which decides the 9th's sum
        ]
    )
    (only,) = found.runs
    assert (only.status, only.candidates) == ("ambiguous", (3,))
    assert found.matches[3].label == UNRESOLVED
    assert found.matches[2].label is None


def test_a_run_with_payments_and_no_debit_is_missing() -> None:
    found = classify(
        [
            card("2026-10-28", "12.40"),
            card("2026-11-02", "45.00"),  # too large to be a round-up of one payment
        ]
    )
    (only,) = found.runs
    assert (only.status, only.expected) == ("missing", (60, 160))
    assert labels(found) == [("Card", None), ("Card", None)]


def test_no_payments_no_run() -> None:
    found = classify([card("2026-11-02", "0.60")])
    assert found.runs == ()
    assert labels(found) == [("Card", None)]


def test_payments_before_since_are_not_rounded_up() -> None:
    found = classify([card("2026-10-20", "4.50"), card("2026-11-02", "0.50")])
    assert found.runs == ()
    assert labels(found) == [("Card", None), ("Card", None)]


def test_the_multiplier() -> None:
    rules = WITH_ROUNDUP.replace("roundup = 1", "roundup = 3")
    found = classify(
        FIRST_RUN[:-5] + [card("2026-11-02", "0.63"), card("2026-11-03", "2.00")], rules
    )
    assert found.runs[0].status == "matched"
    assert found.matches[5].label == "Round up"


@pytest.mark.parametrize(
    ("old", "new", "message"),
    [
        ("roundup = 1", "roundup = 4", "one of 1, 2, 3, 5, 10"),
        ("runs = [2, 9, 16, 23]", "runs = [2, 30]", "from 1 to 28"),
        ("runs = [2, 9, 16, 23]", "runs = []", "from 1 to 28"),
        ("since = 2026-10-23", 'since = "2026-10-23"', "must be a date"),
        ("since = 2026-10-23\n", "", "go together"),
        ('label = "Round up"', 'label = "Round up"\nflow = "in"', 'flow = "out"'),
        ('label = "Round up"', 'label = "Round up"\namount = 3', "takes no amount"),
    ],
)
def test_invalid_roundup_rules(old: str, new: str, message: str) -> None:
    with pytest.raises(RulesError) as error:
        parse_rules(ROUNDUP.replace(old, new), "categories.toml")
    assert message in str(error.value)


def test_round_up_periods_must_not_overlap() -> None:
    with pytest.raises(RulesError) as error:
        parse_rules(ROUNDUP + ROUNDUP, "categories.toml")
    assert "at the same time" in str(error.value)
    ended = ROUNDUP.replace(
        "since = 2026-10-23", "since = 2026-10-23\nuntil = 2026-11-16"
    )
    tripled = ROUNDUP.replace("roundup = 1", "roundup = 3").replace(
        "2026-10-23", "2026-11-16"
    )
    parse_rules(ended + tripled, "categories.toml")


def test_a_new_multiplier_starts_a_new_period() -> None:
    ended = ROUNDUP.replace(
        "since = 2026-10-23", "since = 2026-10-23\nuntil = 2026-11-02"
    )
    tripled = ROUNDUP.replace("roundup = 1", "roundup = 3").replace(
        "2026-10-23", "2026-11-02"
    )
    rules = WITH_ROUNDUP.replace(ROUNDUP, ended + tripled)
    entries = FIRST_RUN + [
        card("2026-11-05", "4.10"),  # 0.90 times 3
        card("2026-11-09", "2.70"),
    ]
    found = classify(entries, rules)
    assert [(r.day, r.status) for r in found.runs] == [
        (datetime.date(2026, 11, 2), "matched"),
        (datetime.date(2026, 11, 9), "matched"),
    ]
    assert found.matches[-1].label == "Round up"


def test_after_until_nothing_is_taken_for_a_round_up() -> None:
    ended = ROUNDUP.replace(
        "since = 2026-10-23", "since = 2026-10-23\nuntil = 2026-11-02"
    )
    entries = FIRST_RUN + [card("2026-11-05", "4.10"), card("2026-11-09", "0.90")]
    found = classify(entries, WITH_ROUNDUP.replace(ROUNDUP, ended))
    assert len(found.runs) == 1
    assert found.matches[-1].label is None  # a card payment that equals a sum


def test_a_holiday_moves_the_run_and_its_cut_off() -> None:
    found = classify(
        [
            card("2027-01-01", "4.40"),  # 0.60
            card("2027-01-03", "8.70"),  # 0.30, booked before the run's debit
            card("2027-01-04", "0.90"),  # Saturday 2 Jan's run, on Monday
        ],
        WITH_ROUNDUP.replace("2026-10-23", "2026-12-23"),
    )
    assert [(r.day, r.status) for r in found.runs] == [
        (datetime.date(2027, 1, 2), "matched")
    ]
    assert found.matches[2].label == "Round up"


def test_many_payments_near_the_cut_off_still_match() -> None:
    # Twenty payments with twenty round-ups either side of the cut-off: 2^20 choices.
    near = [card("2026-11-02", f"{n + 30}.{n:02d}") for n in range(10, 30)]
    entries = [card("2026-10-28", "5.50"), *near, card("2026-11-02", "0.50")]
    found = classify(entries)
    assert found.runs[0].status == "matched"
    assert found.matches[-1].label == "Round up"


def test_a_misplaced_roundup_rule_is_reported() -> None:
    found = parse_rules(
        ROUNDUP
        + f'\n[[rule]]\ncategory = "Investing"\naccount = "{CARD}"\nflow = "out"\namount = 50\n',
        "categories.toml",
    )
    assert any("put it first" in warning for warning in found.warnings)


def test_own_transfers_out_are_not_card_payments() -> None:
    main = "IT00X0000000000000000000002"
    entries = [
        card("2026-10-28", "5.50"),
        booking(CARD, "2026-10-30", "OUT", "300.40"),  # back to the other account
        booking(main, "2026-10-30", "IN", "300.40", "Mario Rossi", "Giroconto"),
        card("2026-11-02", "0.50"),
    ]
    found = parse_rules(WITH_ROUNDUP, "categories.toml").classify(
        entries, [("rossi", "mario")]
    )
    assert found.runs[0].status == "matched"


def test_a_missing_run_leaves_the_next_to_its_own_payments() -> None:
    found = classify(
        FIRST_RUN
        + [
            card("2026-11-05", "4.10"),  # 0.90: the 9th's, which never shows
            card("2026-11-13", "3.40"),  # 0.60, certainly the 16th's
            card("2026-11-16", "0.60"),
        ]
    )
    assert [r.status for r in found.runs] == ["matched", "missing", "matched"]


def test_debits_json_reports_the_runs_whatever_it_asks_since(
    capsys: pytest.CaptureFixture[str], paths: Paths, settings: Settings
) -> None:
    account = "IT00X0000000000000000000000"
    build(
        paths,
        settings,
        [
            tx("2026-10-29", "25.80", ref="a"),
            tx("2026-11-02", "7.00", ref="b"),
            tx("2026-11-02", "1.20", ref="c"),
            tx("2026-11-05", "4.10", ref="d"),
            tx("2026-11-09", "0.95", ref="e"),
        ],
    )
    paths.rules.write_text(WITH_ROUNDUP.replace(CARD, account))
    for since in ("2026-10-01", "2026-11-08"):  # 8 Nov: the day the 2nd's run settles
        _, out, _ = run(capsys, paths, "debits", "--since", since, "--json")
        answer = json.loads(out)
        runs = {r["run"]: r for r in answer["roundups"]}
        assert runs["2026-11-02"]["status"] == "matched"
        assert runs["2026-11-02"]["debit"]["amount"] == "1.20"
        assert runs["2026-11-02"]["iban"] == account
        assert "covers" not in runs["2026-11-02"]
        assert runs["2026-11-02"]["settles"] == "2026-11-08"
        assert runs["2026-11-09"]["status"] == "unmatched"
        assert runs["2026-11-09"]["candidates"] == [
            {
                "key": runs["2026-11-09"]["candidates"][0]["key"],
                "date": "2026-11-09",
                "amount": "0.95",
            }
        ]
        assert runs["2026-11-09"]["expected"] == ["0.90"]
        categories = {d["amount"]: d["category"] for d in answer["debits"]}
        assert categories["0.95"] == "Other"
        assert categories.get("1.20", "Investing") == "Investing"
    _, out, _ = run(capsys, paths, "credits", "--since", "2026-10-01", "--json")
    assert "roundups" not in json.loads(out)


def test_after_an_unmatched_run_the_next_still_matches() -> None:
    entries = FIRST_RUN + [
        card("2026-11-05", "4.10"),  # 0.90: the 9th's
        card(
            "2026-11-09", "0.95"
        ),  # unmatched, so it may be the 9th's debit or a payment
        card("2026-11-12", "3.40"),  # 0.60, near the 9th's unknown cut-off
        card("2026-11-14", "2.30"),  # 0.70, certainly the 16th's
        card("2026-11-16", "1.30"),  # 0.70 and 0.60
    ]
    found = classify(entries)
    assert [r.status for r in found.runs] == ["matched", "unmatched", "matched"]
    assert found.matches[-1].label == "Round up"
    assert sorted(found.runs[2].covers) == [12, 13]
