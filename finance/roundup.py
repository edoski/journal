"""Trade Republic's Round up, told from the card payments by its amount alone.

Trade Republic rounds each card payment up to the next euro (a whole-euro
payment by a full euro), times a multiplier, takes it from cash when the
payment is made, and invests the total on fixed days of the month ("runs", the
next working day when one falls on a holiday) as ONE debit for every payment
since the previous run. Its feed has no text, so a run's debit looks like a
card payment. It is accepted only when its amount is exact:

- A card payment is booked 0 to LAG days after it is made, so a payment booked
  near a run's cut-off may belong to that run or the next ("optional"); every
  other one belongs to the first run after it ("certain").
- A run's debit is booked from the run's day to LATE days after it. Every debit
  there that no earlier rule took is a candidate. Taking its day as the
  cut-off, the run's possible sums are the certain payments' round-ups plus any
  choice of the optional ones.
- The run is matched when exactly one candidate equals a possible sum and every
  choice that gives that sum leaves the same round-ups to the runs either side.
  Its payments are then settled, and the next run starts at its cut-off.
- Otherwise nothing is guessed: the run is reported (ambiguous, unmatched or
  missing), every candidate that could be its debit stays uncategorised, and
  the next run treats the payments near this run's cut-off as optional.

Refunds are money in, so they never count. A foreign-currency payment, a cash
withdrawal or any other debit the rules leave to the card counts as a card
payment; if Trade Republic rounds it otherwise, no sum matches and the run is
reported, never guessed.
"""

from __future__ import annotations

import datetime
import itertools
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

# Days a card payment may take to be booked: 1 to 2 seen (Oct-Nov 2026), one
# more for a weekend.
LAG = 3
# Days a run may move past its day: a Saturday run on Monday, a holiday next to
# a weekend.
LATE = 3
# Choices of optional payments tried per candidate; beyond it the run is reported.
MAX_CHOICES = 4096
MULTIPLIERS = (1, 2, 3, 5, 10)

Status = Literal["matched", "ambiguous", "unmatched", "missing"]


@dataclass(frozen=True)
class Settings:
    """A `roundup` rule's terms."""

    multiplier: int
    runs: tuple[int, ...]  # days of the month, ascending
    since: datetime.date  # payments made from this day are rounded up


@dataclass(frozen=True)
class Debit:
    index: int  # the caller's index of the entry
    day: datetime.date
    cents: int


@dataclass(frozen=True)
class Run:
    """One run the bank data says something about."""

    day: datetime.date  # the run's day of the month, before any holiday move
    status: Status
    debit: int | None  # matched: the round-up debit's index
    candidates: tuple[int, ...]  # unresolved: the debits that could be it
    expected: tuple[int, ...]  # cents: the sums the payments allow, ascending
    covers: tuple[int, ...]  # matched: the card payments it rounds up
    settles: datetime.date  # nothing booked after this day can change it


def round_up(cents: int, multiplier: int) -> int:
    """What Trade Republic sets aside for a card payment: up to the next euro,
    a full euro for a whole-euro amount, times the multiplier."""
    return (100 - cents % 100) * multiplier


@dataclass(frozen=True)
class _Low:
    """Where a run's payments start: before `exclude`, none; from `certain`,
    every one; in between, optional."""

    exclude: datetime.date
    certain: datetime.date


@dataclass(frozen=True)
class _Cut:
    """One candidate's view of the run: its day as the cut-off."""

    debit: Debit
    certain: tuple[Debit, ...]
    optional: tuple[Debit, ...]
    sides: tuple[str, ...]  # per optional payment: "low" or "high" of the run


def _cut(debit: Debit, pending: Iterable[Debit], low: _Low) -> _Cut:
    certain, optional, sides = [], [], []
    for payment in pending:
        if payment.index == debit.index:
            continue
        if payment.day < low.exclude or payment.day > debit.day + _days(LAG):
            continue
        if low.certain <= payment.day < debit.day:
            certain.append(payment)
        else:
            optional.append(payment)
            sides.append("high" if payment.day >= debit.day else "low")
    return _Cut(debit, tuple(certain), tuple(optional), tuple(sides))


def _days(count: int) -> datetime.timedelta:
    return datetime.timedelta(days=count)


Choice = tuple[tuple[str, int, int], ...]  # (side, round-up, how many), sorted


def _choices(cut: _Cut, multiplier: int) -> dict[int, list[Choice]] | None:
    """Every sum the cut allows, with the choices of optional payments giving it;
    None when there are more than MAX_CHOICES."""
    groups: dict[tuple[str, int], int] = defaultdict(int)
    for payment, side in zip(cut.optional, cut.sides, strict=True):
        groups[(side, round_up(payment.cents, multiplier))] += 1
    keys = sorted(groups)
    total = 1
    for key in keys:
        total *= groups[key] + 1
    if total > MAX_CHOICES:
        return None
    base = sum(round_up(p.cents, multiplier) for p in cut.certain)
    sums: dict[int, list[Choice]] = defaultdict(list)
    for counts in itertools.product(*(range(groups[key] + 1) for key in keys)):
        choice = tuple(
            (side, value, count)
            for (side, value), count in zip(keys, counts, strict=True)
            if count
        )
        sums[base + sum(value * count for _, value, count in choice)].append(choice)
    return sums


def _plausible(cut: _Cut, multiplier: int) -> bool:
    """Whether the debit is within what the cut's payments could add up to."""
    least = len(cut.certain) * multiplier
    most = (len(cut.certain) + len(cut.optional)) * 100 * multiplier
    return 0 < cut.debit.cents and least <= cut.debit.cents <= most


def _covered(cut: _Cut, choice: Choice, multiplier: int) -> tuple[Debit, ...]:
    """The certain payments and, for each (side, round-up), the earliest optional
    ones: payments the choice cannot tell apart leave the same sums either way."""
    picked = list(cut.certain)
    for side, value, count in choice:
        same = sorted(
            (
                p
                for p, s in zip(cut.optional, cut.sides, strict=True)
                if s == side and round_up(p.cents, multiplier) == value
            ),
            key=lambda p: (p.day, p.index),
        )
        picked += same[:count]
    return tuple(sorted(picked, key=lambda p: (p.day, p.index)))


def run_days(settings: Settings, last: datetime.date) -> list[datetime.date]:
    """The runs after `since` up to `last`."""
    days = []
    month = settings.since.replace(day=1)
    while month <= last:
        for day in settings.runs:
            run = month.replace(day=day)
            if settings.since < run <= last:
                days.append(run)
        month = (month + _days(32)).replace(day=1)
    return days


def resolve(
    debits: Sequence[Debit], settings: Settings, last: datetime.date
) -> tuple[dict[int, bool], list[Run]]:
    """The round-up debits among `debits` (every euro debit on the account that
    no earlier rule took) and the runs up to `last` (the account's last booked
    day). Returns {index: True for a round-up, False for a debit left
    uncategorised} and the runs with something to say; a run without card
    payments and without a debit says nothing."""
    m = settings.multiplier
    pending = sorted(
        (d for d in debits if d.day >= settings.since), key=lambda d: (d.day, d.index)
    )
    low = _Low(settings.since, settings.since + _days(LAG))
    found: dict[int, bool] = {}
    runs: list[Run] = []
    for day in run_days(settings, last):
        settles = day + _days(LATE + LAG)
        window = [d for d in pending if day <= d.day <= day + _days(LATE)]
        cuts = [_cut(d, pending, low) for d in window]
        plausible = [c for c in cuts if _plausible(c, m)]
        sums = {c.debit.index: _choices(c, m) for c in plausible}
        matching = [
            c
            for c in plausible
            if (found_sums := sums[c.debit.index]) is None
            or c.debit.cents in found_sums
        ]
        shown = [s for s in sums.values() if s is not None]
        if not shown:
            nominal = _choices(_cut(Debit(-1, day, 0), pending, low), m)
            shown = [nominal] if nominal is not None else []
        expected = tuple(sorted({total for s in shown for total in s if total}))
        if len(matching) == 1:
            cut = matching[0]
            choices = (sums[cut.debit.index] or {}).get(cut.debit.cents, [])
            if len(choices) == 1:
                covers = _covered(cut, choices[0], m)
                found[cut.debit.index] = True
                taken = {p.index for p in covers} | {cut.debit.index}
                pending = [d for d in pending if d.index not in taken]
                low = _Low(cut.debit.day, cut.debit.day)
                runs.append(
                    Run(
                        day,
                        "matched",
                        cut.debit.index,
                        (),
                        expected,
                        tuple(p.index for p in covers),
                        settles,
                    )
                )
                continue
        if matching:
            status: Status = "ambiguous"
            unresolved = matching
        elif plausible:
            status, unresolved = "unmatched", plausible
        else:
            nobody = _cut(Debit(-1, day, 0), pending, low)
            if not nobody.certain:
                continue  # nothing was due, so no run happened: payments roll over
            status, unresolved = "missing", []
        for cut in unresolved:
            found[cut.debit.index] = False
        days = [c.debit.day for c in unresolved] or [day, day + _days(LATE)]
        latest = max(days)
        low = _Low(min(days), latest + _days(LAG + 1))
        pending = [d for d in pending if d.day >= low.exclude]
        runs.append(
            Run(
                day,
                status,
                None,
                tuple(c.debit.index for c in unresolved),
                expected,
                (),
                settles,
            )
        )
    return found, runs
