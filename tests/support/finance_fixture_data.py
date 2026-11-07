"""Deterministic bank-data fixtures: the fake sample month of the approved mock."""

from __future__ import annotations

import datetime

from sync.contracts.finance import FinanceBundle, FinanceEntry, FinanceFlow, FinanceRole

_ROLES: dict[str, FinanceRole] = {
    "Income": "income",
    "Investing": "investing",
    "Transfer": "transfer",
}


def entry(
    day: datetime.date,
    flow: FinanceFlow,
    category: str,
    description: str,
    cents: int,
) -> FinanceEntry:
    return FinanceEntry(
        day=day,
        flow=flow,
        category=category,
        role=_ROLES.get(category, "spending"),
        description=description,
        amount_cents=cents,
    )


def _sep(day: int) -> datetime.date:
    return datetime.date(2026, 9, day)


# Fake sample data from research/finance-mock (not real transactions).
MOCK_SEPTEMBER: tuple[FinanceEntry, ...] = (
    entry(_sep(1), "IN", "Income", "Amoreg Limited", 250000),
    entry(_sep(1), "OUT", "Subscriptions", "Iliad", 999),
    entry(_sep(2), "OUT", "Subscriptions", "Claude", 2196),
    entry(_sep(3), "OUT", "Groceries", "Esselunga", 4862),
    entry(_sep(4), "OUT", "Transport", "Trenitalia", 1290),
    entry(_sep(5), "OUT", "Eating out", "Bar Centrale", 450),
    entry(_sep(6), "OUT", "Groceries", "Lidl", 2317),
    entry(_sep(7), "OUT", "Subscriptions", "ChatGPT", 2300),
    entry(_sep(8), "OUT", "Groceries", "Coop", 3640),
    entry(_sep(9), "OUT", "Transport", "Abbonamento mensile TPL", 3500),
    entry(_sep(10), "OUT", "Shopping", "Amazon", 1999),
    entry(_sep(11), "OUT", "Other", "Pagamento carta 11/09", 2780),
    entry(_sep(12), "OUT", "Eating out", "Pizzeria Da Gino", 1850),
    entry(_sep(13), "OUT", "Groceries", "Esselunga", 4105),
    entry(_sep(15), "OUT", "Subscriptions", "Spotify", 1199),
    entry(_sep(16), "OUT", "Taxes", "F24 Agenzia Entrate", 54870),
    entry(_sep(17), "OUT", "Groceries", "Lidl", 2933),
    entry(_sep(18), "IN", "Shopping", "Amazon (refund)", 1999),
    entry(_sep(19), "OUT", "Health", "Farmacia Comunale", 1420),
    entry(_sep(20), "OUT", "Transport", "Italo", 2490),
    entry(_sep(22), "OUT", "Investing", "Scalable Capital (VWCE)", 50000),
    entry(_sep(23), "OUT", "Groceries", "Coop", 3876),
    entry(_sep(24), "OUT", "Subscriptions", "iCloud+", 299),
    entry(_sep(25), "OUT", "Eating out", "Trattoria Il Portico", 3200),
    entry(_sep(26), "OUT", "Other", "Pagamento carta 26/09", 960),
    entry(_sep(27), "OUT", "Groceries", "Esselunga", 5214),
    entry(_sep(28), "OUT", "Eating out", "Bar Centrale", 320),
    entry(_sep(29), "OUT", "Groceries", "Lidl", 2148),
    entry(_sep(30), "OUT", "Transport", "Trenitalia", 1290),
)

# Earlier months chosen so the mock's SUMMARY row comes out: PREVIOUS €1,010
# (August, €1,010.40) and 3-MONTH €1,062/mo (June to August average €1,062.15).
MOCK_PRIOR: tuple[FinanceEntry, ...] = (
    entry(datetime.date(2026, 6, 10), "OUT", "Groceries", "Esselunga", 110000),
    entry(datetime.date(2026, 7, 10), "OUT", "Groceries", "Esselunga", 107605),
    entry(datetime.date(2026, 8, 10), "OUT", "Groceries", "Esselunga", 101040),
    entry(
        datetime.date(2026, 8, 31), "IN", "Transfer", "Giroconto da BancoPosta", 500000
    ),
)

MOCK_BUNDLE = FinanceBundle(
    entries=MOCK_PRIOR + MOCK_SEPTEMBER,
    covered_from=datetime.date(2026, 6, 1),
)


def fixture_bundle_for(start: datetime.date, end: datetime.date) -> FinanceBundle:
    """A deterministic bundle for the render baselines (2020 fixture periods)."""
    entries: list[FinanceEntry] = []
    day = start
    while day <= end:
        index = day.toordinal()
        if day.day == 1:
            entries.append(entry(day, "IN", "Income", "Fixture Client Ltd", 250000))
        if day.day == 16 and day.month % 3 == 0:
            entries.append(entry(day, "OUT", "Taxes", "F24 Agenzia Entrate", 41250))
        if day.day == 5:
            entries.append(entry(day, "OUT", "Investing", "Fixture Broker", 30000))
        if index % 3 == 0:
            entries.append(
                entry(day, "OUT", "Groceries", "Fixture Market", 1500 + index % 900)
            )
        if index % 7 == 0:
            entries.append(
                entry(day, "OUT", "Eating out", "Fixture Bistro", 2200 + index % 500)
            )
        if index % 11 == 0:
            entries.append(
                entry(day, "OUT", "Other", "Card payment | no merchant", 980)
            )
        if day.day == 20:
            entries.append(
                entry(day, "IN", "Groceries", "Fixture Market (refund)", 700)
            )
            entries.append(entry(day, "OUT", "Transfer", "Fixture own account", 10000))
        day += datetime.timedelta(days=1)
    return FinanceBundle(entries=tuple(entries), covered_from=start)
