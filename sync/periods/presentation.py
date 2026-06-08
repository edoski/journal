"""Presentation preparation for period metric sections."""

from __future__ import annotations

import datetime
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from sync.constants import DAYS, MONTH_ABBR, RENDER, STUDY_TARGET_MIN
from sync.contracts.metrics import DailyAggregate
from sync.dates import daterange, format_week_label
from sync.formatting import format_minutes
from sync.writers.charts import (
    MonthlyStudyGridSpec,
    MonthlyTrainingGridSpec,
    QuarterlyStudyCoverageRowsSpec,
    StudyCoverageRow,
    VerticalBarProfile,
    VerticalBarSpec,
    WeeklyStudyGridSpec,
    WeeklyTrainingGridSpec,
    YearlyStudyCoverageRowsSpec,
)


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


def _study_symbol(minutes: float | None) -> str:
    return (
        RENDER.study_symbol_deep
        if (minutes or 0) >= STUDY_TARGET_MIN
        else RENDER.study_symbol_none
    )


def _compress_study_symbols(symbols: list[str], target_width: int) -> str:
    if target_width < 0:
        raise ValueError("target_width must be non-negative")
    if target_width == 0:
        return ""
    total = len(symbols)
    if total == 0:
        return RENDER.study_symbol_none * target_width
    if total + 1 <= target_width:
        return "".join(symbols) + RENDER.study_symbol_none * (target_width - total)
    if total == target_width:
        return "".join(symbols)

    compressed: list[str] = []
    for idx in range(target_width):
        start = (idx * total) // target_width
        end = ((idx + 1) * total + target_width - 1) // target_width
        bucket = symbols[start : min(total, end)]
        compressed.append(
            RENDER.study_symbol_deep
            if RENDER.study_symbol_deep in bucket
            else RENDER.study_symbol_none
        )
    return "".join(compressed)


def _current_bucket_index(
    ranges: Sequence[tuple[datetime.date, datetime.date]],
    current_date: datetime.date | None,
) -> tuple[int, int] | tuple[None, None]:
    if current_date is None:
        return None, None
    for bucket_idx, (start, end) in enumerate(ranges):
        if start <= current_date <= end:
            return bucket_idx, (current_date - start).days
    return None, None


def bucket_average_bar_spec(
    ranges: Sequence[tuple[datetime.date, datetime.date]],
    labels: Sequence[str],
    *,
    today: datetime.date,
    value_for_day: Callable[[datetime.date], float | None],
    chart_value: Callable[[float], float],
    value_label: Callable[[float], str],
    zero_label: str,
    profile: VerticalBarProfile,
    delta_labels: Sequence[str] | None = None,
) -> VerticalBarSpec:
    buckets = period_buckets(ranges, labels)
    chart_values: list[float] = []
    value_labels: list[str] = []

    for (start, _), days in zip(buckets.ranges, buckets.day_lists):
        values = [value for day in days if (value := value_for_day(day)) is not None]
        if values:
            avg_value = sum(values) / len(values)
            chart_values.append(chart_value(avg_value))
            value_labels.append("" if start > today else value_label(avg_value))
        else:
            chart_values.append(0)
            value_labels.append("" if start > today else zero_label)

    return VerticalBarSpec(
        labels=buckets.labels,
        values=chart_values,
        value_labels=value_labels,
        profile=profile,
        delta_labels=delta_labels,
    )


def weekly_study_grid_spec(
    dates: Sequence[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    today: datetime.date,
    current_date: datetime.date | None,
) -> WeeklyStudyGridSpec:
    symbols: list[str] = []
    for day in dates:
        if day > today:
            symbols.append("░░░")
            continue
        payload = daily_data.get(day)
        minutes = payload["study_minutes"] if payload is not None else None
        symbols.append("███" if minutes and minutes >= STUDY_TARGET_MIN else "░░░")

    current_index = None
    date_list = list(dates)
    if (
        current_date is not None
        and date_list
        and date_list[0] <= current_date <= date_list[-1]
    ):
        current_index = (current_date - date_list[0]).days

    return WeeklyStudyGridSpec(
        symbols=symbols,
        done_count=sum(1 for symbol in symbols if symbol == "███"),
        total_count=len(symbols),
        current_index=current_index,
    )


def weekly_training_grid_spec(
    dates: Sequence[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    meditation_count: int,
    workout_count: int,
    stretch_count: int,
    current_date: datetime.date | None,
) -> WeeklyTrainingGridSpec:
    meditation_symbols: list[str] = []
    workout_symbols: list[str] = []
    stretch_symbols: list[str] = []
    for day in dates:
        payload = daily_data.get(day)
        meditation_symbols.append(
            "███" if payload and payload.get("meditate") else "░░░"
        )
        workout_symbols.append("███" if payload and payload.get("workout") else "░░░")
        stretch_symbols.append("███" if payload and payload.get("stretch") else "░░░")

    current_index = None
    date_list = list(dates)
    if (
        current_date is not None
        and date_list
        and date_list[0] <= current_date <= date_list[-1]
    ):
        current_index = (current_date - date_list[0]).days

    return WeeklyTrainingGridSpec(
        meditation_symbols=meditation_symbols,
        workout_symbols=workout_symbols,
        stretch_symbols=stretch_symbols,
        meditation_count=meditation_count,
        workout_count=workout_count,
        stretch_count=stretch_count,
        current_index=current_index,
    )


def monthly_study_grid_spec(
    week_ranges: Sequence[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    today: datetime.date,
    current_date: datetime.date | None,
    delta_labels: Sequence[str] | None = None,
) -> MonthlyStudyGridSpec:
    symbols: list[str] = []
    week_labels: list[str] = []
    week_day_counts: list[int] = []
    total_done = 0
    total_elapsed = 0

    for start, end in week_ranges:
        days = list(daterange(start, end))
        week_day_counts.append(len(days))
        week_labels.append(format_week_label(start, end))
        for day in days:
            if day > today:
                symbols.append(RENDER.study_symbol_none)
                continue
            payload = daily_data.get(day)
            symbol = _study_symbol(
                payload["study_minutes"] if payload is not None else None
            )
            symbols.append(symbol)
            total_elapsed += 1
            if symbol == RENDER.study_symbol_deep:
                total_done += 1

    current_week_idx, current_day_idx = _current_bucket_index(week_ranges, current_date)
    return MonthlyStudyGridSpec(
        week_labels=week_labels,
        week_day_counts=week_day_counts,
        symbols=symbols,
        total_done=total_done,
        total_elapsed=total_elapsed,
        current_week_index=current_week_idx,
        current_day_index=current_day_idx,
        delta_labels=delta_labels,
    )


def monthly_training_grid_spec(
    week_ranges: Sequence[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    current_date: datetime.date | None,
    meditation_delta_labels: Sequence[str] | None = None,
    workout_delta_labels: Sequence[str] | None = None,
    stretch_delta_labels: Sequence[str] | None = None,
) -> MonthlyTrainingGridSpec:
    week_labels: list[str] = []
    week_day_counts: list[int] = []
    meditation_symbols: list[str] = []
    workout_symbols: list[str] = []
    stretch_symbols: list[str] = []

    for start, end in week_ranges:
        days = list(daterange(start, end))
        week_day_counts.append(len(days))
        week_labels.append(format_week_label(start, end))
        for day in days:
            payload = daily_data.get(day)
            meditation_symbols.append(
                "■" if payload and payload.get("meditate") else "·"
            )
            workout_symbols.append("■" if payload and payload.get("workout") else "·")
            stretch_symbols.append("■" if payload and payload.get("stretch") else "·")

    current_week_idx, current_day_idx = _current_bucket_index(week_ranges, current_date)
    return MonthlyTrainingGridSpec(
        week_labels=week_labels,
        week_day_counts=week_day_counts,
        meditation_symbols=meditation_symbols,
        workout_symbols=workout_symbols,
        stretch_symbols=stretch_symbols,
        current_week_index=current_week_idx,
        current_day_index=current_day_idx,
        meditation_delta_labels=meditation_delta_labels,
        workout_delta_labels=workout_delta_labels,
        stretch_delta_labels=stretch_delta_labels,
    )


def quarterly_study_coverage_spec(
    month_ranges: Sequence[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    today: datetime.date,
    delta_labels: Sequence[str] | None = None,
) -> QuarterlyStudyCoverageRowsSpec:
    rows: list[StudyCoverageRow] = []
    total_done = 0
    total_elapsed = 0
    deltas = list(delta_labels or [])

    for idx, (start, end) in enumerate(month_ranges):
        bar_chars: list[str] = []
        done = 0
        elapsed = 0
        for day in daterange(start, end):
            if day > today:
                bar_chars.append(RENDER.study_symbol_none)
                continue
            payload = daily_data.get(day)
            symbol = _study_symbol(
                payload["study_minutes"] if payload is not None else None
            )
            bar_chars.append(symbol)
            if symbol != RENDER.study_symbol_none:
                done += 1
            elapsed += 1
        total_done += done
        total_elapsed += elapsed
        rows.append(
            StudyCoverageRow(
                label=MONTH_ABBR[start.month - 1],
                bar="".join(bar_chars),
                done=done,
                elapsed=elapsed,
                delta_label=deltas[idx] if idx < len(deltas) else "",
            )
        )

    return QuarterlyStudyCoverageRowsSpec(
        rows=rows,
        total_done=total_done,
        total_elapsed=total_elapsed,
    )


def yearly_study_coverage_spec(
    quarter_ranges: Sequence[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    today: datetime.date,
    bar_width: int,
    delta_labels: Sequence[str] | None = None,
    bars_override: Sequence[str] | None = None,
    legend_line: str | None = None,
) -> YearlyStudyCoverageRowsSpec:
    rows: list[StudyCoverageRow] = []
    total_done = 0
    total_elapsed = 0
    deltas = list(delta_labels or [])
    overrides = list(bars_override) if bars_override is not None else None

    for idx, (start, end) in enumerate(quarter_ranges):
        days = list(daterange(start, end))
        if overrides is not None:
            bar = overrides[idx]
            elapsed = sum(1 for day in days if day <= today)
            done = sum(
                1
                for day in days
                if day <= today
                and _study_symbol(
                    daily_data[day]["study_minutes"] if day in daily_data else None
                )
                == RENDER.study_symbol_deep
            )
        else:
            observed_days = [day for day in days if day <= today]
            future_days = len(days) - len(observed_days)
            bar_chars: list[str] = []
            done = 0
            elapsed = len(observed_days)
            for day in observed_days:
                payload = daily_data.get(day)
                symbol = _study_symbol(
                    payload["study_minutes"] if payload is not None else None
                )
                bar_chars.append(symbol)
                if symbol != RENDER.study_symbol_none:
                    done += 1
            bar_chars.extend([RENDER.study_symbol_none] * future_days)
            bar = _compress_study_symbols(bar_chars, bar_width)

        total_done += done
        total_elapsed += elapsed
        rows.append(
            StudyCoverageRow(
                label=f"Q{idx + 1}",
                bar=bar,
                done=done,
                elapsed=elapsed,
                delta_label=deltas[idx] if idx < len(deltas) else "",
            )
        )

    return YearlyStudyCoverageRowsSpec(
        rows=rows,
        total_done=total_done,
        total_elapsed=total_elapsed,
        legend_line=legend_line,
    )


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
