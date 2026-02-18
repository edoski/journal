"""Shared period metrics rendering engine."""

from __future__ import annotations

import datetime
from typing import Literal

from sync.contracts.media import MediaBundle
from sync.contracts.metrics import DailyAggregate, PeriodAggregate
from sync.constants import (
    DAYS,
    MONTH_ABBR,
    RENDER,
    STUDY_TARGET_MIN,
)
from sync.dates import (
    daterange,
    format_week_label,
    month_week_ranges,
    quarter_id,
    quarter_months,
    shift_month,
    year_range,
)
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
    QUARTERLY_3MONTH_METRIC,
    QUARTERLY_3MONTH_MOOD,
    QUARTERLY_3MONTH_STUDY,
    QuarterlyStudyCoverageRowsSpec,
    TIME_LABEL_MIN2H,
    TIME_LABEL_STANDARD,
    TrainingSectionsRowsSpec,
    WeeklyStudyGridSpec,
    WeeklyTrainingGridSpec,
    WEEKLY_7DAY_CHART,
    WEEKLY_7DAY_MOOD,
    YEARLY_4QTR_METRIC,
    YEARLY_4QTR_MOOD,
    YEARLY_4QTR_STUDY,
    TrainingSection,
    VerticalBarSpec,
    YearlyStudyCoverageRowsSpec,
    compress_activity_time_order,
    compress_days_time_order,
    render_chart,
)
from sync.writers.tables import (
    ScreenTrendMode,
    ScreenTrendTableSpec,
    SimpleGridTableSpec,
    render_table,
)

YEARLY_STUDY_BAR_WIDTH = 45
YEARLY_TRAINING_BAR_WIDTH = 45


def _day_values(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> DailyAggregate | None:
    return daily_data.get(day)


def _study_minutes_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> float | None:
    payload = _day_values(daily_data, day)
    if payload is None:
        return None
    return payload["study_minutes"]


def _sleep_minutes_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> float | None:
    payload = _day_values(daily_data, day)
    if payload is None:
        return None
    return payload["sleep_minutes"]


def _mood_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> float | None:
    payload = _day_values(daily_data, day)
    if payload is None:
        return None
    return payload["mood"]


def _awake_minutes_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> float | None:
    payload = _day_values(daily_data, day)
    if payload is None:
        return None
    return payload["awake_minutes"]


def _awakenings_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> int | None:
    payload = _day_values(daily_data, day)
    if payload is None:
        return None
    return payload["awakenings"]


def _activity_totals_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> dict[str, float]:
    payload = _day_values(daily_data, day)
    if payload is None:
        return {}
    return payload["activity_totals"]


def _training_done_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
    key: Literal["meditate", "workout", "stretch"],
) -> bool:
    payload = _day_values(daily_data, day)
    if payload is None:
        return False
    if key == "meditate":
        return payload["meditate"]
    if key == "workout":
        return payload["workout"]
    return payload["stretch"]


def _activity_table_lines(activity_totals: dict[str, float]) -> list[str]:
    total_activity = sum(activity_totals.values())
    rows: list[list[str]] = []
    if activity_totals:
        for activity, mins in sorted(
            activity_totals.items(),
            key=lambda item: item[1],
            reverse=True,
        ):
            share = (
                f"{int(round((mins / total_activity) * 100))}%"
                if total_activity
                else "0%"
            )
            rows.append([f"**{activity}**", f"`{format_minutes(mins)}`", f"`{share}`"])
    else:
        rows.append(["", "", ""])

    return render_table(
        SimpleGridTableSpec(
            headers=["ACTIVITY", "TIME", "SHARE"],
            divider_cells=["--------", "----", "-----"],
            rows=rows,
        )
    )


def _sleep_stats_table_lines(
    sleep_avg: float | None,
    avg_awake: float | None,
    avg_awakenings: float | None,
) -> list[str]:
    if avg_awakenings is not None:
        awaken_val = (
            f"{avg_awakenings:.1f}"
            if abs(avg_awakenings - round(avg_awakenings)) >= 0.05
            else str(int(round(avg_awakenings)))
        )
    else:
        awaken_val = ""

    rows = [
        [
            "**SLEEP**     ",
            f"`{format_minutes(sleep_avg)}`" if sleep_avg is not None else "",
        ],
        [
            "**AWAKE**     ",
            f"`{format_minutes(avg_awake)}`" if avg_awake is not None else "",
        ],
        ["**AWAKENINGS**", f"`{awaken_val}`" if awaken_val else ""],
    ]

    return render_table(
        SimpleGridTableSpec(
            headers=["ACTIVITY", "AVERAGE"],
            divider_cells=["--------", "-------"],
            rows=rows,
        )
    )


def build_weekly_metrics(
    start_date: datetime.date,
    end_date: datetime.date,
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    prev_week_label: str,
    media_bundle: MediaBundle,
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

    study_minutes = [_study_minutes_for_day(daily_data, d) for d in dates]
    sleep_minutes = [_sleep_minutes_for_day(daily_data, d) for d in dates]
    mood_vals = [_mood_for_day(daily_data, d) for d in dates]

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
    study_lines.extend(_activity_table_lines(activity_totals))
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
    mindful_days = current_metrics["mindful_count"]
    training_lines.extend(
        render_chart(
            WeeklyTrainingGridSpec(
                dates=dates,
                daily_data=daily_data,
                mindful_count=mindful_days,
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
        _awake_minutes_for_day(daily_data, d) for d in dates if daily_data.get(d)
    ]
    awakenings_vals = [
        _awakenings_for_day(daily_data, d) for d in dates if daily_data.get(d)
    ]
    awake_values: list[float] = [v for v in awake_vals if v is not None]
    awakening_values: list[int] = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_values) / len(awake_values) if awake_values else None
    avg_awakenings = (
        sum(awakening_values) / len(awakening_values) if awakening_values else None
    )

    sleep_lines.extend(_sleep_stats_table_lines(sleep_avg, avg_awake, avg_awakenings))
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


def build_monthly_metrics(
    start_date: datetime.date,
    end_date: datetime.date,
    week_ranges: list[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    current_month_label: str,
    prev_month_label: str,
    media_bundle: MediaBundle,
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
        mins_raw = [_study_minutes_for_day(daily_data, d) for d in week_days]
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
            _study_minutes_for_day(month_delta_data, d) or 0.0
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
    study_lines.extend(_activity_table_lines(activity_totals))
    study_lines.append("")

    # Full-study-day deltas per week (pace-normalized by days per bucket)
    study_grid_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: (
            1.0
            if (_study_minutes_for_day(month_delta_data, d) or 0) >= STUDY_TARGET_MIN
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
    mindful_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: (
            1.0 if _training_done_for_day(month_delta_data, d, "meditate") else 0.0
        ),
        baseline_bucket=prev_baseline_week,
        mode="pace",
        today=today,
    )
    workout_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: (
            1.0 if _training_done_for_day(month_delta_data, d, "workout") else 0.0
        ),
        baseline_bucket=prev_baseline_week,
        mode="pace",
        today=today,
    )
    stretch_delta_labels = compute_bucket_deltas(
        week_day_lists,
        value_for_day=lambda d: (
            1.0 if _training_done_for_day(month_delta_data, d, "stretch") else 0.0
        ),
        baseline_bucket=prev_baseline_week,
        mode="pace",
        today=today,
    )

    mindful_days = current_metrics["mindful_count"]
    training_grid = render_chart(
        MonthlyTrainingGridSpec(
            week_ranges=week_ranges,
            daily_data=daily_data,
            mindful_count=mindful_days,
            workout_count=workout_days,
            stretch_count=stretch_days,
            days_in_period=days_in_period,
            mindful_delta_labels=mindful_delta_labels,
            workout_delta_labels=workout_delta_labels,
            stretch_delta_labels=stretch_delta_labels,
            current_date=current_month_date,
        )
    )
    # Inject counts into headers of the grid lines
    elapsed_days = current_metrics["days_up_to_today"] or days_in_period
    if training_grid:
        for idx, line in enumerate(training_grid):
            if line.startswith("┌ MINDFUL"):
                training_grid[idx] = (
                    f"┌ MINDFUL ({mindful_days:02d}/{elapsed_days:02d})"
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
        mins_raw = [_sleep_minutes_for_day(daily_data, d) for d in week_days]
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
        value_for_day=lambda d: _sleep_minutes_for_day(month_delta_data, d),
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
        _awake_minutes_for_day(daily_data, d) for d in dates if daily_data.get(d)
    ]
    awakenings_vals = [
        _awakenings_for_day(daily_data, d) for d in dates if daily_data.get(d)
    ]
    awake_values: list[float] = [v for v in awake_vals if v is not None]
    awakening_values: list[int] = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_values) / len(awake_values) if awake_values else None
    avg_awakenings = (
        sum(awakening_values) / len(awakening_values) if awakening_values else None
    )

    sleep_lines.extend(_sleep_stats_table_lines(sleep_avg, avg_awake, avg_awakenings))
    sleep_lines.append("")
    sections.append(trim_blank_lines(sleep_lines))

    # MOOD section (5-char bars, weekly averages, always show decimal)
    mood_lines = ["### **MOOD**"]
    mood_chart_vals = []
    mood_value_labels = []
    for week_days in week_day_lists:
        vals_raw = [_mood_for_day(daily_data, d) for d in week_days]
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
        value_for_day=lambda d: _mood_for_day(month_delta_data, d),
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


def build_quarterly_metrics(
    quarter_start: datetime.date,
    quarter_end: datetime.date,
    month_ranges: list[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    prev_year: int,
    prev_quarter: int,
    media_bundle: MediaBundle,
    prior_quarter_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    today = datetime.date.today()
    sections: list[list[str]] = []

    dates = list(daterange(quarter_start, quarter_end))
    prev_dates = list(prev_daily_data.keys())

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
    month_day_lists = [list(daterange(start, end)) for start, end in month_ranges]

    # STUDY
    study_lines = ["### **STUDY**"]
    month_labels = []
    study_chart_vals = []
    study_value_labels = []
    activity_totals: dict[str, float] = {}

    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        month_labels.append(label)
        days = list(daterange(start, end))
        total_min = 0.0
        for d in days:
            for activity, mins in _activity_totals_for_day(daily_data, d).items():
                minutes = float(mins or 0.0)
                activity_totals[activity] = activity_totals.get(activity, 0.0) + minutes
                total_min += minutes
        hours = round((total_min / 60) * 2) / 2  # Round to nearest 0.5h
        study_chart_vals.append(hours)
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(TIME_LABEL_STANDARD.format(total_min))

    study_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: float(
            _study_minutes_for_day(quarter_delta_data, d) or 0.0
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
    study_lines.append(
        f"**`SUM: {format_minutes(sum(activity_totals.values()), always_show_both=True)}`**"
    )
    study_lines.append("")

    study_lines.extend(_activity_table_lines(activity_totals))
    study_lines.append("")

    study_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: (
            1.0
            if (_study_minutes_for_day(quarter_delta_data, d) or 0) >= STUDY_TARGET_MIN
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
            1
            for d in days
            if d <= today and _training_done_for_day(source_data, d, key)
        )
        return done, elapsed, start

    mindful_counts = [_month_count(rng, "meditate", daily_data) for rng in month_ranges]
    workout_counts = [_month_count(rng, "workout", daily_data) for rng in month_ranges]
    stretch_counts = [_month_count(rng, "stretch", daily_data) for rng in month_ranges]
    mindful_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: (
            1.0 if _training_done_for_day(quarter_delta_data, d, "meditate") else 0.0
        ),
        baseline_bucket=prev_last_month_days,
        mode="pace",
        today=today,
    )
    workout_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: (
            1.0 if _training_done_for_day(quarter_delta_data, d, "workout") else 0.0
        ),
        baseline_bucket=prev_last_month_days,
        mode="pace",
        today=today,
    )
    stretch_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: (
            1.0 if _training_done_for_day(quarter_delta_data, d, "stretch") else 0.0
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
                    lambda d: _training_done_for_day(daily_data, d, activity_key),
                    len(days),
                    fill_char="█",
                    empty_char="·",
                    today=today,
                )
            )
        return bars

    training_sections = [
        TrainingSection(
            title="MINDFUL",
            total_done=sum(d for d, _, _ in mindful_counts),
            total_elapsed=sum(e for _, e, _ in mindful_counts),
            labels=month_labels,
            counts=[(d, e) for d, e, _ in mindful_counts],
            delta_labels=mindful_delta_labels,
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
        month_wikilinks = []
        for (start, _), label in zip(month_ranges, month_labels):
            month_wikilinks.append(f"[[{start.year}-{start.month:02d}\\|{label}]]")
        procrastination_lines = build_procrastination_section(
            screen_time_totals,
            render_table(
                ScreenTrendTableSpec(
                    mode=ScreenTrendMode.PERIOD,
                    period_label="MONTH",
                    period_ranges=month_ranges,
                    daily_data=daily_data,
                    labels=month_labels,
                    wikilinks=month_wikilinks,
                )
            ),
        )
        sections.append(trim_blank_lines(procrastination_lines))

    # SLEEP
    sleep_lines = ["### **SLEEP**"]
    sleep_labels = []
    sleep_chart_vals = []
    sleep_value_labels = []
    awake_vals = []
    awakenings_vals = []
    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        sleep_labels.append(label)
        days = list(daterange(start, end))
        sleep_mins_raw = [
            _sleep_minutes_for_day(daily_data, d) for d in days if daily_data.get(d)
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

        awake_vals.extend(
            [_awake_minutes_for_day(daily_data, d) for d in days if daily_data.get(d)]
        )
        awakenings_vals.extend(
            [_awakenings_for_day(daily_data, d) for d in days if daily_data.get(d)]
        )

    sleep_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: _sleep_minutes_for_day(quarter_delta_data, d),
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

    awake_values: list[float] = [v for v in awake_vals if v is not None]
    awakening_values: list[int] = [v for v in awakenings_vals if v is not None]
    sleep_avg = current_metrics["sleep_avg_minutes"]
    avg_awake = sum(awake_values) / len(awake_values) if awake_values else None
    avg_awakenings = (
        sum(awakening_values) / len(awakening_values) if awakening_values else None
    )

    sleep_lines.extend(_sleep_stats_table_lines(sleep_avg, avg_awake, avg_awakenings))
    sleep_lines.append("")
    sections.append(trim_blank_lines(sleep_lines))

    # MOOD
    mood_lines = ["### **MOOD**"]
    mood_labels = []
    mood_chart_vals = []
    mood_value_labels = []
    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        mood_labels.append(label)
        days = list(daterange(start, end))
        vals = [_mood_for_day(daily_data, d) for d in days if daily_data.get(d)]
        vals_clean = [v for v in vals if v is not None]
        if vals_clean:
            avg_val = sum(vals_clean) / len(vals_clean)
            mood_chart_vals.append(avg_val)
            mood_value_labels.append(DECIMAL_ONE_LABEL.format(avg_val))
        else:
            mood_chart_vals.append(0)
            mood_value_labels.append("0.0" if start <= today else "")

    mood_delta_labels = compute_bucket_deltas(
        month_day_lists,
        value_for_day=lambda d: _mood_for_day(quarter_delta_data, d),
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


def build_yearly_metrics(
    year: int,
    year_start: datetime.date,
    year_end: datetime.date,
    quarter_ranges: list[tuple[datetime.date, datetime.date]],
    prev_quarter_ranges: list[tuple[datetime.date, datetime.date]],
    daily_data: dict[datetime.date, DailyAggregate],
    prev_daily_data: dict[datetime.date, DailyAggregate],
    media_bundle: MediaBundle,
    prior_year_metrics: list[PeriodAggregate] | None = None,
) -> list[str]:
    today = datetime.date.today()
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
        ma_metrics=ma_metrics,
        ma_label="3-YR AVG" if ma_metrics else None,
        ma_training_unit="yr",
        period_type="year",
        total_days=days_in_year,
    )

    quarter_day_lists = [list(daterange(start, end)) for start, end in quarter_ranges]
    prev_last_quarter_days = (
        list(daterange(prev_quarter_ranges[-1][0], prev_quarter_ranges[-1][1]))
        if prev_quarter_ranges
        else None
    )
    year_delta_data = {**prev_daily_data, **daily_data}

    # STUDY (quarter bars, y_max=720h)
    study_lines = ["### **STUDY**"]
    q_labels = [f"Q{i + 1}" for i in range(4)]

    activity_totals: dict[str, float] = {}
    study_values_hours = []
    study_value_labels = []

    for start, end in quarter_ranges:
        total_min = 0.0
        for d in daterange(start, end):
            for activity, mins in _activity_totals_for_day(daily_data, d).items():
                minutes = float(mins or 0.0)
                activity_totals[activity] = activity_totals.get(activity, 0.0) + minutes
                total_min += minutes

        study_values_hours.append(
            round((total_min / 60) * 2) / 2 if total_min else 0
        )  # Round to nearest 0.5h
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(TIME_LABEL_STANDARD.format(total_min))

    study_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: float(
            _study_minutes_for_day(year_delta_data, d) or 0.0
        ),
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
    study_lines.append(
        f"**`SUM: {format_minutes(sum(activity_totals.values()), always_show_both=True)}`**"
    )
    study_lines.append("")

    study_lines.extend(_activity_table_lines(activity_totals))
    study_lines.append("")

    # Compute per-quarter full-study day counts for rendering
    study_counts = []
    study_bars = []
    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        elapsed_days = sum(1 for d in days if d <= today)
        done = sum(
            1
            for d in days
            if d <= today
            and (_study_minutes_for_day(daily_data, d) or 0) >= STUDY_TARGET_MIN
        )
        study_counts.append((done, elapsed_days, start))
        bar = compress_days_time_order(
            days,
            lambda d: (_study_minutes_for_day(daily_data, d) or 0) >= STUDY_TARGET_MIN,
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
            if (_study_minutes_for_day(year_delta_data, d) or 0) >= STUDY_TARGET_MIN
            else 0.0
        ),
        baseline_bucket=prev_last_quarter_days,
        mode="pace",
        today=today,
    )

    study_lines.extend(
        render_chart(
            YearlyStudyCoverageRowsSpec(
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
    mindful_counts = []
    workout_counts = []
    stretch_counts = []
    mindful_done_year = 0
    workout_done_year = 0
    stretch_done_year = 0
    elapsed_year = 0

    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        elapsed_days = sum(1 for d in days if d <= today)
        mindful_done = sum(
            1
            for d in days
            if d <= today and _training_done_for_day(daily_data, d, "meditate")
        )
        workout_done = sum(
            1
            for d in days
            if d <= today and _training_done_for_day(daily_data, d, "workout")
        )
        stretch_done = sum(
            1
            for d in days
            if d <= today and _training_done_for_day(daily_data, d, "stretch")
        )
        mindful_counts.append((mindful_done, elapsed_days, start))
        workout_counts.append((workout_done, elapsed_days, start))
        stretch_counts.append((stretch_done, elapsed_days, start))
        mindful_done_year += mindful_done
        workout_done_year += workout_done
        stretch_done_year += stretch_done
        elapsed_year += elapsed_days

    mindful_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: (
            1.0 if _training_done_for_day(year_delta_data, d, "meditate") else 0.0
        ),
        baseline_bucket=prev_last_quarter_days,
        mode="pace",
        today=today,
    )
    workout_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: (
            1.0 if _training_done_for_day(year_delta_data, d, "workout") else 0.0
        ),
        baseline_bucket=prev_last_quarter_days,
        mode="pace",
        today=today,
    )
    stretch_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: (
            1.0 if _training_done_for_day(year_delta_data, d, "stretch") else 0.0
        ),
        baseline_bucket=prev_last_quarter_days,
        mode="pace",
        today=today,
    )

    mindful_bars = []
    workout_bars = []
    stretch_bars = []
    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        mindful_bars.append(
            compress_activity_time_order(
                days,
                lambda d: _training_done_for_day(daily_data, d, "meditate"),
                YEARLY_TRAINING_BAR_WIDTH,
                fill_char="█",
                empty_char="·",
                today=today,
            )
        )
        workout_bars.append(
            compress_activity_time_order(
                days,
                lambda d: _training_done_for_day(daily_data, d, "workout"),
                YEARLY_TRAINING_BAR_WIDTH,
                fill_char="█",
                empty_char="·",
                today=today,
            )
        )
        stretch_bars.append(
            compress_activity_time_order(
                days,
                lambda d: _training_done_for_day(daily_data, d, "stretch"),
                YEARLY_TRAINING_BAR_WIDTH,
                fill_char="█",
                empty_char="·",
                today=today,
            )
        )

    training_sections = [
        TrainingSection(
            title="MINDFUL",
            total_done=mindful_done_year,
            total_elapsed=elapsed_year,
            labels=quarter_labels,
            counts=[(d, t) for d, t, _ in mindful_counts],
            delta_labels=mindful_delta_labels,
            bar_width=YEARLY_TRAINING_BAR_WIDTH,
            bars_override=mindful_bars,
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
        quarter_wikilinks = []
        for i, _ in enumerate(quarter_ranges):
            quarter_wikilinks.append(f"[[{year}-Q{i + 1}\\|Q{i + 1}]]")
        procrastination_lines = build_procrastination_section(
            screen_time_totals,
            render_table(
                ScreenTrendTableSpec(
                    mode=ScreenTrendMode.PERIOD,
                    period_label="QTR",
                    period_ranges=quarter_ranges,
                    daily_data=daily_data,
                    labels=quarter_labels,
                    wikilinks=quarter_wikilinks,
                )
            ),
        )
        sections.append(trim_blank_lines(procrastination_lines))

    # SLEEP
    sleep_lines = ["### **SLEEP**"]
    sleep_chart_vals = []
    sleep_value_labels = []
    sleep_delta_labels = []

    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        sleep_mins_raw = [
            _sleep_minutes_for_day(daily_data, d) for d in days if daily_data.get(d)
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
            sleep_value_labels.append("" if start > today else "0h00m")

    sleep_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: _sleep_minutes_for_day(year_delta_data, d),
        baseline_bucket=prev_last_quarter_days,
        mode="average",
        today=today,
    )

    sleep_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=q_labels,
                values=sleep_chart_vals,
                value_labels=sleep_value_labels,
                profile=YEARLY_4QTR_METRIC,
                delta_labels=sleep_delta_labels,
            )
        )
    )
    sleep_lines.append("")

    awake_vals = [
        _awake_minutes_for_day(daily_data, d) for d in dates if daily_data.get(d)
    ]
    awakenings_vals = [
        _awakenings_for_day(daily_data, d) for d in dates if daily_data.get(d)
    ]
    awake_values: list[float] = [v for v in awake_vals if v is not None]
    awakening_values: list[int] = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_values) / len(awake_values) if awake_values else None
    avg_awakenings = (
        sum(awakening_values) / len(awakening_values) if awakening_values else None
    )
    sleep_avg = current_metrics["sleep_avg_minutes"]

    sleep_lines.extend(_sleep_stats_table_lines(sleep_avg, avg_awake, avg_awakenings))
    sleep_lines.append("")
    sections.append(trim_blank_lines(sleep_lines))

    # MOOD
    mood_lines = ["### **MOOD**"]
    mood_chart_vals = []
    mood_value_labels = []
    mood_delta_labels = []

    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        vals = [_mood_for_day(daily_data, d) for d in days if daily_data.get(d)]
        vals_clean = [v for v in vals if v is not None]
        if vals_clean:
            avg_val = sum(vals_clean) / len(vals_clean)
            mood_chart_vals.append(avg_val)
            mood_value_labels.append(DECIMAL_ONE_LABEL.format(avg_val))
        else:
            mood_chart_vals.append(0)
            mood_value_labels.append("" if start > today else "0.0")

    mood_delta_labels = compute_bucket_deltas(
        quarter_day_lists,
        value_for_day=lambda d: _mood_for_day(year_delta_data, d),
        baseline_bucket=prev_last_quarter_days,
        mode="average",
        today=today,
    )

    mood_lines.extend(
        render_chart(
            VerticalBarSpec(
                labels=q_labels,
                values=mood_chart_vals,
                value_labels=mood_value_labels,
                profile=YEARLY_4QTR_MOOD,
                delta_labels=mood_delta_labels,
            )
        )
    )
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    append_media_section(sections, media_bundle)

    return join_sections(sections)
