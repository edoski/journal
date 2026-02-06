"""Daily note loading helpers for period metrics."""

from __future__ import annotations

import datetime
import os
from collections.abc import Callable, Iterable
from typing import Any

from sync.constants import JOURNAL_DIR

from .aggregation import compute_period_metrics


def load_daily_data_for_dates(
    dates: Iterable[datetime.date],
) -> dict[datetime.date, dict[str, Any]]:
    """Load parsed daily notes for an explicit sequence of dates."""
    # Import here to avoid circular dependency
    from sync.readers.daily import parse_daily_note

    data: dict[datetime.date, dict[str, Any]] = {}
    for day in dates:
        path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
        if not os.path.exists(path):
            continue
        parsed = parse_daily_note(path)
        if parsed:
            data[day] = parsed
    return data


def load_daily_data(
    start_date: datetime.date, end_date: datetime.date
) -> dict[datetime.date, dict[str, Any]]:
    """Load parsed daily notes for a date range."""
    from sync.dates import daterange

    return load_daily_data_for_dates(daterange(start_date, end_date))


def load_prior_period_metrics(
    offsets: Iterable[int],
    period_bounds_for_offset: Callable[[int], tuple[datetime.date, datetime.date]],
) -> list[dict[str, Any]]:
    """
    Load metrics for prior periods using caller-provided period boundaries.

    Args:
        offsets: Sequence of prior-period offsets in desired output order
                 (for example, ``range(4, 0, -1)``).
        period_bounds_for_offset: Callback mapping each offset to an inclusive
                                  ``(start_date, end_date)`` tuple.

    Returns:
        List of metric dicts aligned with ``offsets`` order.
    """
    from sync.dates import daterange

    metrics_list: list[dict[str, Any]] = []
    for offset in offsets:
        start_date, end_date = period_bounds_for_offset(offset)
        dates = list(daterange(start_date, end_date))
        daily_data = load_daily_data_for_dates(dates)
        metrics_list.append(compute_period_metrics(dates, daily_data))
    return metrics_list
