"""Category rules: `categories.toml`, first match wins, applied when reading.

Each `[[rule]]` has a `category`, a `match` list of patterns and, optionally,
`flow` ("in" or "out"), `label` (shown instead of the bank text) and `holder`
(true: also match when the counterparty is the account holder, by the name the
bank gives the account, in any word order). A pattern matches when it is a
case-insensitive substring of the counterparty name or of the remittance text,
whitespace collapsed. Rules are tried top to bottom; for each rule the
counterparty is tried before the remittance text. Nothing matched is "Other".

Four categories have a role: Income (the waterfall's INCOME), Investing
(INVESTED), Transfer (between own accounts: left out of every total) and Other
(the unmatched rest). Every other category is spending. Refunds are IN entries
under a matched spending category and reduce it; an unmatched IN entry is shown
as Other and counted as INCOME by the period notes.

Categories are applied when the notes are synced, so a rules edit reaches a
past note only when that note is synced again.
"""

from __future__ import annotations

import re
import tomllib
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any, Literal

from finance.files import write_private
from finance.transactions import Flow

Role = Literal["income", "spending", "investing", "transfer"]
INCOME = "Income"
INVESTING = "Investing"
TRANSFER = "Transfer"
OTHER = "Other"
ROLES: dict[str, Role] = {
    INCOME: "income",
    INVESTING: "investing",
    TRANSFER: "transfer",
}
RESERVED = (INCOME, INVESTING, TRANSFER, OTHER)
_RULE_KEYS = {"category", "match", "flow", "label", "holder"}
_FORBIDDEN = re.compile(r"[\x00-\x1f\x7f`|]")
_WORD = re.compile(r"[^\W_]+", re.UNICODE)
MAX_NAME = 40
MAX_LABEL = 80


class RulesError(ValueError):
    """`categories.toml` does not parse or breaks a rule of the format."""


def normalize(text: str) -> str:
    return " ".join(text.casefold().split())


def words(text: str) -> tuple[str, ...]:
    return tuple(_WORD.findall(text.casefold()))


def is_holder(counterparty: str, holders: Iterable[tuple[str, ...]]) -> bool:
    """Whether the counterparty is the account holder: every word of a holder name
    (at least two distinct words, so strangers sharing a surname do not match)
    appears in it, in any order."""
    party_words = set(words(counterparty))
    return any(len(set(name)) >= 2 and set(name) <= party_words for name in holders)


def role_of(category: str) -> Role:
    return ROLES.get(category, "spending")


@dataclass(frozen=True)
class Rule:
    position: int
    category: str
    patterns: tuple[str, ...]
    flow: Flow | None
    label: str | None
    holder: bool

    def describe(self) -> str:
        return f'rule {self.position} ("{self.category}")'


@dataclass(frozen=True)
class Match:
    category: str
    label: str | None


@dataclass(frozen=True)
class Rules:
    rules: tuple[Rule, ...]
    warnings: tuple[str, ...]

    def categorise(
        self,
        *,
        flow: Flow,
        counterparty: str,
        remittance: str,
        holders: Iterable[tuple[str, ...]] = (),
    ) -> Match:
        fields = (normalize(counterparty), normalize(remittance))
        holder_names = list(holders)
        for rule in self.rules:
            if rule.flow is not None and rule.flow != flow:
                continue
            for field in fields:
                if any(pattern in field for pattern in rule.patterns):
                    return Match(rule.category, rule.label)
            if rule.holder and is_holder(counterparty, holder_names):
                return Match(rule.category, rule.label)
        return Match(OTHER, None)


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
    patterns_value = table.get("match")
    if not isinstance(patterns_value, list) or not patterns_value:
        raise RulesError(f"{where}: match must be a non-empty list of strings")
    patterns: list[str] = []
    for pattern in patterns_value:
        if not isinstance(pattern, str) or not normalize(pattern):
            raise RulesError(f"{where}: every match entry must be a non-empty string")
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
    label_value = table.get("label")
    label = (
        None
        if label_value is None
        else _clean_name(label_value, "label", where, MAX_LABEL)
    )
    holder = table.get("holder", False)
    if not isinstance(holder, bool):
        raise RulesError(f"{where}: holder must be true or false")
    return Rule(position, category, tuple(patterns), flow, label, holder)


def _shadow_warnings(rules: Sequence[Rule]) -> tuple[str, ...]:
    warnings: list[str] = []
    for later_index, later in enumerate(rules):
        for pattern in later.patterns:
            for earlier in rules[:later_index]:
                if earlier.flow is not None and earlier.flow != later.flow:
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
