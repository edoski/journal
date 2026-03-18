"""Weekly period metrics builder."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaBundle
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.constants import DAYS
from sync.formatting import format_minutes
from sync.metrics import (
    aggregate_activity_totals,
    aggregate_screen_time,
    compute_moving_average,
    compute_period_metrics,
    group_screen_time_by_percent,
)
from sync.notes.sections import join_sections, trim_blank_lines
from sync.periods.builders.common import (
    awake_minutes_for_day,
    awakenings_for_day,
    compute_avg_schedule,
    mood_for_day,
    sleep_minutes_for_day,
    sleep_stats_table_lines,
    study_minutes_for_day,
    activity_table_lines,
)
from sync.periods.sections import (
    append_interrupts_table,
    append_media_section,
    append_summary_section,
    append_training_type_table,
    build_procrastination_section,
)
from sync.writers.charts import (
    DECIMAL_ONE_LABEL,
    TIME_LABEL_STANDARD,
    VerticalBarSpec,
    WeeklyStudyGridSpec,
    WeeklyTrainingGridSpec,
    WEEKLY_7DAY_CHART,
    WEEKLY_7DAY_MOOD,
    render_chart,
)
from sync.writers.tables import ScreenTrendMode, ScreenTrendTableSpec, render_table


def build_weekly_metrics(
    start_date: datetime.date,
    end_date: datetime.date,
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    prev_week_label: str,
    media_bundle: MediaBundle,
    *,
    study_target_minutes: int | None,
    prior_week_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    """
    Build the metrics block for a weekly note.

    prev_week_label: wiki link like "[[2025-W50|LAST WEEK]]"
    prior_week_metrics: list of metrics dicts for prior 4 weeks (oldest first)
    """
    dates = [start_date + datetime.timedelta(days=i) for i in range(7)]
    today = datetime.date.today()

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
    study_total_from_activities = sum(activity_totals.values())

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
    study_values = []
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
    study_lines.append(
        f"**`SUM: {format_minutes(study_total_from_activities, always_show_both=True)}`**"
    )
    study_lines.append("")

    # Activity table (activity_totals already computed above)
    study_lines.extend(activity_table_lines(activity_totals))
    study_lines.append("")

    current_week_date = today if start_date <= today <= end_date else None
    study_lines.extend(
        render_chart(
            WeeklyStudyGridSpec(
                dates=dates,
                daily_data=daily_data,
                current_date=current_week_date,
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
            WeeklyTrainingGridSpec(
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
                mode=ScreenTrendMode.DAILY,
                period_label="DAY",
                dates=dates,
                daily_data=daily_data,
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
    sleep_values = []
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

    awake_vals = [
        awake_minutes_for_day(daily_data, d) for d in dates if daily_data.get(d)
    ]
    awakenings_vals = [
        awakenings_for_day(daily_data, d) for d in dates if daily_data.get(d)
    ]
    awake_values: list[float] = [v for v in awake_vals if v is not None]
    awakening_values: list[int] = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_values) / len(awake_values) if awake_values else None
    avg_awakenings = (
        sum(awakening_values) / len(awakening_values) if awakening_values else None
    )

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
    mood_chart_vals = [m if m is not None else 0 for m in mood_vals]
    mood_value_labels = []
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
