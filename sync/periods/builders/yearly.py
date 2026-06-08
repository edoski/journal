"""Yearly period metrics builder."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaBundle
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.constants import RENDER, STUDY_TARGET_MIN
from sync.dates import daterange, year_range
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
    activity_totals_for_day,
    append_activity_summary,
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
from sync.periods.presentation import (
    bucket_average_bar_spec,
    period_screen_trend_rows,
    yearly_study_coverage_spec,
)
from sync.writers.charts import (
    DECIMAL_ONE_LABEL,
    TIME_LABEL_STANDARD,
    TrainingSection,
    TrainingSectionsRowsSpec,
    VerticalBarSpec,
    YEARLY_4QTR_METRIC,
    YEARLY_4QTR_MOOD,
    YEARLY_4QTR_STUDY,
    compress_activity_time_order,
    compress_days_time_order,
    render_chart,
)
from sync.writers.tables import ScreenTrendTableSpec, render_table

YEARLY_STUDY_BAR_WIDTH = 45
YEARLY_TRAINING_BAR_WIDTH = 45


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
    study_target_minutes: int | None,
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
    days_in_year = (year_end - year_start).days + 1
    append_summary_section(
        sections,
        current_metrics,
        prev_metrics,
        "THIS YEAR",
        f"**[[{year - 1}\\|LAST YEAR]]**",
        study_target_minutes,
        ma_metrics=ma_metrics,
        ma_label="3-YR AVG" if ma_metrics else None,
        ma_training_unit="yr",
        period_type="year",
        total_days=days_in_year,
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

    # Compute per-quarter full-study day counts for rendering
    study_bars: list[str] = []
    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        elapsed_days = sum(1 for d in days if d <= today)
        bar = compress_days_time_order(
            days,
            lambda d: (study_minutes_for_day(daily_data, d) or 0) >= STUDY_TARGET_MIN,
            YEARLY_STUDY_BAR_WIDTH,
            allow_partial=True,
            fill_char=RENDER.study_symbol_deep,
            partial_char="░",
            empty_char=RENDER.study_symbol_none,
            today=today,
        )
        study_bars.append(bar)

    study_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: (
            1.0
            if (study_minutes_for_day(year_delta_data, d) or 0) >= STUDY_TARGET_MIN
            else 0.0
        ),
        baseline_bucket=prev_last_quarter_days,
        mode="pace",
        today=today,
    )

    study_lines.extend(
        render_chart(
            yearly_study_coverage_spec(
                quarter_ranges=quarter_ranges,
                daily_data=daily_data,
                today=today,
                bar_width=YEARLY_STUDY_BAR_WIDTH,
                delta_labels=study_delta_labels,
                bars_override=study_bars,
                legend_line=RENDER.yearly_study_legend,
            )
        )
    )
    study_lines.append("")

    append_interrupts_table(study_lines, dates, daily_data)
    sections.append(trim_blank_lines(study_lines))

    # TRAINING (quarter rows)
    training_lines = ["### **TRAINING**"]
    quarter_labels = [f"Q{i + 1}" for i in range(4)]
    meditation_counts: list[tuple[int, int, datetime.date]] = []
    workout_counts: list[tuple[int, int, datetime.date]] = []
    stretch_counts: list[tuple[int, int, datetime.date]] = []
    meditation_done_year = 0
    workout_done_year = 0
    stretch_done_year = 0
    elapsed_year = 0

    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        elapsed_days = sum(1 for d in days if d <= today)
        meditation_done = sum(
            1
            for d in days
            if d <= today and training_done_for_day(daily_data, d, "meditate")
        )
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
        meditation_counts.append((meditation_done, elapsed_days, start))
        workout_counts.append((workout_done, elapsed_days, start))
        stretch_counts.append((stretch_done, elapsed_days, start))
        meditation_done_year += meditation_done
        workout_done_year += workout_done
        stretch_done_year += stretch_done
        elapsed_year += elapsed_days

    meditation_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: (
            1.0 if training_done_for_day(year_delta_data, d, "meditate") else 0.0
        ),
        baseline_bucket=prev_last_quarter_days,
        mode="pace",
        today=today,
    )
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

    meditation_bars: list[str] = []
    workout_bars: list[str] = []
    stretch_bars: list[str] = []
    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        meditation_bars.append(
            compress_activity_time_order(
                days,
                lambda d: training_done_for_day(daily_data, d, "meditate"),
                YEARLY_TRAINING_BAR_WIDTH,
                fill_char="█",
                empty_char="·",
                today=today,
            )
        )
        workout_bars.append(
            compress_activity_time_order(
                days,
                lambda d: training_done_for_day(daily_data, d, "workout"),
                YEARLY_TRAINING_BAR_WIDTH,
                fill_char="█",
                empty_char="·",
                today=today,
            )
        )
        stretch_bars.append(
            compress_activity_time_order(
                days,
                lambda d: training_done_for_day(daily_data, d, "stretch"),
                YEARLY_TRAINING_BAR_WIDTH,
                fill_char="█",
                empty_char="·",
                today=today,
            )
        )

    training_sections = [
        TrainingSection(
            title="MEDITATION",
            total_done=meditation_done_year,
            total_elapsed=elapsed_year,
            labels=quarter_labels,
            counts=[(d, t) for d, t, _ in meditation_counts],
            delta_labels=meditation_delta_labels,
            bar_width=YEARLY_TRAINING_BAR_WIDTH,
            bars_override=meditation_bars,
            fill_char="█",
            empty_char="·",
        ),
        TrainingSection(
            title="WORKOUT",
            total_done=workout_done_year,
            total_elapsed=elapsed_year,
            labels=quarter_labels,
            counts=[(d, t) for d, t, _ in workout_counts],
            delta_labels=workout_delta_labels,
            bar_width=YEARLY_TRAINING_BAR_WIDTH,
            bars_override=workout_bars,
            fill_char="█",
            empty_char="·",
        ),
        TrainingSection(
            title="STRETCH",
            total_done=stretch_done_year,
            total_elapsed=elapsed_year,
            labels=quarter_labels,
            counts=[(d, t) for d, t, _ in stretch_counts],
            delta_labels=stretch_delta_labels,
            bar_width=YEARLY_TRAINING_BAR_WIDTH,
            bars_override=stretch_bars,
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
        # Quarterly trend table with wikilinks to quarterly notes
        quarter_labels = [f"Q{i + 1}" for i in range(len(quarter_ranges))]
        quarter_wikilinks: list[str] = []
        for i, _ in enumerate(quarter_ranges):
            quarter_wikilinks.append(f"[[{year}-Q{i + 1}\\|Q{i + 1}]]")
        procrastination_lines = build_procrastination_section(
            screen_time_totals,
            render_table(
                ScreenTrendTableSpec(
                    period_label="QTR",
                    rows=period_screen_trend_rows(
                        quarter_ranges,
                        daily_data,
                        today=today,
                        labels=quarter_labels,
                        wikilinks=quarter_wikilinks,
                        fallback_prefix="Q",
                    ),
                )
            ),
        )
        sections.append(trim_blank_lines(procrastination_lines))

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

    avg_awake, avg_awakenings = compute_sleep_aux_averages(dates, daily_data)
    sleep_avg = current_metrics["sleep_avg_minutes"]

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
    mood_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: mood_for_day(year_delta_data, d),
        baseline_bucket=prev_last_quarter_days,
        mode="average",
        today=today,
    )

    mood_lines.extend(
        render_chart(
            bucket_average_bar_spec(
                quarter_ranges,
                q_labels,
                today=today,
                value_for_day=lambda d: mood_for_day(daily_data, d),
                chart_value=lambda avg: avg,
                value_label=DECIMAL_ONE_LABEL.format,
                zero_label="0.0",
                profile=YEARLY_4QTR_MOOD,
                delta_labels=mood_delta_labels,
            )
        )
    )
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    append_media_section(sections, media_bundle)

    return join_sections(sections)
