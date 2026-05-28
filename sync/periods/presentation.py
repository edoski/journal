"""Presentation preparation for period metric sections."""

from __future__ import annotations

import datetime
from collections.abc import Sequence
from dataclasses import dataclass

from sync.constants import DAYS
from sync.contracts.metrics import DailyAggregate
from sync.dates import daterange
from sync.formatting import format_minutes


@dataclass(frozen=True)
class PeriodBuckets:
    """Prepared date buckets for period chart and table sections."""

    ranges: Sequence[tuple[datetime.date, datetime.date]]
    labels: Sequence[str]
    day_lists: list[list[datetime.date]]


def period_buckets(
    ranges: Sequence[tuple[datetime.date, datetime.date]],
    labels: Sequence[str],
) -> PeriodBuckets:
    """Build reusable day lists for labeled period buckets."""
    return PeriodBuckets(
        ranges=ranges,
        labels=labels,
        day_lists=[list(daterange(start, end)) for start, end in ranges],
    )


def _screen_minutes_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> float:
    payload = daily_data.get(day)
    if payload is None:
        return 0.0
    return sum(payload["screen_time_totals"].values())


def _duration_cell(minutes: float, *, is_future: bool, include_plus: bool) -> str:
    if is_future:
        return "—"
    if minutes <= 0:
        return "`0m`"
    prefix = "+" if include_plus else ""
    return f"`{prefix}{format_minutes(minutes)}`"


def _total_row(total_minutes: float) -> list[str]:
    total_str = f"`{format_minutes(total_minutes)}`" if total_minutes else "`0m`"
    return ["**TOTAL**", f"**{total_str}**"]


def daily_screen_trend_rows(
    dates: Sequence[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    today: datetime.date,
    period_label: str,
) -> list[list[str]]:
    """Prepare daily screen-time trend rows for rendering."""
    rows: list[list[str]] = []
    total_minutes = 0.0
    for idx, day in enumerate(dates):
        day_name = (
            DAYS[idx]
            if period_label == "DAY" and idx < len(DAYS)
            else day.strftime("%a").upper()
        )
        minutes = _screen_minutes_for_day(daily_data, day)
        if day <= today:
            total_minutes += minutes
        rows.append(
            [
                f"**[[{day.isoformat()}\\|{day_name}]]**",
                _duration_cell(minutes, is_future=day > today, include_plus=True),
            ]
        )
    rows.append(_total_row(total_minutes))
    return rows


def period_screen_trend_rows(
    ranges: Sequence[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    today: datetime.date,
    labels: Sequence[str],
    wikilinks: Sequence[str],
    fallback_prefix: str,
) -> list[list[str]]:
    """Prepare bucketed screen-time trend rows for rendering."""
    rows: list[list[str]] = []
    total_minutes = 0.0
    for idx, (start, end) in enumerate(ranges):
        if idx < len(wikilinks):
            display_label = wikilinks[idx]
        elif idx < len(labels):
            display_label = labels[idx]
        else:
            display_label = f"{fallback_prefix}{idx + 1}"

        minutes = sum(
            _screen_minutes_for_day(daily_data, day) for day in daterange(start, end)
        )
        if start <= today:
            total_minutes += minutes
        rows.append(
            [
                f"**{display_label}**",
                _duration_cell(minutes, is_future=start > today, include_plus=True),
            ]
        )
    rows.append(_total_row(total_minutes))
    return rows
