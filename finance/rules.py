"""Category rules: `categories.toml`, first match wins, applied when reading.

Each `[[rule]]` has a `category` and, optionally, a `match` list of patterns,
`flow` ("in" or "out"), `label` (shown instead of the bank text) and `holder`
(true: also match money between the account holder's own accounts). A pattern
matches when it is a case-insensitive substring of the counterparty name or of
the remittance text, whitespace collapsed. Rules are tried top to bottom; for
each rule the counterparty is tried before the remittance text. Nothing
matched is "Other".

The holder is the name the bank gives an account, in any word order. An entry
the bank sends without any text (Trade Republic sends none) is the holder's
when another account has the opposite entry, of the same amount and currency
and with the holder as counterparty, booked within PAIR_DAYS. Entries pair one
to one over the whole store, nearest in time first, and two entries that both
name the holder pair before an entry without text, so an own transfer between
two accounts with text is never taken for a third one's.

Conditions for banks that send no text, each also usable alone:

- `account`: the IBAN the entry is booked on.
- `amount`: euros, exactly or as `[lowest, highest]`.
- `days`: the day of the month it is booked on, exactly or as `[first, last]`.
- `pair`: euros. The same account also has an entry the other way that spends
  this money: in first, then out within PAIR_DAYS, the out at most `pair` below
  the in and never above it. Trade Republic's Saveback is credited on the 1st
  and buys Bitcoin the next day in whole units, so a few cents stay as cash.
  Entries pair one to one over the whole store, closest amounts first.

A rule matches when every condition it has holds and, when it has patterns or
`holder`, one of them hits. A rule needs at least one of `match`, `holder` and
`account`.

Trade Republic's Round up (`finance/roundup.py`): a rule with `account`,
`roundup` (the multiplier: 1, 2, 3, 5 or 10), `runs` (the days of the month it
invests, such as [2, 9, 16, 23]) and `since` (the day it was switched on, a
date) takes each run's debit, found by its exact amount among the debits that
reach it. Every other debit there is a card payment, rounded up. A debit that
could be a run's but cannot be told apart stays Other, with UNRESOLVED as its
label; the runs are reported with the categories (`Categorised.runs`). Place it
after the rules for that account's other investing debits and before its card
rule. At most one rule has `roundup`.

Five categories have a role: Income and Interest (the waterfall's INCOME),
Investing (INVESTED), Transfer (between own accounts) and Gifts (money given to
you, such as a family present; money in only), both left out of every total,
and Other (the unmatched rest). Every other category is spending. Refunds are
IN entries under a matched spending category and reduce it; an unmatched IN
entry is shown as Other and counted as INCOME by the period notes.

Categories are applied when the notes are synced, so a rules edit reaches a
past note only when that note is synced again.
"""

from __future__ import annotations

import datetime
import re
import tomllib
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from importlib import resources
from pathlib import Path
from typing import Any, Literal

from finance import roundup
from finance.files import write_private
from finance.transactions import Flow, MalformedTransaction, to_cents

Role = Literal["income", "spending", "investing", "transfer", "gift"]
INCOME = "Income"
INTEREST = "Interest"
INVESTING = "Investing"
TRANSFER = "Transfer"
GIFTS = "Gifts"
OTHER = "Other"
ROLES: dict[str, Role] = {
    INCOME: "income",
    INTEREST: "income",
    INVESTING: "investing",
    TRANSFER: "transfer",
    GIFTS: "gift",
}
RESERVED = (INCOME, INTEREST, INVESTING, TRANSFER, GIFTS, OTHER)
PAIR_DAYS = 3
UNRESOLVED = "Card payment or round up?"
_RULE_KEYS = {
    "category",
    "match",
    "flow",
    "label",
    "holder",
    "account",
    "amount",
    "days",
    "pair",
    "roundup",
    "runs",
    "since",
}
_FORBIDDEN = re.compile(r"[\x00-\x1f\x7f`|]")
_WORD = re.compile(r"[^\W_]+", re.UNICODE)
_IBAN = re.compile(r"[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}")
MAX_NAME = 40
MAX_LABEL = 80


class RulesError(ValueError):
    """`categories.toml` does not parse or breaks a rule of the format."""


def normalize(text: str) -> str:
    return " ".join(text.casefold().split())


def words(text: str) -> tuple[str, ...]:
    return tuple(_WORD.findall(text.casefold()))


def iban_key(iban: str) -> str:
    return "".join(iban.split()).upper()


def is_holder(counterparty: str, holders: Iterable[tuple[str, ...]]) -> bool:
    """Whether the counterparty is the account holder: every word of a holder name
    (at least two distinct words, so strangers sharing a surname do not match)
    appears in it, in any order."""
    party_words = set(words(counterparty))
    return any(len(set(name)) >= 2 and set(name) <= party_words for name in holders)


def role_of(category: str) -> Role:
    return ROLES.get(category, "spending")


@dataclass(frozen=True)
class Booking:
    """What the rules read of one booked entry."""

    account: str  # the store's account key: what "the same account" means
    iban: str
    day: datetime.date
    flow: Flow
    amount_cents: int
    currency: str
    counterparty: str
    remittance: str

    @property
    def textless(self) -> bool:
        return not self.counterparty.strip() and not self.remittance.strip()


@dataclass(frozen=True)
class Rule:
    position: int
    category: str
    patterns: tuple[str, ...]
    flow: Flow | None
    label: str | None
    holder: bool
    account: str | None = None
    amount: tuple[int, int] | None = None  # cents, both ends included
    days: tuple[int, int] | None = None  # days of the month, both ends included
    pair: int | None = None  # cents
    roundup: roundup.Settings | None = None

    @property
    def conditional(self) -> bool:
        """Whether it has a condition besides its flow, patterns and holder."""
        return any(
            value is not None
            for value in (self.account, self.amount, self.days, self.pair, self.roundup)
        )

    def describe(self) -> str:
        return f'rule {self.position} ("{self.category}")'


@dataclass(frozen=True)
class Match:
    category: str
    label: str | None
    holder: bool = False


def _one_to_one(candidates: Iterable[tuple[Any, ...]]) -> dict[int, int]:
    """Greedy pairing in the order given: each candidate ends with two indexes."""
    partner: dict[int, int] = {}
    for *_, first, second in sorted(candidates):
        if first not in partner and second not in partner:
            partner[first], partner[second] = second, first
    return partner


def holder_flags(
    bookings: Sequence[Booking], holders: Iterable[tuple[str, ...]]
) -> list[bool]:
    """Whether each entry is money between the holder's own accounts (see the
    module docstring)."""
    names = list(holders)
    flags = [is_holder(b.counterparty, names) for b in bookings]
    same: dict[tuple[int, str], list[int]] = defaultdict(list)
    for index, entry in enumerate(bookings):
        same[(entry.amount_cents, entry.currency)].append(index)
    candidates = set()
    for index, entry in enumerate(bookings):
        if not flags[index] or entry.textless:
            continue
        for other in same[(entry.amount_cents, entry.currency)]:
            match = bookings[other]
            gap = abs((match.day - entry.day).days)
            if (
                match.account != entry.account
                and match.flow != entry.flow
                and gap <= PAIR_DAYS
                and (match.textless or flags[other])
            ):
                low, high = sorted((index, other))
                candidates.add((gap, match.textless, low, high))
    for index in _one_to_one(candidates):
        flags[index] = True
    return flags


def spending_pairs(bookings: Sequence[Booking], widest: int) -> dict[int, int]:
    """Money in and the money out on the same account that spends it, within
    PAIR_DAYS and at most `widest` cents below it: one to one, closest amounts
    first. Both entries map to each other."""
    by_account: dict[tuple[str, str], list[int]] = defaultdict(list)
    for index, entry in enumerate(bookings):
        by_account[(entry.account, entry.currency)].append(index)
    candidates = []
    for indexes in by_account.values():
        ins = [i for i in indexes if bookings[i].flow == "IN"]
        outs = [i for i in indexes if bookings[i].flow == "OUT"]
        for i in ins:
            for o in outs:
                days = (bookings[o].day - bookings[i].day).days
                short = bookings[i].amount_cents - bookings[o].amount_cents
                if 0 <= days <= PAIR_DAYS and 0 <= short <= widest:
                    candidates.append((short, days, i, o))
    return _one_to_one(candidates)


@dataclass(frozen=True)
class Categorised:
    """Each entry's match, in order, and the Round up runs (indexes are the
    entries')."""

    matches: list[Match]
    runs: tuple[roundup.Run, ...] = ()


@dataclass(frozen=True)
class Rules:
    rules: tuple[Rule, ...]
    warnings: tuple[str, ...]

    def categorise(
        self, bookings: Sequence[Booking], holders: Iterable[tuple[str, ...]] = ()
    ) -> list[Match]:
        return self.classify(bookings, holders).matches

    def classify(
        self, bookings: Sequence[Booking], holders: Iterable[tuple[str, ...]] = ()
    ) -> Categorised:
        """Each entry's match and the Round up runs. Pairs and runs are found
        among these entries only, so give every stored entry for categories
        that never depend on the range read."""
        flags = holder_flags(bookings, holders)
        widest = max(
            (rule.pair for rule in self.rules if rule.pair is not None), default=None
        )
        pairs = {} if widest is None else spending_pairs(bookings, widest)
        found: dict[int, bool] = {}
        runs: list[roundup.Run] = []
        rule = next((r for r in self.rules if r.roundup is not None), None)
        if rule is not None and rule.roundup is not None:
            before = self.rules[: self.rules.index(rule)]
            mine = [
                i
                for i, entry in enumerate(bookings)
                if iban_key(entry.iban) == rule.account
            ]
            debits = [
                roundup.Debit(i, bookings[i].day, bookings[i].amount_cents)
                for i in mine
                if bookings[i].flow == "OUT"
                and bookings[i].currency == "EUR"
                and self._first(i, bookings, flags[i], pairs, before, {}) is None
            ]
            if mine:
                last = max(bookings[i].day for i in mine)
                found, runs = roundup.resolve(debits, rule.roundup, last)
        matches = [
            self._first(i, bookings, flags[i], pairs, self.rules, found)
            or Match(OTHER, None, flags[i])
            for i in range(len(bookings))
        ]
        return Categorised(matches, tuple(runs))

    def _first(
        self,
        index: int,
        bookings: Sequence[Booking],
        holder: bool,
        pairs: Mapping[int, int],
        rules: Sequence[Rule],
        roundups: Mapping[int, bool],
    ) -> Match | None:
        entry = bookings[index]
        fields = (normalize(entry.counterparty), normalize(entry.remittance))
        for rule in rules:
            if rule.flow is not None and rule.flow != entry.flow:
                continue
            if rule.account is not None and rule.account != iban_key(entry.iban):
                continue
            if rule.amount is not None and not (
                rule.amount[0] <= entry.amount_cents <= rule.amount[1]
            ):
                continue
            if rule.days is not None and not (
                rule.days[0] <= entry.day.day <= rule.days[1]
            ):
                continue
            if rule.patterns or rule.holder:
                hit = (rule.holder and holder) or any(
                    pattern in field for field in fields for pattern in rule.patterns
                )
                if not hit:
                    continue
            if rule.pair is not None and (
                index not in pairs
                or abs(entry.amount_cents - bookings[pairs[index]].amount_cents)
                > rule.pair
            ):
                continue
            if rule.roundup is not None:
                if index not in roundups:
                    continue
                if not roundups[index]:
                    return Match(OTHER, UNRESOLVED, holder)
            return Match(rule.category, rule.label, holder)
        return None


def _clean_name(value: Any, what: str, where: str, limit: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RulesError(f"{where}: {what} must be a non-empty string")
    text = " ".join(value.split())
    if _FORBIDDEN.search(value):
        raise RulesError(
            f"{where}: {what} {value!r} contains a backtick, pipe or control character"
        )
    if len(text) > limit:
        raise RulesError(f"{where}: {what} is longer than {limit} characters")
    return text


def _cents(value: Any, what: str, where: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RulesError(f"{where}: {what} must be an amount in euros, such as 49.99")
    text = repr(value) if isinstance(value, float) else str(value)
    try:
        exponent = Decimal(text).as_tuple().exponent
        cents = to_cents(text)
    except (InvalidOperation, MalformedTransaction):
        raise RulesError(f"{where}: {what} {value!r} is not a usable amount") from None
    if isinstance(exponent, int) and exponent < -2:
        raise RulesError(f"{where}: {what} {value!r} has more than two decimals")
    if cents < 0:
        raise RulesError(f"{where}: {what} must not be negative")
    return cents


def _span(
    value: Any, what: str, where: str, parse: Any, example: str
) -> tuple[int, int]:
    """One value or a [lowest, highest] pair, as an inclusive range."""
    if isinstance(value, list):
        if len(value) != 2:
            raise RulesError(f"{where}: {what} must be one value or two, as {example}")
        low, high = parse(value[0]), parse(value[1])
        if low > high:
            raise RulesError(f"{where}: {what} starts above where it ends")
        return low, high
    single = parse(value)
    return single, single


def _day(value: Any, where: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 31:
        raise RulesError(f"{where}: days must be days of the month from 1 to 31")
    return value


def _roundup(table: Mapping[str, Any], where: str) -> roundup.Settings | None:
    keys = {"roundup", "runs", "since"} & set(table)
    if not keys:
        return None
    if keys != {"roundup", "runs", "since"}:
        raise RulesError(f"{where}: roundup, runs and since go together")
    clash = sorted({"match", "holder", "amount", "days", "pair"} & set(table))
    if clash:
        raise RulesError(f"{where}: a roundup rule takes no {', '.join(clash)}")
    if "account" not in table:
        raise RulesError(f"{where}: a roundup rule needs the account it runs on")
    if table.get("flow", "out") != "out":
        raise RulesError(f'{where}: a roundup rule is for money out: flow = "out"')
    multiplier = table["roundup"]
    if isinstance(multiplier, bool) or multiplier not in roundup.MULTIPLIERS:
        choices = ", ".join(str(m) for m in roundup.MULTIPLIERS)
        raise RulesError(f"{where}: roundup is the multiplier: one of {choices}")
    runs = table["runs"]
    if (
        not isinstance(runs, list)
        or not runs
        or any(isinstance(d, bool) or not isinstance(d, int) for d in runs)
        or not all(1 <= d <= 28 for d in runs)
        or len(set(runs)) != len(runs)
    ):
        raise RulesError(
            f"{where}: runs must list days of the month from 1 to 28, such as [2, 9, 16, 23]"
        )
    since = table["since"]
    if not isinstance(since, datetime.date) or isinstance(since, datetime.datetime):
        raise RulesError(f"{where}: since must be a date, such as 2026-10-23")
    return roundup.Settings(multiplier, tuple(sorted(runs)), since)


def _rule(position: int, table: Any, source: str) -> Rule:
    where = f"{source}: rule {position}"
    if not isinstance(table, Mapping):
        raise RulesError(f"{where} is not a table")
    unknown = sorted(set(table) - _RULE_KEYS)
    if unknown:
        raise RulesError(
            f"{where}: unknown key {', '.join(unknown)} (allowed: {', '.join(sorted(_RULE_KEYS))})"
        )
    category = _clean_name(table.get("category"), "category", where, MAX_NAME)
    where = f'{source}: rule {position} ("{category}")'
    for reserved in RESERVED:
        if category != reserved and category.casefold() == reserved.casefold():
            raise RulesError(f'{where}: write the category as "{reserved}"')
    patterns: list[str] = []
    if "match" in table:
        patterns_value = table["match"]
        if not isinstance(patterns_value, list) or not patterns_value:
            raise RulesError(f"{where}: match must be a non-empty list of strings")
        for pattern in patterns_value:
            if not isinstance(pattern, str) or not normalize(pattern):
                raise RulesError(
                    f"{where}: every match entry must be a non-empty string"
                )
            patterns.append(normalize(pattern))
    flow_value = table.get("flow")
    flow: Flow | None
    if flow_value is None:
        flow = None
    elif flow_value == "in":
        flow = "IN"
    elif flow_value == "out":
        flow = "OUT"
    else:
        raise RulesError(f'{where}: flow must be "in" or "out", not {flow_value!r}')
    if category == GIFTS and flow != "IN":
        raise RulesError(
            f'{where}: Gifts is for money given to you: add flow = "in" '
            "(a present you give is spending)"
        )
    label_value = table.get("label")
    label = (
        None
        if label_value is None
        else _clean_name(label_value, "label", where, MAX_LABEL)
    )
    holder = table.get("holder", False)
    if not isinstance(holder, bool):
        raise RulesError(f"{where}: holder must be true or false")
    terms = _roundup(table, where)
    if terms is not None:
        flow = "OUT"
    account = None
    if "account" in table:
        value = table["account"]
        account = iban_key(value) if isinstance(value, str) else ""
        if not _IBAN.fullmatch(account):
            raise RulesError(f"{where}: account must be an IBAN, not {value!r}")
    if not patterns and not holder and account is None:
        raise RulesError(f"{where}: give match, holder = true or an account")
    amount = (
        _span(
            table["amount"],
            "amount",
            where,
            lambda v: _cents(v, "amount", where),
            "[49.75, 50]",
        )
        if "amount" in table
        else None
    )
    days = (
        _span(table["days"], "days", where, lambda v: _day(v, where), "[1, 4]")
        if "days" in table
        else None
    )
    pair = _cents(table["pair"], "pair", where) if "pair" in table else None
    return Rule(
        position,
        category,
        tuple(patterns),
        flow,
        label,
        holder,
        account,
        amount,
        days,
        pair,
        terms,
    )


def _shadow_warnings(rules: Sequence[Rule]) -> tuple[str, ...]:
    warnings: list[str] = []
    for later_index, later in enumerate(rules):
        for pattern in later.patterns:
            for earlier in rules[:later_index]:
                if earlier.conditional or (
                    earlier.flow is not None and earlier.flow != later.flow
                ):
                    continue
                if (earlier.category, earlier.label) == (later.category, later.label):
                    continue
                hit = next((p for p in earlier.patterns if p in pattern), None)
                if hit is not None:
                    warnings.append(
                        f'{later.describe()}: pattern "{pattern}" never matches, '
                        f'{earlier.describe()} matches "{hit}" first'
                    )
                    break
        if later.account is None:
            continue
        catch_all = next(
            (
                earlier
                for earlier in rules[:later_index]
                if earlier.account == later.account
                and not earlier.patterns
                and not earlier.holder
                and earlier.amount is None
                and earlier.days is None
                and earlier.pair is None
                and earlier.roundup is None
                and earlier.flow in (None, later.flow)
                and (earlier.category, earlier.label) != (later.category, later.label)
            ),
            None,
        )
        if catch_all is not None:
            warnings.append(
                f"{later.describe()} never matches: {catch_all.describe()} takes "
                "every entry on its account first"
            )
    return tuple(warnings)


def parse_rules(text: str, source: str) -> Rules:
    try:
        data = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise RulesError(f"{source} does not parse: {exc}") from exc
    unknown = sorted(set(data) - {"rule"})
    if unknown:
        raise RulesError(
            f"{source}: unknown top-level key {', '.join(unknown)} (rules are [[rule]] tables)"
        )
    tables = data.get("rule", [])
    if not isinstance(tables, list):
        raise RulesError(f"{source}: rules must be written as [[rule]] tables")
    rules = tuple(_rule(index, table, source) for index, table in enumerate(tables, 1))
    if sum(1 for rule in rules if rule.roundup is not None) > 1:
        raise RulesError(f"{source}: only one rule can have roundup")
    seen: dict[str, Rule] = {}
    for rule in rules:
        other = seen.setdefault(rule.category.casefold(), rule)
        if other.category != rule.category:
            raise RulesError(
                f"{source}: {rule.describe()} and {other.describe()} name the same category "
                "with different capitals"
            )
    return Rules(rules, _shadow_warnings(rules))


def starter_text() -> str:
    return (
        resources.files("finance")
        .joinpath("starter_categories.toml")
        .read_text(encoding="utf-8")
    )


def load_rules(path: Path) -> Rules:
    """The rules at `path`, or the starter rules while the file does not exist."""
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return parse_rules(starter_text(), "starter categories")
    except (OSError, UnicodeDecodeError) as exc:
        raise RulesError(f"{path} cannot be read: {exc}") from exc
    return parse_rules(text, str(path))


def install_starter(path: Path) -> bool:
    """Write the starter file if there is none; return whether it was written."""
    if path.exists():
        return False
    write_private(path, starter_text().encode("utf-8"))
    return True
