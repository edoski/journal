"""Weekly period metrics builder."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaBundle
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.constants import DAYS
from sync.metrics import (
    aggregate_activity_totals,
    aggregate_screen_time,
    compute_moving_average,
    compute_period_metrics,
    group_screen_time_by_percent,
)
from sync.notes.sections import join_sections, trim_blank_lines
from sync.periods.builders.common import (
    append_activity_summary,
    compute_sleep_aux_averages,
    compute_avg_schedule,
    mood_for_day,
    sleep_minutes_for_day,
    sleep_stats_table_lines,
    study_minutes_for_day,
)
from sync.periods.sections import (
    append_interrupts_table,
    append_media_section,
    append_summary_section,
    append_training_type_table,
    build_procrastination_section,
)
from sync.periods.presentation import (
    daily_screen_trend_rows,
    weekly_study_grid_spec,
    weekly_training_grid_spec,
)
from sync.writers.charts import (
    DECIMAL_ONE_LABEL,
    TIME_LABEL_STANDARD,
    VerticalBarSpec,
    WEEKLY_7DAY_CHART,
    WEEKLY_7DAY_MOOD,
    render_chart,
)
from sync.writers.tables import ScreenTrendTableSpec, render_table


def build_weekly_metrics(
    start_date: datetime.date,
    end_date: datetime.date,
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    prev_week_label: str,
    media_bundle: MediaBundle,
    *,
    target_date: datetime.date,
    study_target_minutes: int | None,
    prior_week_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    """
    Build the metrics block for a weekly note.

    prev_week_label: wiki link like "[[2025-W50|LAST WEEK]]"
    prior_week_metrics: list of metrics dicts for prior 4 weeks (oldest first)
    """
    dates = [start_date + datetime.timedelta(days=i) for i in range(7)]
    today = target_date

    # Compute metrics for current and previous week
    current_metrics = compute_period_metrics(dates, daily_data)
    prev_dates = [
        start_date - datetime.timedelta(days=7) + datetime.timedelta(days=i)
        for i in range(7)
    ]
    prev_metrics = compute_period_metrics(prev_dates, prev_daily_data)

    # Compute 4-week moving average
    ma_metrics = None
    if prior_week_metrics and len(prior_week_metrics) >= 4:
        ma_metrics = compute_moving_average(prior_week_metrics, 4)

    study_minutes = [study_minutes_for_day(daily_data, d) for d in dates]
    sleep_minutes = [sleep_minutes_for_day(daily_data, d) for d in dates]
    mood_vals = [mood_for_day(daily_data, d) for d in dates]

    sleep_avg = current_metrics["sleep_avg_minutes"]
    workout_days = current_metrics["workout_count"]
    stretch_days = current_metrics["stretch_count"]

    # Calculate study total from activity tables (more accurate than frontmatter)
    activity_totals = aggregate_activity_totals(dates, daily_data)
    sections: list[list[str]] = []

    # Summary with MA
    append_summary_section(
        sections,
        current_metrics,
        prev_metrics,
        "THIS WEEK",
        prev_week_label,
        study_target_minutes,
        ma_metrics=ma_metrics,
        ma_label="4-WK AVG" if ma_metrics else None,
        ma_training_unit="7",
        period_type="week",
        total_days=7,
    )

    # STUDY section (using activity totals for accuracy)
    study_lines = ["### **STUDY**"]
    study_hours = [
        round((m / 60) * 2) / 2 if m is not None and m > 0 else 0 for m in study_minutes
    ]
    study_values: list[str] = []
    for d, m in zip(dates, study_minutes):
        if d > today:
            study_values.append("")
        else:
            study_values.append(TIME_LABEL_STANDARD.format(m or 0))
    study_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=DAYS,
                values=study_hours,
                value_labels=study_values,
                profile=WEEKLY_7DAY_CHART,
            )
        )
    )
    append_activity_summary(study_lines, activity_totals)

    current_week_date = today if start_date <= today <= end_date else None
    study_lines.extend(
        render_chart(
            weekly_study_grid_spec(
                dates=dates,
                daily_data=daily_data,
                current_date=current_week_date,
                today=today,
            )
        )
    )
    study_lines.append("")

    # INTERRUPTIONS table
    append_interrupts_table(study_lines, dates, daily_data)
    sections.append(trim_blank_lines(study_lines))

    # TRAINING section
    training_lines = ["### **TRAINING**"]
    current_week_date = today if start_date <= today <= end_date else None
    meditation_days = current_metrics["meditation_count"]
    training_lines.extend(
        render_chart(
            weekly_training_grid_spec(
                dates=dates,
                daily_data=daily_data,
                meditation_count=meditation_days,
                workout_count=workout_days,
                stretch_count=stretch_days,
                current_date=current_week_date,
            )
        )
    )
    training_lines.append("")
    append_training_type_table(training_lines, dates, daily_data)
    sections.append(trim_blank_lines(training_lines))

    # PROCRASTINATION section (screen time waterfall + trend table)
    screen_time_totals = aggregate_screen_time(dates, daily_data)
    screen_time_totals = group_screen_time_by_percent(screen_time_totals)
    procrastination_lines = build_procrastination_section(
        screen_time_totals,
        render_table(
            ScreenTrendTableSpec(
                period_label="DAY",
                rows=daily_screen_trend_rows(
                    dates,
                    daily_data,
                    today=today,
                    period_label="DAY",
                ),
            )
        ),
    )
    if procrastination_lines:
        sections.append(trim_blank_lines(procrastination_lines))

    # SLEEP section (values on top of bars, 5-char bars like monthly)
    sleep_lines = ["### **SLEEP**"]
    sleep_hours = [
        round((m / 60) * 2) / 2 if m is not None else 0 for m in sleep_minutes
    ]
    sleep_values: list[str] = []
    for d, m in zip(dates, sleep_minutes):
        if d > today:
            sleep_values.append("")
        else:
            sleep_values.append(TIME_LABEL_STANDARD.format(m or 0))
    sleep_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=DAYS,
                values=sleep_hours,
                value_labels=sleep_values,
                profile=WEEKLY_7DAY_CHART,
            )
        )
    )
    sleep_lines.append("")

    avg_awake, avg_awakenings = compute_sleep_aux_averages(dates, daily_data)

    sleep_lines.extend(
        sleep_stats_table_lines(
            sleep_avg,
            avg_awake,
            avg_awakenings,
            avg_schedule=compute_avg_schedule(dates, daily_data),
        )
    )
    sleep_lines.append("")
    sections.append(trim_blank_lines(sleep_lines))

    # MOOD section (values on top of bars, always show decimal)
    mood_lines = ["### **MOOD**"]
    mood_chart_vals: list[float] = [m if m is not None else 0 for m in mood_vals]
    mood_value_labels: list[str] = []
    for d, m in zip(dates, mood_vals):
        if d > today:
            mood_value_labels.append("")
        else:
            mood_value_labels.append(
                DECIMAL_ONE_LABEL.format(m if m is not None else 0.0)
            )
    mood_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=DAYS,
                values=mood_chart_vals,
                value_labels=mood_value_labels,
                profile=WEEKLY_7DAY_MOOD,
            )
        )
    )
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    append_media_section(sections, media_bundle)

    return join_sections(sections)
