"""FINANCES section, SPENT row and transactions notes against the approved mock."""

from __future__ import annotations

import datetime

from sync.contracts.finance import FinanceBundle
from sync.periods.builders import build_monthly_metrics
from sync.periods.finances import (
    finances_section,
    period_flows,
    spent_summary,
    transactions_note_lines,
)
from sync.periods.windows import build_month_window, build_week_window
from sync.writers.tables import SummaryMetricsTableSpec, render_table
from sync.contracts.media import MediaBundle
from sync.metrics import compute_period_metrics, compute_moving_average
from sync.dates import daterange

from tests.support.finance_fixture_data import (
    MOCK_BUNDLE,
    MOCK_SEPTEMBER,
    entry,
)

SEP_START = datetime.date(2026, 9, 1)
SEP_END = datetime.date(2026, 9, 30)

# finances_mock_v3.md, the approved layout (fake sample data).
MOCK_V3_SECTION = """### **FINANCES**
```
INCOME        │████████████████████████████████████████│ +€2,500
TAXES         │                               ▒▒▒▒▒▒▒▒▒│   -€549
GROCERIES     │                           ▒▒▒▒         │   -€291
TRANSPORT     │                         ▒▒             │    -€86
SUBSCRIPTIONS │                        ▒               │    -€70
EATING OUT    │                       ▒                │    -€58
OTHER         │                      ▒                 │    -€37
HEALTH        │                     ▒                  │    -€14
INVESTED      │              ▒▒▒▒▒▒▒                   │   -€500
LEFT          │██████████████                          │   =€895
              └────────────────────────────────────────┘
               €0                                €2,500
```
| CATEGORY | AMOUNT | SHARE |
| -------- | ------ | ----- |
| **Taxes** | `€548.70` | `50%` |
| **Groceries** | `€290.95` | `26%` |
| **Transport** | `€85.70` | `8%` |
| **Subscriptions** | `€69.93` | `6%` |
| **Eating out** | `€58.20` | `5%` |
| **Other** | `€37.40` | `3%` |
| **Health** | `€14.20` | `1%` |

**[[2026-09 transactions|29 transactions →]]**""".splitlines()

MOCK_SPENT_ROW = "| **SPENT** | `€1,105` | `€1,010` | `€1,062/mo` |"

# transactions_mock_2026-09.md without its HTML comment.
MOCK_TRANSACTIONS_NOTE = """Month: [[2026-09]]

| TYPE | CATEGORY | DESCRIPTION | AMOUNT | DATE |
| ---- | -------- | ----------- | ------ | ---- |
| **IN** | Income | Amoreg Limited | `€2,500.00` | `2026-09-01` |
| **OUT** | Subscriptions | Iliad | `€9.99` | `2026-09-01` |
| **OUT** | Subscriptions | Claude | `€21.96` | `2026-09-02` |
| **OUT** | Groceries | Esselunga | `€48.62` | `2026-09-03` |
| **OUT** | Transport | Trenitalia | `€12.90` | `2026-09-04` |
| **OUT** | Eating out | Bar Centrale | `€4.50` | `2026-09-05` |
| **OUT** | Groceries | Lidl | `€23.17` | `2026-09-06` |
| **OUT** | Subscriptions | ChatGPT | `€23.00` | `2026-09-07` |
| **OUT** | Groceries | Coop | `€36.40` | `2026-09-08` |
| **OUT** | Transport | Abbonamento mensile TPL | `€35.00` | `2026-09-09` |
| **OUT** | Shopping | Amazon | `€19.99` | `2026-09-10` |
| **OUT** | Other | Pagamento carta 11/09 | `€27.80` | `2026-09-11` |
| **OUT** | Eating out | Pizzeria Da Gino | `€18.50` | `2026-09-12` |
| **OUT** | Groceries | Esselunga | `€41.05` | `2026-09-13` |
| **OUT** | Subscriptions | Spotify | `€11.99` | `2026-09-15` |
| **OUT** | Taxes | F24 Agenzia Entrate | `€548.70` | `2026-09-16` |
| **OUT** | Groceries | Lidl | `€29.33` | `2026-09-17` |
| **IN** | Shopping | Amazon (refund) | `€19.99` | `2026-09-18` |
| **OUT** | Health | Farmacia Comunale | `€14.20` | `2026-09-19` |
| **OUT** | Transport | Italo | `€24.90` | `2026-09-20` |
| **OUT** | Investing | Scalable Capital (VWCE) | `€500.00` | `2026-09-22` |
| **OUT** | Groceries | Coop | `€38.76` | `2026-09-23` |
| **OUT** | Subscriptions | iCloud+ | `€2.99` | `2026-09-24` |
| **OUT** | Eating out | Trattoria Il Portico | `€32.00` | `2026-09-25` |
| **OUT** | Other | Pagamento carta 26/09 | `€9.60` | `2026-09-26` |
| **OUT** | Groceries | Esselunga | `€52.14` | `2026-09-27` |
| **OUT** | Eating out | Bar Centrale | `€3.20` | `2026-09-28` |
| **OUT** | Groceries | Lidl | `€21.48` | `2026-09-29` |
| **OUT** | Transport | Trenitalia | `€12.90` | `2026-09-30` |""".splitlines()


def test_monthly_section_matches_the_approved_mock() -> None:
    section = finances_section(
        MOCK_BUNDLE, SEP_START, SEP_END, waterfall=True, named_links=False
    )
    assert section == MOCK_V3_SECTION


def test_monthly_note_places_finances_after_sleep_and_spent_in_summary() -> None:
    window = build_month_window(SEP_END)
    prior = [
        compute_period_metrics(list(daterange(*window.prior_bounds(n))), {})
        for n in (3, 2, 1)
    ]
    lines = build_monthly_metrics(
        window,
        {},
        {},
        MediaBundle(items=()),
        prior_month_metrics=prior,
        finance=MOCK_BUNDLE,
    )
    assert MOCK_SPENT_ROW in lines
    assert (
        lines.index(MOCK_SPENT_ROW)
        == lines.index("| **STRETCH** | `00/30` | `00/31` | `0.0/mo` |") + 1
    )
    headers = [line for line in lines if line.startswith("### ")]
    assert headers == [
        "### **SUMMARY**",
        "### **STUDY**",
        "### **TRAINING**",
        "### **SLEEP**",
        "### **FINANCES**",
    ]
    start = lines.index("### **FINANCES**")
    assert lines[start : start + len(MOCK_V3_SECTION)] == MOCK_V3_SECTION


def test_transactions_note_matches_the_mock() -> None:
    assert transactions_note_lines(2026, 9, MOCK_SEPTEMBER) == MOCK_TRANSACTIONS_NOTE


def test_refunds_reduce_their_category_and_transfers_count_nowhere() -> None:
    day = datetime.date(2026, 10, 2)
    flows = period_flows(
        [
            entry(day, "IN", "Income", "Client", 100000),
            entry(day, "OUT", "Shopping", "Shop", 5000),
            entry(day, "IN", "Shopping", "Shop refund", 2000),
            entry(day, "IN", "Other", "Unmatched payment in", 1500),
            entry(day, "OUT", "Other", "Card payment", 1000),
            entry(day, "IN", "Transfer", "From own account", 600000),
            entry(day, "OUT", "Transfer", "To own account", 300000),
            entry(day, "OUT", "Investing", "Broker", 20000),
            entry(day, "IN", "Investing", "Broker sale", 5000),
        ]
    )
    assert flows.income_cents == 101500  # the unmatched €15 in is INCOME
    assert flows.categories == (("Shopping", 3000), ("Other", 1000))
    assert flows.invested_cents == 15000
    assert flows.spent_cents == 4000
    assert flows.left_cents == 101500 - 4000 - 15000


def test_spent_is_unknown_before_the_data_starts_and_averages_known_periods() -> None:
    bundle = FinanceBundle(
        entries=(
            entry(datetime.date(2026, 10, 20), "OUT", "Groceries", "Coop", 12345),
        ),
        covered_from=datetime.date(2026, 10, 14),
    )
    window = build_month_window(datetime.date(2026, 11, 15))
    summary = spent_summary(
        bundle,
        current=(window.start, window.end),
        previous=(window.previous_start, window.previous_end),
        prior=[window.prior_bounds(n) for n in (3, 2, 1)],
        unit="mo",
    )
    # October is covered only from the 14th: unknown, and out of the average.
    assert (summary.current_cents, summary.previous_cents, summary.average_cents) == (
        0,
        None,
        None,
    )
    september = spent_summary(
        bundle,
        current=(SEP_START, SEP_END),
        previous=(datetime.date(2026, 8, 1), datetime.date(2026, 8, 31)),
        prior=[(datetime.date(2026, 8, 1), datetime.date(2026, 8, 31))],
        unit="mo",
    )
    assert (
        september.current_cents,
        september.previous_cents,
        september.average_cents,
    ) == (
        None,
        None,
        None,
    )


def test_spent_row_shows_dashes_and_follows_the_column_layout() -> None:
    metrics = compute_period_metrics([SEP_START], {})
    ma = compute_moving_average([metrics, metrics, metrics], 3)
    from sync.contracts.finance import SpentSummary

    with_ma = render_table(
        SummaryMetricsTableSpec(
            current_metrics=metrics,
            previous_metrics=metrics,
            current_label="CURRENT",
            previous_label="PREVIOUS",
            ma_metrics=ma,
            ma_label="4-WEEK",
            ma_training_unit="7",
            spent=SpentSummary(110508, None, None, "wk"),
        )
    )
    assert "| **SPENT** | `€1,105` | `—` | `—` |" in with_ma
    without_ma = render_table(
        SummaryMetricsTableSpec(
            current_metrics=metrics,
            previous_metrics=metrics,
            current_label="CURRENT",
            previous_label="PREVIOUS",
            spent=SpentSummary(-250, 4950, 1, "wk"),
        )
    )
    assert "| **SPENT** | `€-3` | `€50` |" not in without_ma
    assert "| **SPENT** | `-€3` | `€50` |" in without_ma


def test_weekly_section_has_the_table_and_a_link_per_month_touched() -> None:
    window = build_week_window(datetime.date(2026, 9, 30))
    bundle = FinanceBundle(
        entries=MOCK_SEPTEMBER
        + (entry(datetime.date(2026, 10, 2), "OUT", "Groceries", "Coop", 1000),),
        covered_from=SEP_START,
    )
    section = finances_section(
        bundle, window.start, window.end, waterfall=False, named_links=True
    )
    assert section == [
        "### **FINANCES**",
        "",
        "| CATEGORY | AMOUNT | SHARE |",
        "| -------- | ------ | ----- |",
        "| **Groceries** | `€31.48` | `66%` |",
        "| **Transport** | `€12.90` | `27%` |",
        "| **Eating out** | `€3.20` | `7%` |",
        "",
        "**[[2026-09 transactions|SEP: 29 transactions →]]**",
        "**[[2026-10 transactions|OCT: 1 transaction →]]**",
    ]


def test_a_period_without_entries_has_no_section() -> None:
    assert (
        finances_section(
            MOCK_BUNDLE,
            datetime.date(2026, 5, 1),
            datetime.date(2026, 5, 31),
            waterfall=True,
            named_links=False,
        )
        == []
    )


def test_a_period_with_only_transfers_has_just_the_link() -> None:
    day = datetime.date(2026, 10, 15)
    bundle = FinanceBundle(
        entries=(entry(day, "IN", "Transfer", "Giroconto", 550000),),
        covered_from=day,
    )
    section = finances_section(
        bundle,
        datetime.date(2026, 10, 1),
        datetime.date(2026, 10, 31),
        waterfall=True,
        named_links=False,
    )
    assert section == [
        "### **FINANCES**",
        "",
        "**[[2026-10 transactions|1 transaction →]]**",
    ]


def test_bank_text_is_escaped_in_the_transactions_note() -> None:
    day = datetime.date(2026, 10, 15)
    lines = transactions_note_lines(
        2026,
        10,
        [entry(day, "OUT", "Other", "PAG. *POS* | [[x]]\n#1", 120)],
    )
    assert (
        lines[-1]
        == "| **OUT** | Other | PAG. \\*POS\\* \\| \\[\\[x\\]\\] \\#1 | `€1.20` | `2026-10-15` |"
    )


# Review round 1 -----------------------------------------------------------------------


def test_unmatched_money_in_is_income_not_negative_spending() -> None:
    day = datetime.date(2026, 10, 2)
    base = [entry(day, "OUT", "Groceries", "Coop", 30000)]
    with_payment = base + [entry(day, "IN", "Other", "NEW CLIENT SRL", 250000)]
    before, after = period_flows(base), period_flows(with_payment)
    assert after.spent_cents == before.spent_cents == 30000
    assert after.income_cents == before.income_cents + 250000
    assert after.categories == before.categories


def test_spent_never_goes_below_zero_after_a_large_refund() -> None:
    day = datetime.date(2026, 10, 2)
    flows = period_flows(
        [
            entry(day, "OUT", "Shopping", "Shop", 2000),
            entry(day, "IN", "Shopping", "Shop refund of September", 9000),
        ]
    )
    assert flows.categories == (("Shopping", -7000),)
    assert flows.spent_cents == 0
    assert flows.left_cents == 7000


def test_a_partly_covered_period_is_unknown_and_stays_out_of_averages() -> None:
    bundle = FinanceBundle(
        entries=(
            entry(datetime.date(2026, 7, 20), "OUT", "Groceries", "Coop", 99900),
            entry(datetime.date(2026, 8, 5), "OUT", "Groceries", "Coop", 10000),
            entry(datetime.date(2026, 9, 5), "OUT", "Groceries", "Coop", 20000),
        ),
        covered_from=datetime.date(2026, 7, 14),
    )
    july = spent_summary(
        bundle,
        current=(datetime.date(2026, 7, 1), datetime.date(2026, 7, 31)),
        previous=(datetime.date(2026, 6, 1), datetime.date(2026, 6, 30)),
        prior=[],
        unit="mo",
    )
    assert july.current_cents is None
    window = build_month_window(datetime.date(2026, 10, 31))
    october = spent_summary(
        bundle,
        current=(window.start, window.end),
        previous=(window.previous_start, window.previous_end),
        prior=[window.prior_bounds(n) for n in (3, 2, 1)],  # July, August, September
        unit="mo",
    )
    assert october.previous_cents == 20000
    assert october.average_cents == 15000  # August and September only


def test_unreadable_finance_shows_one_line() -> None:
    bundle = FinanceBundle(
        entries=(), covered_from=None, error="categories.toml: rule 1 `x`\nbad"
    )
    assert finances_section(
        bundle, SEP_START, SEP_END, waterfall=True, named_links=False
    ) == [
        "### **FINANCES**",
        "`finance data unreadable: categories.toml: rule 1 'x' bad`",
    ]


# Review round 2 -----------------------------------------------------------------------


def test_an_opening_day_makes_the_first_month_week_and_year_known() -> None:
    from sync.periods.windows import build_year_window

    spending = (entry(datetime.date(2026, 10, 15), "OUT", "Groceries", "Coop", 4200),)
    plain = FinanceBundle(entries=spending, covered_from=datetime.date(2026, 10, 15))
    opened = FinanceBundle(
        entries=spending,
        covered_from=datetime.date(2026, 10, 14),
        zero_before=datetime.date(2026, 10, 14),
    )
    month = build_month_window(datetime.date(2026, 10, 31))
    week = build_week_window(datetime.date(2026, 10, 15))  # W42, 12-18 Oct
    year = build_year_window(2026, target_date=datetime.date(2026, 12, 31))
    for window, prior in ((month, (3, 2, 1)), (week, (4, 3, 2, 1)), (year, (3, 2, 1))):
        bounds = {
            "current": (window.start, window.end),
            "previous": (window.previous_start, window.previous_end),
            "prior": [window.prior_bounds(n) for n in prior],
            "unit": "mo",
        }
        assert spent_summary(plain, **bounds).current_cents is None  # type: ignore[arg-type]
        known = spent_summary(opened, **bounds)  # type: ignore[arg-type]
        assert known.current_cents == 4200
        # the period before ends before the opening day: still unknown (round 3)
        assert (known.previous_cents, known.average_cents) == (None, None)


# Review round 3 -----------------------------------------------------------------------


def test_the_opening_day_completes_only_its_own_period() -> None:
    from sync.periods.windows import build_year_window

    opened = FinanceBundle(
        entries=(
            entry(datetime.date(2026, 10, 15), "OUT", "Groceries", "Coop", 4200),
            entry(datetime.date(2026, 11, 3), "OUT", "Groceries", "Coop", 1000),
        ),
        covered_from=datetime.date(2026, 10, 14),
        zero_before=datetime.date(2026, 10, 14),
    )

    def month(day: datetime.date):  # type: ignore[no-untyped-def]
        window = build_month_window(day)
        return spent_summary(
            opened,
            current=(window.start, window.end),
            previous=(window.previous_start, window.previous_end),
            prior=[window.prior_bounds(n) for n in (3, 2, 1)],
            unit="mo",
        )

    september = month(datetime.date(2026, 9, 30))
    october = month(datetime.date(2026, 10, 31))
    november = month(datetime.date(2026, 11, 30))
    assert september.current_cents is None
    assert october.current_cents == 4200
    assert (november.current_cents, november.previous_cents) == (1000, 4200)
    assert november.average_cents == 4200  # August and September unknown: October only

    def year(number: int) -> int | None:
        window = build_year_window(number, target_date=datetime.date(number, 12, 31))
        return spent_summary(
            opened,
            current=(window.start, window.end),
            previous=(window.previous_start, window.previous_end),
            prior=[window.prior_bounds(n) for n in (3, 2, 1)],
            unit="yr",
        ).current_cents

    assert year(2025) is None
    assert year(2026) == 5200
