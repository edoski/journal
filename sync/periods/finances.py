"""FINANCES section, SPENT summary row and the monthly transactions notes.

Money rules, for every period type:

- INCOME is the net of entries in the Income category (money in minus out).
- Each spending category's amount is its net: money out minus money in, so a
  refund (money in that a rule put in that category) reduces its category.
- INVESTED is the net of the Investing category; Transfer entries (between
  own accounts) are left out of every amount but listed in the transactions
  note.
- LEFT = INCOME - spending - INVESTED. SPENT is the spending total.
- Money in that no rule matched (category Other) is counted as INCOME, not as
  a refund; it still shows as Other in the transactions note.
- SPENT is the spending total, never below €0.
- A period counts as known only when the bank data covers it from its first day;
  an opening day set with `finance opened` also completes the period containing
  it (no transactions before it). Otherwise SPENT shows "—" and the period stays
  out of the averages.
"""

from __future__ import annotations

import datetime
from collections.abc import Sequence
from dataclasses import dataclass

from sync.constants import FINANCES_SECTION_HEADER, MONTH_ABBR
from sync.contracts.finance import (
    UNMATCHED_CATEGORY,
    FinanceBundle,
    FinanceEntry,
    SpentSummary,
)
from sync.dates import month_range
from sync.formatting import format_eur, round_half_up
from sync.notes.markdown_tables import plain_text_cell
from sync.writers.charts import WaterfallSpec, WaterfallStep, render_chart
from sync.writers.tables import SimpleGridTableSpec, render_table

TRANSACTIONS_DIR = "transactions"


@dataclass(frozen=True)
class PeriodFlows:
    """Money in a period by role; categories are spending nets, largest first."""

    income_cents: int
    categories: tuple[tuple[str, int], ...]
    invested_cents: int

    @property
    def spending_net_cents(self) -> int:
        return sum(amount for _, amount in self.categories)

    @property
    def spent_cents(self) -> int:
        """SPENT: the spending total, never negative."""
        return max(0, self.spending_net_cents)

    @property
    def left_cents(self) -> int:
        return self.income_cents - self.spending_net_cents - self.invested_cents


def _signed(entry: FinanceEntry) -> int:
    """Positive for money in."""
    return entry.amount_cents if entry.flow == "IN" else -entry.amount_cents


def entries_between(
    bundle: FinanceBundle, start: datetime.date, end: datetime.date
) -> list[FinanceEntry]:
    return [entry for entry in bundle.entries if start <= entry.day <= end]


def period_flows(entries: Sequence[FinanceEntry]) -> PeriodFlows:
    income = invested = 0
    spending: dict[str, int] = {}
    for entry in entries:
        unmatched_in = entry.category == UNMATCHED_CATEGORY and entry.flow == "IN"
        if entry.role == "income" or (entry.role == "spending" and unmatched_in):
            income += _signed(entry)
        elif entry.role == "investing":
            invested -= _signed(entry)
        elif entry.role == "spending":
            spending[entry.category] = spending.get(entry.category, 0) - _signed(entry)
    categories = tuple(
        sorted(
            ((name, amount) for name, amount in spending.items() if amount != 0),
            key=lambda item: (-item[1], item[0]),
        )
    )
    return PeriodFlows(income, categories, invested)


def _known(bundle: FinanceBundle, start: datetime.date, end: datetime.date) -> bool:
    """Known when the bank data covers the whole period from its first day. An
    opening day set with `finance opened` also completes the one period that
    contains it (no transactions before it); periods that end earlier stay unknown."""
    if bundle.covered_from is None:
        return False
    if bundle.covered_from <= start:
        return True
    opened = bundle.zero_before
    return (
        opened is not None and start <= opened <= end and bundle.covered_from <= opened
    )


def _spent(
    bundle: FinanceBundle, start: datetime.date, end: datetime.date
) -> int | None:
    if not _known(bundle, start, end):
        return None
    return period_flows(entries_between(bundle, start, end)).spent_cents


def spent_summary(
    bundle: FinanceBundle,
    *,
    current: tuple[datetime.date, datetime.date],
    previous: tuple[datetime.date, datetime.date],
    prior: Sequence[tuple[datetime.date, datetime.date]],
    unit: str,
) -> SpentSummary:
    """The SPENT row: this period, the one before, and the mean of `prior`."""
    known = [
        value
        for start, end in prior
        if (value := _spent(bundle, start, end)) is not None
    ]
    average = round_half_up(sum(known) / len(known)) if known else None
    return SpentSummary(
        current_cents=_spent(bundle, *current),
        previous_cents=_spent(bundle, *previous),
        average_cents=average,
        average_unit=unit,
    )


def waterfall_spec(flows: PeriodFlows) -> WaterfallSpec:
    steps = [WaterfallStep(name.upper(), -amount) for name, amount in flows.categories]
    if flows.invested_cents:
        steps.append(WaterfallStep("INVESTED", -flows.invested_cents))
    return WaterfallSpec(
        start_label="INCOME",
        start_cents=flows.income_cents,
        steps=steps,
        end_label="LEFT",
    )


def category_table_lines(flows: PeriodFlows) -> list[str]:
    positive = [(name, amount) for name, amount in flows.categories if amount > 0]
    total = sum(amount for _, amount in positive)
    if not positive:
        return []
    rows = [
        [
            f"**{plain_text_cell(name)}**",
            f"`{format_eur(amount)}`",
            f"`{int(round(amount / total * 100))}%`",
        ]
        for name, amount in positive
    ]
    return render_table(
        SimpleGridTableSpec(
            headers=["CATEGORY", "AMOUNT", "SHARE"],
            divider_cells=["--------", "------", "-----"],
            rows=rows,
        )
    )


def transactions_note_name(year: int, month: int) -> str:
    return f"{year}-{month:02d} transactions"


def _count_text(count: int) -> str:
    return f"{count} transaction{'' if count == 1 else 's'} →"


def transactions_link(year: int, month: int, count: int, *, named: bool) -> str:
    """`**[[YYYY-MM transactions|N transactions →]]**`, prefixed by the month when named."""
    text = _count_text(count)
    if named:
        text = f"{MONTH_ABBR[month - 1]}: {text}"
    return f"**[[{transactions_note_name(year, month)}|{text}]]**"


def months_between(start: datetime.date, end: datetime.date) -> list[tuple[int, int]]:
    months: list[tuple[int, int]] = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        months.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def month_entries(bundle: FinanceBundle, year: int, month: int) -> list[FinanceEntry]:
    return entries_between(bundle, *month_range(year, month))


def linked_months(
    bundle: FinanceBundle, start: datetime.date, end: datetime.date
) -> list[tuple[int, int, int]]:
    """(year, month, month's entry count) for months in the range with entries."""
    found = []
    for year, month in months_between(start, end):
        count = len(month_entries(bundle, year, month))
        if count:
            found.append((year, month, count))
    return found


def finances_section(
    bundle: FinanceBundle,
    start: datetime.date,
    end: datetime.date,
    *,
    waterfall: bool,
    named_links: bool,
) -> list[str]:
    """The FINANCES section for a period, or nothing when it has no entries."""
    if bundle.error is not None:
        reason = " ".join(bundle.error.split()).replace("`", "'")
        return [FINANCES_SECTION_HEADER, f"`finance data unreadable: {reason}`"]
    entries = entries_between(bundle, start, end)
    if not entries:
        return []
    flows = period_flows(entries)
    lines = [FINANCES_SECTION_HEADER]
    chart = render_chart(waterfall_spec(flows)) if waterfall else []
    table = category_table_lines(flows)
    # A chart follows its header directly, as STUDY's does; a table after a blank.
    lines.extend(chart or [""])
    lines.extend(table)
    links = [
        transactions_link(year, month, count, named=named_links)
        for year, month, count in linked_months(bundle, start, end)
    ]
    if chart or table:
        lines.append("")
    lines.extend(links)
    return lines


def _row_order(entry: FinanceEntry) -> tuple[datetime.date, int, str, int, str]:
    return (
        entry.day,
        0 if entry.flow == "IN" else 1,
        entry.description.casefold(),
        entry.amount_cents,
        entry.category,
    )


def transactions_note_lines(
    year: int, month: int, entries: Sequence[FinanceEntry]
) -> list[str]:
    """The month's transactions note: a back link, then every entry by date."""
    rows = [
        [
            f"**{entry.flow}**",
            plain_text_cell(entry.category),
            plain_text_cell(entry.description),
            f"`{format_eur(entry.amount_cents)}`",
            f"`{entry.day:%Y-%m-%d}`",
        ]
        for entry in sorted(entries, key=_row_order)
    ]
    return [
        f"Month: [[{year}-{month:02d}]]",
        "",
        *render_table(
            SimpleGridTableSpec(
                headers=["TYPE", "CATEGORY", "DESCRIPTION", "AMOUNT", "DATE"],
                divider_cells=["----", "--------", "-----------", "------", "----"],
                rows=rows,
            )
        ),
    ]
