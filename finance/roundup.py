"""Trade Republic's Round up, told from the card payments by its amount alone.

Trade Republic rounds each card payment up to the next euro (a whole-euro
payment by a full euro), times a multiplier, takes it from cash when the
payment is made, and invests the total on fixed days of the month ("runs", the
next working day when one falls on a holiday) as ONE debit for every payment
since the previous run. Its feed has no text, so a run's debit looks like a
card payment. It is accepted only when its amount is exact:

- A card payment is booked 0 to LAG days after it is made, so a payment booked
  near a run's cut-off may belong to either side of it ("optional"); every
  other one belongs to the first run after it ("certain").
- A run's debit is booked from the run's day to LATE days after it. Every debit
  there that no earlier rule took is a candidate. Taking its day as the
  cut-off, the run's possible sums are the certain payments' round-ups plus any
  choice of the optional ones: those booked before the cut-off ("low", left
  over by a run that could not be matched) and those booked from it ("high",
  which otherwise go to the next run).
- The run is matched when exactly one candidate equals a possible sum. Which
  low payments it took never matters: those it leaves belong to the run
  before, which was reported already. When every choice giving that sum takes
  the same round-ups from the high side, the next run's payments are known;
  when choices differ there, the debit is still certain and only the next run
  is open: it treats the high side's payments as optional.
- Otherwise nothing is guessed: the run is reported (ambiguous when two or
  more candidates match, unmatched or missing), every candidate that could be
  its debit stays uncategorised, and the next run treats the payments near
  this run's cut-off as optional.

The first run, EUR 3.21 on 2 Nov 2026, confirmed that a whole-euro payment is
rounded up by a full euro (it needs 7.00, 9.00 and 21.00 at EUR 1 each) and
that payments booked on the run's day were in it.

A debit counts as a card payment when no earlier rule took it and it is not
money between the holder's own accounts. Refunds are money in, so they never
count. If Trade Republic rounds a foreign-currency payment or a cash withdrawal
otherwise, no sum matches and the run is reported.

If a run does not happen (Round up paused), a card payment whose amount happens
to equal a possible sum is taken for it: set `until` when Round up is switched
off or its multiplier changes.
"""

from __future__ import annotations

import datetime
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

# Days a card payment may take to be booked: 1 to 2 seen (Oct-Nov 2026), one
# more for a weekend.
LAG = 3
# Days a run may move past its day: a Saturday run on Monday, a holiday next to
# a weekend.
LATE = 3
# Runs must be further apart than a run's whole reach, LATE + LAG.
SPACING = LATE + LAG + 1
MULTIPLIERS = (1, 2, 3, 5, 10)
# The possible sums a report lists, nearest the debits first.
SHOWN = 8

Status = Literal["matched", "ambiguous", "unmatched", "missing"]


@dataclass(frozen=True)
class RoundUp:
    """A `roundup` rule's terms."""

    multiplier: int
    runs: tuple[int, ...]  # days of the month, ascending
    since: datetime.date  # payments made from this day are rounded up
    until: datetime.date | None = None  # the last run


@dataclass(frozen=True)
class Debit:
    index: int  # the caller's index of the entry
    day: datetime.date
    cents: int


@dataclass(frozen=True)
class Run:
    """One run the bank data says something about."""

    account: str  # the IBAN it runs on
    day: datetime.date  # the run's day of the month, before any holiday move
    status: Status
    debit: int | None  # matched: the round-up debit's index
    candidates: tuple[int, ...]  # unresolved: the debits that could be it
    expected: tuple[int, ...]  # cents: up to SHOWN possible sums, ascending
    possible: int  # how many sums are possible in all
    # matched: one set of card payments that adds up, one of several when the
    # choices differ on the high side
    covers: tuple[int, ...]
    settles: datetime.date  # nothing booked after this day can change it


def round_up(cents: int, multiplier: int) -> int:
    """What Trade Republic sets aside for a card payment: up to the next euro,
    a full euro for a whole-euro amount, times the multiplier."""
    return (100 - cents % 100) * multiplier


def _days(count: int) -> datetime.timedelta:
    return datetime.timedelta(days=count)


@dataclass(frozen=True)
class _Low:
    """Where a run's payments start: before `exclude`, none; from `certain`,
    every one; in between, optional (low)."""

    exclude: datetime.date
    certain: datetime.date


Multiset = tuple[tuple[int, int], ...]  # (round-up, how many), by round-up


@dataclass(frozen=True)
class _Cut:
    """The run as one cut-off day sees it."""

    day: datetime.date
    base: int  # the certain payments' round-ups
    certain: tuple[Debit, ...]
    low: dict[int, tuple[Debit, ...]]  # reachable sum -> one choice reaching it
    high: dict[int, tuple[int, Multiset]]  # sum -> (ways, 1 or 2+; one of them)
    high_payments: tuple[Debit, ...]
    count: int  # payments that may be in the run

    def sums(self) -> set[int]:
        lows = sum(1 << low for low in self.low)
        mask = 0
        for high in self.high:
            mask |= lows << high
        return {self.base + i for i in range(mask.bit_length()) if mask >> i & 1}

    def ways(self, cents: int) -> tuple[int, Multiset, int]:
        """How many high-side choices reach `cents` (capped at 2), one of them,
        and the low sum it needs."""
        found = [
            (ways, chosen, cents - self.base - high)
            for high, (ways, chosen) in self.high.items()
            if cents - self.base - high in self.low
        ]
        if not found:
            return 0, (), 0
        _, chosen, low = found[0]
        return min(2, sum(ways for ways, _, _ in found)), chosen, low


def _reach(payments: Sequence[Debit], multiplier: int) -> dict[int, tuple[Debit, ...]]:
    reach: dict[int, tuple[Debit, ...]] = {0: ()}
    for payment in payments:
        value = round_up(payment.cents, multiplier)
        for total, chosen in list(reach.items()):
            reach.setdefault(total + value, (*chosen, payment))
    return reach


def _multisets(
    payments: Sequence[Debit], multiplier: int
) -> dict[int, tuple[int, Multiset]]:
    groups = Counter(round_up(p.cents, multiplier) for p in payments)
    sums: dict[int, tuple[int, Multiset]] = {0: (1, ())}
    for value in sorted(groups):
        grown: dict[int, tuple[int, Multiset]] = {}
        for total, (ways, chosen) in sums.items():
            for count in range(groups[value] + 1):
                key = total + value * count
                pick = (*chosen, (value, count)) if count else chosen
                before = grown.get(key)
                if before is None:
                    grown[key] = (ways, pick)
                else:
                    grown[key] = (min(2, before[0] + ways), before[1])
        sums = grown
    return sums


def _cut(
    day: datetime.date, pending: Sequence[Debit], low: _Low, skip: int, m: int
) -> _Cut:
    certain, lows, highs = [], [], []
    for payment in pending:
        if payment.index == skip:
            continue
        if payment.day < low.exclude or payment.day > day + _days(LAG):
            continue
        if low.certain <= payment.day < day:
            certain.append(payment)
        elif payment.day < day:
            lows.append(payment)
        else:
            highs.append(payment)
    return _Cut(
        day,
        sum(round_up(p.cents, m) for p in certain),
        tuple(certain),
        _reach(lows, m),
        _multisets(highs, m),
        tuple(highs),
        len(certain) + len(lows) + len(highs),
    )


def _plausible(cut: _Cut, cents: int, multiplier: int) -> bool:
    """Whether the debit is within what the cut's payments could add up to."""
    least = len(cut.certain) * multiplier
    return 0 < cents and least <= cents <= cut.count * 100 * multiplier


def _covered(cut: _Cut, chosen: Multiset, low: int, m: int) -> tuple[int, ...]:
    picked = list(cut.certain) + list(cut.low[low])
    for value, count in chosen:
        same = [p for p in cut.high_payments if round_up(p.cents, m) == value]
        picked += sorted(same, key=lambda p: (p.day, p.index))[:count]
    return tuple(p.index for p in sorted(picked, key=lambda p: (p.day, p.index)))


def _shown(sums: set[int], near: Sequence[int]) -> tuple[int, ...]:
    ranked = sorted(sums - {0}, key=lambda s: (min(abs(s - n) for n in near), s))
    return tuple(sorted(ranked[:SHOWN]))


def run_days(settings: RoundUp, last: datetime.date) -> list[datetime.date]:
    """The runs after `since`, up to `until` and `last`."""
    end = min(last, settings.until) if settings.until else last
    days = []
    month = settings.since.replace(day=1)
    while month <= end:
        for day in settings.runs:
            run = month.replace(day=day)
            if settings.since < run <= end:
                days.append(run)
        month = (month + _days(32)).replace(day=1)
    return days


def resolve(
    account: str, debits: Sequence[Debit], settings: RoundUp, last: datetime.date
) -> tuple[dict[int, bool], list[Run]]:
    """The round-up debits among `debits` (every euro card payment and debit
    that could be a run's, see the module docstring) and the runs up to `last`
    (the account's last booked day). Returns {index: True for a round-up, False
    for a debit left uncategorised} and the runs with something to say; a run
    without card payments and without a debit says nothing."""
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
        cuts = {d.index: _cut(d.day, pending, low, d.index, m) for d in window}
        plausible = [d for d in window if _plausible(cuts[d.index], d.cents, m)]
        options = {d.index: cuts[d.index].ways(d.cents) for d in plausible}
        matching = [d for d in plausible if options[d.index][0]]
        nominal = _cut(day, pending, low, -1, m)
        sums = set().union(*(cuts[d.index].sums() for d in plausible)) or nominal.sums()
        near = [d.cents for d in plausible] or [0]
        if len(matching) == 1:
            debit = matching[0]
            cut = cuts[debit.index]
            ways, chosen, low_sum = options[debit.index]
            covers = _covered(cut, chosen, low_sum, m)
            found[debit.index] = True
            # With the high side open, its payments (booked from the debit's day
            # to LAG days later) may be the next run's or may not.
            taken = {*covers, debit.index} if ways == 1 else {debit.index}
            pending = [d for d in pending if d.index not in taken]
            low = _Low(debit.day, debit.day + _days(0 if ways == 1 else LAG + 1))
            runs.append(
                Run(
                    account,
                    day,
                    "matched",
                    debit.index,
                    (),
                    _shown(sums, [debit.cents]),
                    len(sums - {0}),
                    covers,
                    settles,
                )
            )
            continue
        status: Status
        if matching:
            status, unresolved = "ambiguous", matching
        elif plausible:
            status, unresolved = "unmatched", plausible
        elif nominal.certain:
            status, unresolved = "missing", []
        else:
            continue  # nothing was due, so no run happened: payments roll over
        for debit in unresolved:
            found[debit.index] = False
        # The cut-off was some day from the run's to LATE days later.
        low = _Low(day, day + _days(LATE + LAG + 1))
        pending = [d for d in pending if d.day >= low.exclude]
        runs.append(
            Run(
                account,
                day,
                status,
                None,
                tuple(d.index for d in unresolved),
                _shown(sums, near),
                len(sums - {0}),
                (),
                settles,
            )
        )
    return found, runs
