"""Shared helper routines for period metric builders."""

from __future__ import annotations

import datetime
from typing import Literal

from sync.contracts.metrics import DailyAggregate
from sync.formatting import format_minutes
from sync.writers.tables import SimpleGridTableSpec, render_table


def _day_values(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> DailyAggregate | None:
    return daily_data.get(day)


def study_minutes_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> float | None:
    payload = _day_values(daily_data, day)
    if payload is None:
        return None
    return payload["study_minutes"]


def sleep_minutes_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> float | None:
    payload = _day_values(daily_data, day)
    if payload is None:
        return None
    return payload["sleep_minutes"]


def awake_minutes_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> float | None:
    payload = _day_values(daily_data, day)
    if payload is None:
        return None
    return payload["awake_minutes"]


def _sleep_asleep_time_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> str | None:
    payload = _day_values(daily_data, day)
    if payload is None:
        return None
    return payload["sleep_asleep_time"]


def _sleep_awake_time_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> str | None:
    payload = _day_values(daily_data, day)
    if payload is None:
        return None
    return payload["sleep_awake_time"]


def _time_str_to_minutes(t: str) -> int:
    """Convert 'HH:MM' to minutes since midnight."""
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _minutes_to_time_str(minutes: int) -> str:
    """Convert minutes since midnight to 'HH:MM'."""
    minutes = minutes % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def avg_time_of_day(times: list[str], is_evening: bool) -> str | None:
    """Average a list of 'HH:MM' time-of-day strings.

    For evening times (is_evening=True), treats times ≤ 12:00 as past-midnight
    (offset by +24h) before averaging, so that e.g. 23:30 and 00:30 average
    to 00:00 rather than 12:00.
    """
    if not times:
        return None
    total = 0
    for t in times:
        mins = _time_str_to_minutes(t)
        if is_evening and mins <= 720:  # ≤ 12:00 → past midnight
            mins += 1440
        total += mins
    avg = round(total / len(times))
    return _minutes_to_time_str(avg)


def compute_avg_schedule(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
) -> str | None:
    """Compute average sleep schedule as 'HH:MM - HH:MM' for given dates."""
    asleep_times: list[str] = []
    awake_times: list[str] = []
    for d in dates:
        if not daily_data.get(d):
            continue
        at = _sleep_asleep_time_for_day(daily_data, d)
        wt = _sleep_awake_time_for_day(daily_data, d)
        if at is not None:
            asleep_times.append(at)
        if wt is not None:
            awake_times.append(wt)
    avg_asleep = avg_time_of_day(asleep_times, is_evening=True)
    avg_awake = avg_time_of_day(awake_times, is_evening=False)
    if avg_asleep is not None and avg_awake is not None:
        return f"{avg_asleep} - {avg_awake}"
    return None


def activity_totals_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> dict[str, float]:
    payload = _day_values(daily_data, day)
    if payload is None:
        return {}
    return payload["activity_totals"]


def training_done_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
    key: Literal["workout", "stretch"],
) -> bool:
    payload = _day_values(daily_data, day)
    if payload is None:
        return False
    if key == "workout":
        return payload["workout"]
    return payload["stretch"]


def activity_table_lines(activity_totals: dict[str, float]) -> list[str]:
    positive_activity_totals = {
        activity: mins for activity, mins in activity_totals.items() if mins > 0
    }
    total_activity = sum(positive_activity_totals.values())
    if not positive_activity_totals or total_activity <= 0:
        return []

    rows: list[list[str]] = []
    for activity, mins in sorted(
        positive_activity_totals.items(),
        key=lambda item: item[1],
        reverse=True,
    ):
        share = f"{int(round((mins / total_activity) * 100))}%"
        rows.append([f"**{activity}**", f"`{format_minutes(mins)}`", f"`{share}`"])

    return render_table(
        SimpleGridTableSpec(
            headers=["ACTIVITY", "DURATION", "SHARE"],
            divider_cells=["--------", "----", "-----"],
            rows=rows,
        )
    )


def append_activity_summary(
    lines: list[str],
    activity_totals: dict[str, float],
) -> None:
    """Append canonical study-total summary lines for activity totals."""
    lines.append(
        f"**`SUM: {format_minutes(sum(activity_totals.values()), always_show_both=True)}`**"
    )
    table_lines = activity_table_lines(activity_totals)
    if table_lines:
        lines.append("")
        lines.extend(table_lines)
        lines.append("")


def compute_sleep_aux_averages(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
) -> float | None:
    """Compute average awake minutes for a date range."""
    awake_values = [
        value
        for value in (awake_minutes_for_day(daily_data, day) for day in dates)
        if value is not None
    ]
    avg_awake = sum(awake_values) / len(awake_values) if awake_values else None
    return avg_awake


def sleep_stats_table_lines(
    sleep_avg: float | None,
    avg_awake: float | None,
    avg_schedule: str | None = None,
) -> list[str]:
    if sleep_avg is None:
        return []

    rows = [
        [
            f"`{avg_schedule}`" if avg_schedule else "",
            f"`{format_minutes(sleep_avg)}`" if sleep_avg is not None else "",
            f"`{format_minutes(avg_awake)}`" if avg_awake is not None else "",
        ],
    ]

    return render_table(
        SimpleGridTableSpec(
            headers=["TIME", "ASLEEP", "AWAKE"],
            divider_cells=["----", "------", "-----"],
            rows=rows,
        )
    )
