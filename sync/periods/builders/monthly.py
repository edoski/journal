"""Monthly period metrics builder."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaBundle
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.dates import (
    daterange,
    format_week_label,
    month_range,
    month_week_ranges,
    shift_month,
)
from sync.metrics import (
    aggregate_activity_totals,
    compute_bucket_deltas,
    compute_moving_average,
    compute_period_metrics,
)
from sync.notes.sections import join_sections, trim_blank_lines
from sync.periods.builders.common import (
    append_activity_summary,
    compute_sleep_aux_averages,
    compute_avg_schedule,
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
    monthly_training_grid_spec,
)
from sync.writers.charts import (
    MONTHLY_WEEK_METRIC,
    MONTHLY_WEEK_STUDY,
    TIME_LABEL_MIN2H,
    TIME_LABEL_STANDARD,
    VerticalBarSpec,
    render_chart,
)


def build_monthly_metrics(
    start_date: datetime.date,
    end_date: datetime.date,
    week_ranges: list[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    current_month_label: str,
    prev_month_label: str,
    media_bundle: MediaBundle,
    *,
    target_date: datetime.date,
    prior_month_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    """
    Build the metrics block for a monthly note.

    current_month_label: e.g., "DEC"
    prev_month_label: wiki link like "[[2025-11|NOV]]"
    prior_month_metrics: list of metrics dicts for prior 3 months (oldest first)
    """
    days_in_period = (end_date - start_date).days + 1
    dates = list(daterange(start_date, end_date))
    today = target_date
    prev_year, prev_month = shift_month(start_date.year, start_date.month, -1)

    # Compute metrics for current and previous month
    current_metrics = compute_period_metrics(dates, daily_data)
    prev_metrics = compute_period_metrics(
        list(daterange(*month_range(prev_year, prev_month))),
        prev_daily_data,
    )

    # Compute 3-month moving average
    ma_metrics = None
    if prior_month_metrics and len(prior_month_metrics) >= 3:
        ma_metrics = compute_moving_average(prior_month_metrics, 3)

    sleep_avg = current_metrics["sleep_avg_minutes"]
    workout_days = current_metrics["workout_count"]
    stretch_days = current_metrics["stretch_count"]

    # Collect study total from activity tables (more accurate than frontmatter)
    activity_totals = aggregate_activity_totals(dates, daily_data)
    sections: list[list[str]] = []

    # Summary with MA
    append_summary_section(
        sections,
        current_metrics,
        prev_metrics,
        current_month_label,
        prev_month_label,
        ma_metrics=ma_metrics,
        ma_label="3-MO AVG" if ma_metrics else None,
        ma_training_unit="mo",
    )

    # STUDY section (using activity totals for accuracy)
    study_lines = ["### **STUDY**"]

    # Weekly TOTALS for study chart (0-40h scale, 8 visual rows, 6-char bars)
    week_labels: list[str] = []
    week_day_lists: list[list[datetime.date]] = []
    study_chart_vals: list[float] = []
    study_value_labels: list[str] = []

    for start, end in week_ranges:
        label = format_week_label(start, end)
        week_labels.append(label)
        week_days = list(daterange(start, end))
        week_day_lists.append(week_days)
        mins_raw = [study_minutes_for_day(daily_data, d) for d in week_days]
        mins: list[float] = [m for m in mins_raw if m is not None]
        total_min = sum(mins) if mins else 0
        study_chart_vals.append(
            round((total_min / 60) * 2) / 2
        )  # Round to nearest 0.5h
        # Always use 0h00m format for zero values
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(TIME_LABEL_MIN2H.format(total_min))

    prev_week_ranges = month_week_ranges(prev_year, prev_month)
    prev_baseline_week = (
        list(daterange(prev_week_ranges[-1][0], prev_week_ranges[-1][1]))
        if prev_week_ranges
        else None
    )
    month_delta_data = {**prev_daily_data, **daily_data}

    is_current_month = start_date.year == today.year and start_date.month == today.month
    study_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: float(
            study_minutes_for_day(month_delta_data, d) or 0.0
        ),
        baseline_bucket=prev_baseline_week,
        mode="pace",
        today=today,
    )

    study_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=week_labels,
                values=study_chart_vals,
                value_labels=study_value_labels,
                profile=MONTHLY_WEEK_STUDY,
                delta_labels=study_delta_labels,
            )
        )
    )
    append_activity_summary(study_lines, activity_totals)

    current_month_date = today if is_current_month else None

    sections.append(trim_blank_lines(study_lines))

    # TRAINING section
    training_lines = ["### **TRAINING**"]
    meditation_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: (
            1.0 if training_done_for_day(month_delta_data, d, "meditate") else 0.0
        ),
        baseline_bucket=prev_baseline_week,
        mode="pace",
        today=today,
    )
    workout_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: (
            1.0 if training_done_for_day(month_delta_data, d, "workout") else 0.0
        ),
        baseline_bucket=prev_baseline_week,
        mode="pace",
        today=today,
    )
    stretch_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: (
            1.0 if training_done_for_day(month_delta_data, d, "stretch") else 0.0
        ),
        baseline_bucket=prev_baseline_week,
        mode="pace",
        today=today,
    )

    meditation_days = current_metrics["meditation_count"]
    training_grid = render_chart(
        monthly_training_grid_spec(
            week_ranges=week_ranges,
            daily_data=daily_data,
            meditation_delta_labels=meditation_delta_labels,
            workout_delta_labels=workout_delta_labels,
            stretch_delta_labels=stretch_delta_labels,
            current_date=current_month_date,
        )
    )
    # Inject counts into headers of the grid lines
    elapsed_days = current_metrics["days_up_to_today"] or days_in_period
    if training_grid:
        for idx, line in enumerate(training_grid):
            if line.startswith("┌ MEDITATION"):
                training_grid[idx] = (
                    f"┌ MEDITATION ({meditation_days:02d}/{elapsed_days:02d})"
                )
            if line.startswith("┌ WORKOUT"):
                training_grid[idx] = (
                    f"┌ WORKOUT ({workout_days:02d}/{elapsed_days:02d})"
                )
            if line.startswith("┌ STRETCH"):
                training_grid[idx] = (
                    f"┌ STRETCH ({stretch_days:02d}/{elapsed_days:02d})"
                )

    training_lines.extend(training_grid)
    training_lines.append("")
    append_training_type_table(training_lines, dates, daily_data)
    sections.append(trim_blank_lines(training_lines))

    # SLEEP section (5-char bars, weekly averages)
    sleep_lines = ["### **SLEEP**"]
    sleep_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: sleep_minutes_for_day(month_delta_data, d),
        baseline_bucket=prev_baseline_week,
        mode="average",
        today=today,
    )

    sleep_lines.extend(
        render_chart(
            bucket_average_bar_spec(
                week_ranges,
                week_labels,
                today=today,
                value_for_day=lambda d: sleep_minutes_for_day(daily_data, d),
                chart_value=lambda avg: round((avg / 60) * 2) / 2,
                value_label=TIME_LABEL_STANDARD.format,
                zero_label="0h00m",
                profile=MONTHLY_WEEK_METRIC,
                delta_labels=sleep_delta_labels,
            )
        )
    )
    sleep_lines.append("")

    avg_awake = compute_sleep_aux_averages(dates, daily_data)

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
