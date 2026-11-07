"""Typed contracts for bank data in period notes."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Literal

FinanceFlow = Literal["IN", "OUT"]
FinanceRole = Literal["income", "spending", "investing", "transfer", "gift"]
# The category of money no rule matched (finance's rules use the same name).
UNMATCHED_CATEGORY = "Other"


@dataclass(frozen=True)
class FinanceEntry:
    """One categorised booked transaction, amount in positive euro cents."""

    day: datetime.date
    flow: FinanceFlow
    category: str
    role: FinanceRole
    description: str
    amount_cents: int


@dataclass(frozen=True)
class FinanceBundle:
    """Entries for a date window and the first day the bank data covers."""

    entries: tuple[FinanceEntry, ...]
    covered_from: datetime.date | None
    # Set when bank data exists but could not be read: the notes show the reason.
    error: str | None = None
    # The account's opening day (`finance opened`): no transactions before it.
    zero_before: datetime.date | None = None


@dataclass(frozen=True)
class SpentSummary:
    """The SUMMARY table's SPENT row in cents; None where no data covers it."""

    current_cents: int | None
    previous_cents: int | None
    average_cents: int | None
    average_unit: str
