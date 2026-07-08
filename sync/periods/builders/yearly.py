"""Yearly period metrics builder."""

from __future__ import annotations

import datetime

from sync.constants import MONTH_ABBR
from sync.contracts.media import MediaBundle
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.dates import daterange, month_range, year_range
from sync.metrics import (
    aggregate_activity_totals,
    compute_bucket_deltas,
    compute_moving_average,
    compute_period_metrics,
)
from sync.notes.sections import join_sections, trim_blank_lines
from sync.periods.builders.common import (
    activity_totals_for_day,
    append_activity_summary,
    compute_avg_schedule,
    compute_sleep_aux_averages,
    sleep_minutes_for_day,
    sleep_stats_table_lines,
    study_minutes_for_day,
    training_done_for_day,
)
from sync.periods.sections import (
    append_media_section,
    append_summary_section,
    append_training_type_table,
)
from sync.periods.presentation import (
    bucket_average_bar_spec,
)
from sync.writers.charts import (
    TIME_LABEL_STANDARD,
    TrainingCalendarColumn,
    TrainingCalendarColumnsSpec,
    TrainingCalendarMonth,
    TrainingCalendarQuarter,
    VerticalBarSpec,
    YEARLY_4QTR_METRIC,
    YEARLY_4QTR_STUDY,
    render_chart,
)

YEARLY_TRAINING_MONTH_WIDTH = 31


def _quarter_month_ranges(
    quarter_start: datetime.date,
    quarter_end: datetime.date,
) -> list[tuple[datetime.date, datetime.date]]:
    return [
        month_range(quarter_start.year, month)
        for month in range(quarter_start.month, quarter_end.month + 1)
    ]


def _training_calendar_month(
    start: datetime.date,
    end: datetime.date,
    daily_data: dict[datetime.date, DailyAggregate],
    *,
    today: datetime.date,
    bucket: str,
) -> TrainingCalendarMonth:
    symbols: list[str] = []
    done = 0
    elapsed = 0

    for day in daterange(start, end):
        if day > today:
            symbols.append(" ")
            continue
        elapsed += 1
        if training_done_for_day(daily_data, day, bucket):
            done += 1
            symbols.append("█")
        else:
            symbols.append("·")

    return TrainingCalendarMonth(
        label=MONTH_ABBR[start.month - 1],
        symbols="".join(symbols),
        done=done,
        elapsed=elapsed,
    )


def _training_calendar_column(
    *,
    title: str,
    bucket: str,
    total_done: int,
    total_elapsed: int,
    quarter_ranges: list[tuple[datetime.date, datetime.date]],
    quarter_counts: list[tuple[int, int]],
    quarter_delta_labels: list[str],
    daily_data: dict[datetime.date, DailyAggregate],
    today: datetime.date,
) -> TrainingCalendarColumn:
    quarters: list[TrainingCalendarQuarter] = []

    for index, (start, end) in enumerate(quarter_ranges):
        if start > today:
            continue
        done, elapsed = quarter_counts[index]
        months = [
            _training_calendar_month(
                month_start,
                month_end,
                daily_data,
                today=today,
                bucket=bucket,
            )
            for month_start, month_end in _quarter_month_ranges(start, end)
            if month_start <= today
        ]
        delta_label = (
            quarter_delta_labels[index] if index < len(quarter_delta_labels) else ""
        )
        quarters.append(
            TrainingCalendarQuarter(
                label=f"Q{index + 1}",
                done=done,
                elapsed=elapsed,
                delta_label=delta_label,
                months=tuple(months),
            )
        )

    return TrainingCalendarColumn(
        title=title,
        total_done=total_done,
        total_elapsed=total_elapsed,
        quarters=tuple(quarters),
    )


def build_yearly_metrics(
    year: int,
    year_start: datetime.date,
    year_end: datetime.date,
    quarter_ranges: list[tuple[datetime.date, datetime.date]],
    prev_quarter_ranges: list[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    media_bundle: MediaBundle,
    *,
    target_date: datetime.date,
    prior_year_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    today = target_date
    sections: list[list[str]] = []

    dates = list(daterange(year_start, year_end))
    prev_dates = list(daterange(*year_range(year - 1)))

    current_metrics = compute_period_metrics(dates, daily_data)
    prev_metrics = compute_period_metrics(prev_dates, prev_daily_data)

    # Compute 3-year moving average
    ma_metrics = None
    if prior_year_metrics and len(prior_year_metrics) >= 3:
        ma_metrics = compute_moving_average(prior_year_metrics, 3)

    # SUMMARY
    append_summary_section(
        sections,
        current_metrics,
        prev_metrics,
        "CURRENT",
        "PREVIOUS",
        ma_metrics=ma_metrics,
        ma_label="3-YEAR" if ma_metrics else None,
        ma_training_unit="yr",
    )

    quarter_day_lists: list[list[datetime.date]] = [
        list(daterange(start, end)) for start, end in quarter_ranges
    ]
    prev_last_quarter_days = (
        list(daterange(prev_quarter_ranges[-1][0], prev_quarter_ranges[-1][1]))
        if prev_quarter_ranges
        else None
    )
    year_delta_data = {**prev_daily_data, **daily_data}

    # STUDY (quarter bars, y_max=720h)
    study_lines = ["### **STUDY**"]
    q_labels = [f"Q{i + 1}" for i in range(4)]

    activity_totals = aggregate_activity_totals(dates, daily_data)
    study_values_hours: list[float] = []
    study_value_labels: list[str] = []

    for start, end in quarter_ranges:
        total_min = sum(
            sum(activity_totals_for_day(daily_data, day).values())
            for day in daterange(start, end)
        )

        study_values_hours.append(
            round((total_min / 60) * 2) / 2 if total_min else 0
        )  # Round to nearest 0.5h
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(TIME_LABEL_STANDARD.format(total_min))

    study_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: float(study_minutes_for_day(year_delta_data, d) or 0.0),
        baseline_bucket=prev_last_quarter_days,
        mode="pace",
        today=today,
    )

    study_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=q_labels,
                values=study_values_hours,
                value_labels=study_value_labels,
                profile=YEARLY_4QTR_STUDY,
                delta_labels=study_delta_labels,
            )
        )
    )
    append_activity_summary(study_lines, activity_totals)

    sections.append(trim_blank_lines(study_lines))

    # TRAINING (quarter rows)
    training_lines = ["### **TRAINING**"]
    workout_counts: list[tuple[int, int]] = []
    stretch_counts: list[tuple[int, int]] = []
    workout_done_year = 0
    stretch_done_year = 0
    elapsed_year = 0

    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        elapsed_days = sum(1 for d in days if d <= today)
        workout_done = sum(
            1
            for d in days
            if d <= today and training_done_for_day(daily_data, d, "workout")
        )
        stretch_done = sum(
            1
            for d in days
            if d <= today and training_done_for_day(daily_data, d, "stretch")
        )
        workout_counts.append((workout_done, elapsed_days))
        stretch_counts.append((stretch_done, elapsed_days))
        workout_done_year += workout_done
        stretch_done_year += stretch_done
        elapsed_year += elapsed_days

    workout_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: (
            1.0 if training_done_for_day(year_delta_data, d, "workout") else 0.0
        ),
        baseline_bucket=prev_last_quarter_days,
        mode="pace",
        today=today,
    )
    stretch_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: (
            1.0 if training_done_for_day(year_delta_data, d, "stretch") else 0.0
        ),
        baseline_bucket=prev_last_quarter_days,
        mode="pace",
        today=today,
    )

    training_columns = [
        _training_calendar_column(
            title="WORKOUT",
            bucket="workout",
            total_done=workout_done_year,
            total_elapsed=elapsed_year,
            quarter_ranges=quarter_ranges,
            quarter_counts=workout_counts,
            quarter_delta_labels=workout_delta_labels,
            daily_data=daily_data,
            today=today,
        ),
        _training_calendar_column(
            title="STRETCH",
            bucket="stretch",
            total_done=stretch_done_year,
            total_elapsed=elapsed_year,
            quarter_ranges=quarter_ranges,
            quarter_counts=stretch_counts,
            quarter_delta_labels=stretch_delta_labels,
            daily_data=daily_data,
            today=today,
        ),
    ]
    training_lines.extend(
        render_chart(
            TrainingCalendarColumnsSpec(
                columns=training_columns,
                month_width=YEARLY_TRAINING_MONTH_WIDTH,
            )
        )
    )
    training_lines.append("")
    append_training_type_table(training_lines, dates, daily_data)
    sections.append(trim_blank_lines(training_lines))

    # SLEEP
    sleep_lines = ["### **SLEEP**"]
    sleep_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: sleep_minutes_for_day(year_delta_data, d),
        baseline_bucket=prev_last_quarter_days,
        mode="average",
        today=today,
    )

    sleep_lines.extend(
        render_chart(
            bucket_average_bar_spec(
                quarter_ranges,
                q_labels,
                today=today,
                value_for_day=lambda d: sleep_minutes_for_day(daily_data, d),
                chart_value=lambda avg: round((avg / 60) * 2) / 2,
                value_label=TIME_LABEL_STANDARD.format,
                zero_label="0h00m",
                profile=YEARLY_4QTR_METRIC,
                delta_labels=sleep_delta_labels,
            )
        )
    )
    sleep_lines.append("")

    avg_awake = compute_sleep_aux_averages(dates, daily_data)
    sleep_avg = current_metrics["sleep_avg_minutes"]

    sleep_lines.extend(
        sleep_stats_table_lines(
            sleep_avg,
            avg_awake,
            avg_schedule=compute_avg_schedule(dates, daily_data),
        )
    )
    sleep_lines.append("")
    sections.append(trim_blank_lines(sleep_lines))

    # MEDIA section
    append_media_section(sections, media_bundle)

    return join_sections(sections)
