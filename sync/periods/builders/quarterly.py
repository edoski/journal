"""Quarterly period metrics builder."""

from __future__ import annotations

import datetime
from typing import Literal

from sync.contracts.media import MediaBundle
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.constants import MONTH_ABBR, STUDY_TARGET_MIN
from sync.dates import daterange, quarter_id, quarter_months, quarter_range
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
    append_activity_summary,
    activity_totals_for_day,
    compute_avg_schedule,
    compute_sleep_aux_averages,
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
from sync.periods.presentation import period_screen_trend_rows
from sync.writers.charts import (
    DECIMAL_ONE_LABEL,
    QUARTERLY_3MONTH_METRIC,
    QUARTERLY_3MONTH_MOOD,
    QUARTERLY_3MONTH_STUDY,
    QuarterlyStudyCoverageRowsSpec,
    TIME_LABEL_STANDARD,
    TrainingSection,
    TrainingSectionsRowsSpec,
    VerticalBarSpec,
    compress_activity_time_order,
    render_chart,
)
from sync.writers.tables import ScreenTrendTableSpec, render_table


def build_quarterly_metrics(
    quarter_start: datetime.date,
    quarter_end: datetime.date,
    month_ranges: list[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    prev_year: int,
    prev_quarter: int,
    media_bundle: MediaBundle,
    *,
    target_date: datetime.date,
    study_target_minutes: int | None,
    prior_quarter_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    today = target_date
    sections: list[list[str]] = []

    dates = list(daterange(quarter_start, quarter_end))
    prev_dates = list(daterange(*quarter_range(prev_year, prev_quarter)))

    # Summary with MA
    current_metrics = compute_period_metrics(dates, daily_data)
    prev_metrics = compute_period_metrics(prev_dates, prev_daily_data)

    # Compute 4-quarter moving average
    ma_metrics = None
    if prior_quarter_metrics and len(prior_quarter_metrics) >= 4:
        ma_metrics = compute_moving_average(prior_quarter_metrics, 4)

    prev_label = f"**[[{quarter_id(prev_year, prev_quarter)}\\|LAST QUARTER]]**"
    days_in_quarter = (quarter_end - quarter_start).days + 1
    append_summary_section(
        sections,
        current_metrics,
        prev_metrics,
        "THIS QUARTER",
        prev_label,
        study_target_minutes,
        ma_metrics=ma_metrics,
        ma_label="4-QTR AVG" if ma_metrics else None,
        ma_training_unit="qtr",
        period_type="quarter",
        total_days=days_in_quarter,
    )

    prev_month_ranges = quarter_months(prev_year, prev_quarter)
    prev_last_month_range = prev_month_ranges[-1] if prev_month_ranges else None
    prev_last_month_days = (
        list(daterange(prev_last_month_range[0], prev_last_month_range[1]))
        if prev_last_month_range
        else None
    )
    quarter_delta_data = {**prev_daily_data, **daily_data}
    month_day_lists: list[list[datetime.date]] = [
        list(daterange(start, end)) for start, end in month_ranges
    ]

    # STUDY
    study_lines = ["### **STUDY**"]
    month_labels: list[str] = []
    study_chart_vals: list[float] = []
    study_value_labels: list[str] = []
    activity_totals = aggregate_activity_totals(dates, daily_data)

    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        month_labels.append(label)
        days = list(daterange(start, end))
        total_min = sum(
            sum(activity_totals_for_day(daily_data, day).values()) for day in days
        )
        hours = round((total_min / 60) * 2) / 2  # Round to nearest 0.5h
        study_chart_vals.append(hours)
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(TIME_LABEL_STANDARD.format(total_min))

    study_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: float(
            study_minutes_for_day(quarter_delta_data, d) or 0.0
        ),
        baseline_bucket=prev_last_month_days,
        mode="pace",
        today=today,
    )

    study_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=month_labels,
                values=study_chart_vals,
                value_labels=study_value_labels,
                profile=QUARTERLY_3MONTH_STUDY,
                delta_labels=study_delta_labels,
            )
        )
    )
    append_activity_summary(study_lines, activity_totals)

    study_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: (
            1.0
            if (study_minutes_for_day(quarter_delta_data, d) or 0) >= STUDY_TARGET_MIN
            else 0.0
        ),
        baseline_bucket=prev_last_month_days,
        mode="pace",
        today=today,
    )

    study_lines.extend(
        render_chart(
            QuarterlyStudyCoverageRowsSpec(
                month_ranges=month_ranges,
                daily_data=daily_data,
                today=today,
                delta_labels=study_delta_labels,
            )
        )
    )
    study_lines.append("")

    append_interrupts_table(study_lines, dates, daily_data)
    sections.append(trim_blank_lines(study_lines))

    # TRAINING
    training_lines = ["### **TRAINING**"]

    # Per-month counts + deltas (compare each month to previous; first month vs last month of previous quarter)
    month_labels = [MONTH_ABBR[m[0].month - 1] for m in month_ranges]

    def _month_count(
        range_tuple: tuple[datetime.date, datetime.date],
        key: Literal["meditate", "workout", "stretch"],
        source_data: dict[datetime.date, DailyAggregate],
    ) -> tuple[int, int, datetime.date]:
        start, end = range_tuple
        days = list(daterange(start, end))
        elapsed = sum(1 for d in days if d <= today)
        done = sum(
            1 for d in days if d <= today and training_done_for_day(source_data, d, key)
        )
        return done, elapsed, start

    meditation_counts: list[tuple[int, int, datetime.date]] = [
        _month_count(rng, "meditate", daily_data) for rng in month_ranges
    ]
    workout_counts: list[tuple[int, int, datetime.date]] = [
        _month_count(rng, "workout", daily_data) for rng in month_ranges
    ]
    stretch_counts: list[tuple[int, int, datetime.date]] = [
        _month_count(rng, "stretch", daily_data) for rng in month_ranges
    ]
    meditation_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: (
            1.0 if training_done_for_day(quarter_delta_data, d, "meditate") else 0.0
        ),
        baseline_bucket=prev_last_month_days,
        mode="pace",
        today=today,
    )
    workout_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: (
            1.0 if training_done_for_day(quarter_delta_data, d, "workout") else 0.0
        ),
        baseline_bucket=prev_last_month_days,
        mode="pace",
        today=today,
    )
    stretch_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: (
            1.0 if training_done_for_day(quarter_delta_data, d, "stretch") else 0.0
        ),
        baseline_bucket=prev_last_month_days,
        mode="pace",
        today=today,
    )

    def _month_activity_bars(
        activity_key: Literal["meditate", "workout", "stretch"],
    ) -> list[str]:
        bars: list[str] = []
        for start, end in month_ranges:
            days = list(daterange(start, end))
            bars.append(
                compress_activity_time_order(
                    days,
                    lambda d: training_done_for_day(daily_data, d, activity_key),
                    len(days),
                    fill_char="█",
                    empty_char="·",
                    today=today,
                )
            )
        return bars

    training_sections = [
        TrainingSection(
            title="MEDITATION",
            total_done=sum(d for d, _, _ in meditation_counts),
            total_elapsed=sum(e for _, e, _ in meditation_counts),
            labels=month_labels,
            counts=[(d, e) for d, e, _ in meditation_counts],
            delta_labels=meditation_delta_labels,
            bars_override=_month_activity_bars("meditate"),
            fill_char="█",
            empty_char="·",
        ),
        TrainingSection(
            title="WORKOUT",
            total_done=sum(d for d, _, _ in workout_counts),
            total_elapsed=sum(e for _, e, _ in workout_counts),
            labels=month_labels,
            counts=[(d, e) for d, e, _ in workout_counts],
            delta_labels=workout_delta_labels,
            bars_override=_month_activity_bars("workout"),
            fill_char="█",
            empty_char="·",
        ),
        TrainingSection(
            title="STRETCH",
            total_done=sum(d for d, _, _ in stretch_counts),
            total_elapsed=sum(e for _, e, _ in stretch_counts),
            labels=month_labels,
            counts=[(d, e) for d, e, _ in stretch_counts],
            delta_labels=stretch_delta_labels,
            bars_override=_month_activity_bars("stretch"),
            fill_char="█",
            empty_char="·",
        ),
    ]
    # Render all three titled training blocks as one fenced chart.
    training_lines.extend(
        render_chart(
            TrainingSectionsRowsSpec(
                sections=training_sections,
            )
        )
    )
    training_lines.append("")
    append_training_type_table(training_lines, dates, daily_data)

    sections.append(trim_blank_lines(training_lines))

    # PROCRASTINATION section (screen time waterfall + trend table)
    screen_time_totals = aggregate_screen_time(dates, daily_data)
    screen_time_totals = group_screen_time_by_percent(screen_time_totals)
    if screen_time_totals:
        # Monthly trend table with wikilinks to monthly notes
        month_labels = [MONTH_ABBR[m[0].month - 1] for m in month_ranges]
        month_wikilinks: list[str] = []
        for (start, _), label in zip(month_ranges, month_labels):
            month_wikilinks.append(f"[[{start.year}-{start.month:02d}\\|{label}]]")
        procrastination_lines = build_procrastination_section(
            screen_time_totals,
            render_table(
                ScreenTrendTableSpec(
                    period_label="MONTH",
                    rows=period_screen_trend_rows(
                        month_ranges,
                        daily_data,
                        today=today,
                        labels=month_labels,
                        wikilinks=month_wikilinks,
                        fallback_prefix="M",
                    ),
                )
            ),
        )
        sections.append(trim_blank_lines(procrastination_lines))

    # SLEEP
    sleep_lines = ["### **SLEEP**"]
    sleep_labels: list[str] = []
    sleep_chart_vals: list[float] = []
    sleep_value_labels: list[str] = []
    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        sleep_labels.append(label)
        days = list(daterange(start, end))
        sleep_mins_raw = [
            sleep_minutes_for_day(daily_data, d) for d in days if daily_data.get(d)
        ]
        sleep_mins: list[float] = [m for m in sleep_mins_raw if m is not None]
        if sleep_mins:
            avg_min = sum(sleep_mins) / len(sleep_mins)
            sleep_chart_vals.append(
                round((avg_min / 60) * 2) / 2
            )  # Round to nearest 0.5h
            sleep_value_labels.append(TIME_LABEL_STANDARD.format(avg_min))
        else:
            sleep_chart_vals.append(0)
            sleep_value_labels.append("0h00m" if start <= today else "")

    sleep_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: sleep_minutes_for_day(quarter_delta_data, d),
        baseline_bucket=prev_last_month_days,
        mode="average",
        today=today,
    )

    sleep_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=sleep_labels,
                values=sleep_chart_vals,
                value_labels=sleep_value_labels,
                profile=QUARTERLY_3MONTH_METRIC,
                delta_labels=sleep_delta_labels,
            )
        )
    )
    sleep_lines.append("")

    sleep_avg = current_metrics["sleep_avg_minutes"]
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

    # MOOD
    mood_lines = ["### **MOOD**"]
    mood_labels: list[str] = []
    mood_chart_vals: list[float] = []
    mood_value_labels: list[str] = []
    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        mood_labels.append(label)
        days = list(daterange(start, end))
        vals = [mood_for_day(daily_data, d) for d in days if daily_data.get(d)]
        vals_clean: list[float] = [v for v in vals if v is not None]
        if vals_clean:
            avg_val = sum(vals_clean) / len(vals_clean)
            mood_chart_vals.append(avg_val)
            mood_value_labels.append(DECIMAL_ONE_LABEL.format(avg_val))
        else:
            mood_chart_vals.append(0)
            mood_value_labels.append("0.0" if start <= today else "")

    mood_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: mood_for_day(quarter_delta_data, d),
        baseline_bucket=prev_last_month_days,
        mode="average",
        today=today,
    )

    mood_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=mood_labels,
                values=mood_chart_vals,
                value_labels=mood_value_labels,
                profile=QUARTERLY_3MONTH_MOOD,
                delta_labels=mood_delta_labels,
            )
        )
    )
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    append_media_section(sections, media_bundle)

    return join_sections(sections)
