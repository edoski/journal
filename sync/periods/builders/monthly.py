"""Monthly period metrics builder."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaBundle
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.constants import STUDY_TARGET_MIN
from sync.dates import daterange, format_week_label, month_week_ranges, shift_month
from sync.formatting import format_minutes
from sync.metrics import (
    aggregate_activity_totals,
    aggregate_screen_time,
    compute_bucket_deltas,
    compute_moving_average,
    compute_period_metrics,
    group_screen_time_by_percent,
)
from sync.notes.sections import join_sections, trim_blank_lines
from sync.periods.builders.common import (
    activity_table_lines,
    awake_minutes_for_day,
    awakenings_for_day,
    compute_avg_schedule,
    mood_for_day,
    sleep_minutes_for_day,
    sleep_stats_table_lines,
    study_minutes_for_day,
    training_done_for_day,
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
    MONTHLY_WEEK_METRIC,
    MONTHLY_WEEK_MOOD,
    MONTHLY_WEEK_STUDY,
    MonthlyStudyGridSpec,
    MonthlyTrainingGridSpec,
    TIME_LABEL_MIN2H,
    TIME_LABEL_STANDARD,
    VerticalBarSpec,
    render_chart,
)
from sync.writers.tables import ScreenTrendMode, ScreenTrendTableSpec, render_table


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
    study_target_minutes: int | None,
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
    today = datetime.date.today()

    # Compute metrics for current and previous month
    current_metrics = compute_period_metrics(dates, daily_data)
    prev_metrics = compute_period_metrics(list(prev_daily_data.keys()), prev_daily_data)

    # Compute 3-month moving average
    ma_metrics = None
    if prior_month_metrics and len(prior_month_metrics) >= 3:
        ma_metrics = compute_moving_average(prior_month_metrics, 3)

    sleep_avg = current_metrics["sleep_avg_minutes"]
    workout_days = current_metrics["workout_count"]
    stretch_days = current_metrics["stretch_count"]

    # Collect study total from activity tables (more accurate than frontmatter)
    activity_totals = aggregate_activity_totals(dates, daily_data)
    study_total_from_activities = sum(activity_totals.values())

    sections: list[list[str]] = []

    # Summary with MA
    append_summary_section(
        sections,
        current_metrics,
        prev_metrics,
        current_month_label,
        prev_month_label,
        study_target_minutes,
        ma_metrics=ma_metrics,
        ma_label="3-MO AVG" if ma_metrics else None,
        ma_training_unit="mo",
        period_type="month",
        total_days=days_in_period,
    )

    # STUDY section (using activity totals for accuracy)
    study_lines = ["### **STUDY**"]

    # Weekly TOTALS for study chart (0-40h scale, 8 visual rows, 6-char bars)
    week_labels = []
    week_day_lists = []
    study_chart_vals = []
    study_value_labels = []

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

    prev_year, prev_month = shift_month(start_date.year, start_date.month, -1)
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
    study_lines.append(
        f"**`SUM: {format_minutes(study_total_from_activities, always_show_both=True)}`**"
    )
    study_lines.append("")

    # Activity table (activity_totals already computed above)
    study_lines.extend(activity_table_lines(activity_totals))
    study_lines.append("")

    # Full-study-day deltas per week (pace-normalized by days per bucket)
    study_grid_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: (
            1.0
            if (study_minutes_for_day(month_delta_data, d) or 0) >= STUDY_TARGET_MIN
            else 0.0
        ),
        baseline_bucket=prev_baseline_week,
        mode="pace",
        today=today,
    )

    current_month_date = today if is_current_month else None
    study_lines.extend(
        render_chart(
            MonthlyStudyGridSpec(
                week_ranges=week_ranges,
                daily_data=daily_data,
                current_date=current_month_date,
                delta_labels=study_grid_delta_labels,
            )
        )
    )
    study_lines.append("")

    # INTERRUPTIONS table
    append_interrupts_table(study_lines, dates, daily_data)
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
        MonthlyTrainingGridSpec(
            week_ranges=week_ranges,
            daily_data=daily_data,
            meditation_count=meditation_days,
            workout_count=workout_days,
            stretch_count=stretch_days,
            days_in_period=days_in_period,
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

    # PROCRASTINATION section (screen time waterfall + trend table)
    screen_time_totals = aggregate_screen_time(dates, daily_data)
    screen_time_totals = group_screen_time_by_percent(screen_time_totals)
    if screen_time_totals:
        # Weekly trend table with wikilinks to weekly notes
        week_labels = [format_week_label(s, e) for s, e in week_ranges]
        week_wikilinks = []
        for (s, _), label in zip(week_ranges, week_labels):
            year, week_num, _ = s.isocalendar()
            week_wikilinks.append(f"[[{year}-W{week_num:02d}\\|{label}]]")
        procrastination_lines = build_procrastination_section(
            screen_time_totals,
            render_table(
                ScreenTrendTableSpec(
                    mode=ScreenTrendMode.PERIOD,
                    period_label="WEEK",
                    period_ranges=week_ranges,
                    daily_data=daily_data,
                    labels=week_labels,
                    wikilinks=week_wikilinks,
                )
            ),
        )
        sections.append(trim_blank_lines(procrastination_lines))

    # SLEEP section (5-char bars, weekly averages)
    sleep_lines = ["### **SLEEP**"]
    sleep_chart_vals = []
    sleep_value_labels = []
    for week_days in week_day_lists:
        mins_raw = [sleep_minutes_for_day(daily_data, d) for d in week_days]
        sleep_mins: list[float] = [m for m in mins_raw if m is not None]
        start = week_days[0]
        if sleep_mins:
            avg_min = sum(sleep_mins) / len(sleep_mins)  # AVERAGE for sleep
            sleep_chart_vals.append(
                round((avg_min / 60) * 2) / 2
            )  # Round to nearest 0.5h
            if start > today:
                sleep_value_labels.append("")
            else:
                sleep_value_labels.append(TIME_LABEL_STANDARD.format(avg_min))
        else:
            sleep_chart_vals.append(0)
            if start > today:
                sleep_value_labels.append("")
            else:
                sleep_value_labels.append("0h00m")

    sleep_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: sleep_minutes_for_day(month_delta_data, d),
        baseline_bucket=prev_baseline_week,
        mode="average",
        today=today,
    )

    sleep_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=week_labels,
                values=sleep_chart_vals,
                value_labels=sleep_value_labels,
                profile=MONTHLY_WEEK_METRIC,
                delta_labels=sleep_delta_labels,
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

    # MOOD section (5-char bars, weekly averages, always show decimal)
    mood_lines = ["### **MOOD**"]
    mood_chart_vals = []
    mood_value_labels = []
    for week_days in week_day_lists:
        vals_raw = [mood_for_day(daily_data, d) for d in week_days]
        vals = [v for v in vals_raw if v is not None]
        start = week_days[0]
        if vals:
            avg_val = sum(vals) / len(vals)  # AVERAGE for mood
            mood_chart_vals.append(avg_val)
            # Always show one decimal for mood (e.g., 5.0, 6.0, 10.0)
            if start > today:
                mood_value_labels.append("")
            else:
                mood_value_labels.append(DECIMAL_ONE_LABEL.format(avg_val))
        else:
            mood_chart_vals.append(0)
            if start > today:
                mood_value_labels.append("")
            else:
                mood_value_labels.append("0.0")

    mood_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: mood_for_day(month_delta_data, d),
        baseline_bucket=prev_baseline_week,
        mode="average",
        today=today,
    )

    mood_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=week_labels,
                values=mood_chart_vals,
                value_labels=mood_value_labels,
                profile=MONTHLY_WEEK_MOOD,
                delta_labels=mood_delta_labels,
            )
        )
    )
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    append_media_section(sections, media_bundle)

    return join_sections(sections)
