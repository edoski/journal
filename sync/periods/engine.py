"""Shared period metrics rendering engine."""

from __future__ import annotations

import datetime

from sync.constants import (
    DAYS,
    MONTH_ABBR,
    RENDER,
    STUDY_TARGET_MIN,
)
from sync.dates import (
    daterange,
    format_week_label,
    quarter_id,
    quarter_months,
    year_range,
)
from sync.formatting import (
    compute_percent_change,
    format_minutes,
    format_percent_change,
)
from sync.metrics import (
    aggregate_activity_totals,
    aggregate_screen_time,
    compute_moving_average,
    compute_period_deltas,
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
    MONTHLY_WEEK_METRIC,
    MONTHLY_WEEK_MOOD,
    MONTHLY_WEEK_STUDY,
    QUARTERLY_3MONTH_METRIC,
    QUARTERLY_3MONTH_MOOD,
    QUARTERLY_3MONTH_STUDY,
    WEEKLY_7DAY_CHART,
    WEEKLY_7DAY_MOOD,
    YEARLY_4QTR_METRIC,
    YEARLY_4QTR_MOOD,
    YEARLY_4QTR_STUDY,
    compress_activity_time_order,
    compress_days_time_order,
    render_bar_chart,
    render_monthly_study_grid,
    render_quarterly_study_coverage,
    render_screen_time_period_table,
    render_screen_time_trend_table,
    render_training_frequency_grid,
    render_training_quarter_block,
    render_weekly_study_grid,
    render_weekly_training_grid,
    render_yearly_study_coverage,
    wrap_code_block,
)
from sync.writers.tables import (
    render_activity_table,
    render_sleep_stats_table,
)

YEARLY_STUDY_BAR_WIDTH = 45
YEARLY_TRAINING_BAR_WIDTH = 45


def build_weekly_metrics(
    start_date,
    end_date,
    daily_data,
    prev_daily_data,
    prev_week_label,
    media_bundle,
    prior_week_metrics=None,
):
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

    study_minutes = [daily_data.get(d, {}).get("study_minutes") for d in dates]
    sleep_minutes = [daily_data.get(d, {}).get("sleep_minutes") for d in dates]
    mood_vals = [daily_data.get(d, {}).get("mood") for d in dates]

    sleep_avg = current_metrics["sleep_avg_minutes"]
    workout_days = current_metrics["workout_count"]
    stretch_days = current_metrics["stretch_count"]

    # Calculate study total from activity tables (more accurate than frontmatter)
    activity_totals = aggregate_activity_totals(dates, daily_data)
    study_total_from_activities = sum(activity_totals.values())

    sections = []

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
            study_values.append(
                format_minutes(m) if m is not None and m > 0 else "0h00m"
            )
    chart_lines = render_bar_chart(
        DAYS,
        study_hours,
        study_values,
        preset=WEEKLY_7DAY_CHART,
    )
    study_lines.extend(wrap_code_block(chart_lines))
    study_lines.append(
        f"**`SUM: {format_minutes(study_total_from_activities, always_show_both=True)}`**"
    )
    study_lines.append("")

    # Activity table (activity_totals already computed above)
    study_lines.extend(render_activity_table(activity_totals))
    study_lines.append("")

    current_week_date = today if start_date <= today <= end_date else None
    study_grid = render_weekly_study_grid(
        dates, daily_data, current_date=current_week_date
    )
    study_lines.extend(wrap_code_block(study_grid))
    study_lines.append("")

    # INTERRUPTIONS table
    append_interrupts_table(study_lines, dates, daily_data)
    sections.append(trim_blank_lines(study_lines))

    # TRAINING section
    training_lines = ["### **TRAINING**"]
    current_week_date = today if start_date <= today <= end_date else None
    mindful_days = current_metrics["mindful_count"]
    training_grid = render_weekly_training_grid(
        dates,
        daily_data,
        mindful_days,
        workout_days,
        stretch_days,
        current_date=current_week_date,
    )
    training_lines.extend(wrap_code_block(training_grid))
    training_lines.append("")
    append_training_type_table(training_lines, dates, daily_data)
    sections.append(trim_blank_lines(training_lines))

    # PROCRASTINATION section (screen time waterfall + trend table)
    screen_time_totals = aggregate_screen_time(dates, daily_data)
    screen_time_totals = group_screen_time_by_percent(screen_time_totals)
    procrastination_lines = build_procrastination_section(
        screen_time_totals,
        render_screen_time_trend_table(dates, daily_data),
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
            sleep_values.append(
                format_minutes(m) if m is not None and m > 0 else "0h00m"
            )
    sleep_chart = render_bar_chart(
        DAYS,
        sleep_hours,
        sleep_values,
        preset=WEEKLY_7DAY_CHART,
    )
    sleep_lines.extend(wrap_code_block(sleep_chart))
    sleep_lines.append("")

    awake_vals = [
        daily_data.get(d, {}).get("awake_minutes") for d in dates if daily_data.get(d)
    ]
    awakenings_vals = [
        daily_data.get(d, {}).get("awakenings") for d in dates if daily_data.get(d)
    ]
    awake_vals = [v for v in awake_vals if v is not None]
    awakenings_vals = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_vals) / len(awake_vals) if awake_vals else None
    avg_awakenings = (
        sum(awakenings_vals) / len(awakenings_vals) if awakenings_vals else None
    )

    sleep_lines.extend(render_sleep_stats_table(sleep_avg, avg_awake, avg_awakenings))
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
            mood_value_labels.append(f"{m:.1f}" if m is not None else "0.0")
    mood_chart = render_bar_chart(
        DAYS,
        mood_chart_vals,
        mood_value_labels,
        preset=WEEKLY_7DAY_MOOD,
    )
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    append_media_section(sections, media_bundle)

    return join_sections(sections)


def build_monthly_metrics(
    start_date,
    end_date,
    week_ranges,
    daily_data,
    prev_daily_data,
    current_month_label,
    prev_month_label,
    media_bundle,
    prior_month_metrics=None,
):
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

    sections = []

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
    study_week_raw = []
    study_chart_vals = []
    study_value_labels = []
    for start, end in week_ranges:
        label = format_week_label(start, end)
        week_labels.append(label)
        week_days = list(daterange(start, end))
        week_day_lists.append(week_days)
        raw_minutes = [daily_data.get(d, {}).get("study_minutes") for d in week_days]
        study_week_raw.append(raw_minutes)
        mins = [daily_data.get(d, {}).get("study_minutes") for d in week_days]
        mins = [m for m in mins if m is not None]
        total_min = sum(mins) if mins else 0
        study_chart_vals.append(
            round((total_min / 60) * 2) / 2
        )  # Round to nearest 0.5h
        # Always use 0h00m format for zero values
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(
                format_minutes(total_min) if total_min > 0 else "0h00m"
            )

    is_current_month = start_date.year == today.year and start_date.month == today.month
    study_delta_labels = []
    for idx, week_days in enumerate(week_day_lists):
        week_start = week_days[0]
        # Future weeks: blank
        if week_start > today and is_current_month:
            study_delta_labels.append("")
            continue
        # First week has no prior comparison
        if idx == 0:
            study_delta_labels.append("—")
            continue
        # Determine slice length (partial for active week)
        if is_current_month and week_start <= today <= week_days[-1]:
            days_elapsed = sum(1 for d in week_days if d <= today)
        else:
            days_elapsed = len(week_days)
        prev_week_days = week_day_lists[idx - 1]
        slice_len = min(days_elapsed, len(week_days))
        prev_slice_len = min(days_elapsed, len(prev_week_days))
        curr_vals = study_week_raw[idx][:slice_len]
        prev_vals = study_week_raw[idx - 1][:prev_slice_len]
        curr_sum = sum(v for v in curr_vals if v is not None)
        prev_sum = sum(v for v in prev_vals if v is not None)
        delta = compute_percent_change(curr_sum, prev_sum)
        study_delta_labels.append(format_percent_change(delta))

    chart_lines = render_bar_chart(
        week_labels,
        study_chart_vals,
        study_value_labels,
        preset=MONTHLY_WEEK_STUDY,
        delta_labels=study_delta_labels,
    )
    study_lines.extend(wrap_code_block(chart_lines))
    study_lines.append(
        f"**`SUM: {format_minutes(study_total_from_activities, always_show_both=True)}`**"
    )
    study_lines.append("")

    # Activity table (activity_totals already computed above)
    study_lines.extend(render_activity_table(activity_totals))
    study_lines.append("")

    # Full-study-day deltas per week (mirror training delta behavior)
    study_week_done = []
    for week_days in week_day_lists:
        done = sum(
            1
            for d in week_days
            if (daily_data.get(d, {}).get("study_minutes") or 0) >= STUDY_TARGET_MIN
        )
        study_week_done.append(done)

    study_grid_delta_labels = []
    for idx, week_days in enumerate(week_day_lists):
        week_start = week_days[0]
        if is_current_month and week_start > today:
            study_grid_delta_labels.append("")
            continue
        if idx == 0:
            study_grid_delta_labels.append("—")
            continue
        delta = compute_percent_change(study_week_done[idx], study_week_done[idx - 1])
        study_grid_delta_labels.append(format_percent_change(delta))

    current_month_date = today if is_current_month else None
    study_grid = render_monthly_study_grid(
        week_ranges,
        daily_data,
        current_date=current_month_date,
        delta_labels=study_grid_delta_labels,
    )
    study_lines.extend(wrap_code_block(study_grid))
    study_lines.append("")

    # INTERRUPTIONS table
    append_interrupts_table(study_lines, dates, daily_data)
    sections.append(trim_blank_lines(study_lines))

    # TRAINING section
    training_lines = ["### **TRAINING**"]
    mindful_delta_labels = []
    workout_delta_labels = []
    stretch_delta_labels = []
    for idx, week_days in enumerate(week_day_lists):
        week_start = week_days[0]
        if is_current_month and week_start > today:
            mindful_delta_labels.append("")
            workout_delta_labels.append("")
            stretch_delta_labels.append("")
            continue
        if idx == 0:
            mindful_delta_labels.append("—")
            workout_delta_labels.append("—")
            stretch_delta_labels.append("—")
            continue

        prev_week_days = week_day_lists[idx - 1]

        # Compare full periods (no partial-window truncation)
        curr_mindful_count = sum(
            1 for d in week_days if daily_data.get(d, {}).get("meditate")
        )
        prev_mindful_count = sum(
            1 for d in prev_week_days if daily_data.get(d, {}).get("meditate")
        )
        mindful_delta = compute_percent_change(curr_mindful_count, prev_mindful_count)
        mindful_delta_labels.append(format_percent_change(mindful_delta))

        curr_workout_count = sum(
            1 for d in week_days if daily_data.get(d, {}).get("workout")
        )
        prev_workout_count = sum(
            1 for d in prev_week_days if daily_data.get(d, {}).get("workout")
        )
        workout_delta = compute_percent_change(curr_workout_count, prev_workout_count)
        workout_delta_labels.append(format_percent_change(workout_delta))

        curr_stretch_count = sum(
            1 for d in week_days if daily_data.get(d, {}).get("stretch")
        )
        prev_stretch_count = sum(
            1 for d in prev_week_days if daily_data.get(d, {}).get("stretch")
        )
        stretch_delta = compute_percent_change(curr_stretch_count, prev_stretch_count)
        stretch_delta_labels.append(format_percent_change(stretch_delta))

    mindful_days = current_metrics["mindful_count"]
    training_grid = render_training_frequency_grid(
        week_ranges,
        daily_data,
        mindful_days,
        workout_days,
        stretch_days,
        days_in_period,
        mindful_delta_labels=mindful_delta_labels,
        workout_delta_labels=workout_delta_labels,
        stretch_delta_labels=stretch_delta_labels,
        current_date=current_month_date,
    )
    # Inject counts into headers of the grid lines
    elapsed_days = current_metrics.get("days_up_to_today", days_in_period)
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

    training_lines.extend(wrap_code_block(training_grid))
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
            render_screen_time_period_table(
                week_ranges, daily_data, "WEEK", week_labels, week_wikilinks
            ),
        )
        sections.append(trim_blank_lines(procrastination_lines))

    # SLEEP section (5-char bars, weekly averages)
    sleep_lines = ["### **SLEEP**"]
    sleep_week_raw = []
    sleep_chart_vals = []
    sleep_value_labels = []
    for week_days in week_day_lists:
        mins_raw = [daily_data.get(d, {}).get("sleep_minutes") for d in week_days]
        sleep_week_raw.append(mins_raw)
        mins = [m for m in mins_raw if m is not None]
        start = week_days[0]
        if mins:
            avg_min = sum(mins) / len(mins)  # AVERAGE for sleep
            sleep_chart_vals.append(
                round((avg_min / 60) * 2) / 2
            )  # Round to nearest 0.5h
            if start > today:
                sleep_value_labels.append("")
            else:
                sleep_value_labels.append(format_minutes(avg_min))
        else:
            sleep_chart_vals.append(0)
            if start > today:
                sleep_value_labels.append("")
            else:
                sleep_value_labels.append("0h00m")

    sleep_delta_labels = []
    for idx, week_days in enumerate(week_day_lists):
        week_start = week_days[0]
        if week_start > today and is_current_month:
            sleep_delta_labels.append("")
            continue
        if idx == 0:
            sleep_delta_labels.append("—")
            continue
        if is_current_month and week_start <= today <= week_days[-1]:
            days_elapsed = sum(1 for d in week_days if d <= today)
        else:
            days_elapsed = len(week_days)
        prev_week_days = week_day_lists[idx - 1]
        slice_len = min(days_elapsed, len(week_days))
        prev_slice_len = min(days_elapsed, len(prev_week_days))
        curr_vals = [v for v in sleep_week_raw[idx][:slice_len] if v is not None]
        prev_vals = [
            v for v in sleep_week_raw[idx - 1][:prev_slice_len] if v is not None
        ]
        curr_avg = (sum(curr_vals) / len(curr_vals)) if curr_vals else 0
        prev_avg = (sum(prev_vals) / len(prev_vals)) if prev_vals else 0
        delta = compute_percent_change(curr_avg, prev_avg)
        sleep_delta_labels.append(format_percent_change(delta))

    sleep_chart = render_bar_chart(
        week_labels,
        sleep_chart_vals,
        sleep_value_labels,
        preset=MONTHLY_WEEK_METRIC,
        delta_labels=sleep_delta_labels,
    )
    sleep_lines.extend(wrap_code_block(sleep_chart))
    sleep_lines.append("")

    awake_vals = [
        daily_data.get(d, {}).get("awake_minutes") for d in dates if daily_data.get(d)
    ]
    awakenings_vals = [
        daily_data.get(d, {}).get("awakenings") for d in dates if daily_data.get(d)
    ]
    awake_vals = [v for v in awake_vals if v is not None]
    awakenings_vals = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_vals) / len(awake_vals) if awake_vals else None
    avg_awakenings = (
        sum(awakenings_vals) / len(awakenings_vals) if awakenings_vals else None
    )

    sleep_lines.extend(render_sleep_stats_table(sleep_avg, avg_awake, avg_awakenings))
    sleep_lines.append("")
    sections.append(trim_blank_lines(sleep_lines))

    # MOOD section (5-char bars, weekly averages, always show decimal)
    mood_lines = ["### **MOOD**"]
    mood_week_raw = []
    mood_chart_vals = []
    mood_value_labels = []
    for week_days in week_day_lists:
        vals_raw = [daily_data.get(d, {}).get("mood") for d in week_days]
        mood_week_raw.append(vals_raw)
        vals = [v for v in vals_raw if v is not None]
        start = week_days[0]
        if vals:
            avg_val = sum(vals) / len(vals)  # AVERAGE for mood
            mood_chart_vals.append(avg_val)
            # Always show one decimal for mood (e.g., 5.0, 6.0, 10.0)
            if start > today:
                mood_value_labels.append("")
            else:
                mood_value_labels.append(f"{avg_val:.1f}")
        else:
            mood_chart_vals.append(0)
            if start > today:
                mood_value_labels.append("")
            else:
                mood_value_labels.append("0.0")

    mood_delta_labels = []
    for idx, week_days in enumerate(week_day_lists):
        week_start = week_days[0]
        if week_start > today and is_current_month:
            mood_delta_labels.append("")
            continue
        if idx == 0:
            mood_delta_labels.append("—")
            continue
        if is_current_month and week_start <= today <= week_days[-1]:
            days_elapsed = sum(1 for d in week_days if d <= today)
        else:
            days_elapsed = len(week_days)
        prev_week_days = week_day_lists[idx - 1]
        slice_len = min(days_elapsed, len(week_days))
        prev_slice_len = min(days_elapsed, len(prev_week_days))
        curr_vals = [v for v in mood_week_raw[idx][:slice_len] if v is not None]
        prev_vals = [
            v for v in mood_week_raw[idx - 1][:prev_slice_len] if v is not None
        ]
        curr_avg = (sum(curr_vals) / len(curr_vals)) if curr_vals else 0
        prev_avg = (sum(prev_vals) / len(prev_vals)) if prev_vals else 0
        delta = compute_percent_change(curr_avg, prev_avg)
        mood_delta_labels.append(format_percent_change(delta))

    mood_chart = render_bar_chart(
        week_labels,
        mood_chart_vals,
        mood_value_labels,
        preset=MONTHLY_WEEK_MOOD,
        delta_labels=mood_delta_labels,
    )
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    append_media_section(sections, media_bundle)

    return join_sections(sections)


def render_quarterly_training_bars(
    month_ranges, daily_data, activity_key, delta_labels
):
    """
    Render per-month rows for workout/stretch with dense bars, counts, and deltas.
    Spacing mirrors the requested layout (no symbol spacing; counts aligned).
    """
    lines = []
    bars = []
    counts = []
    max_bar_len = 0
    max_count_len = 0

    today = datetime.date.today()
    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        days = list(daterange(start, end))
        bar_chars = []
        done = 0
        for d in days:
            if d > today:
                bar_chars.append("·")
            elif daily_data.get(d, {}).get(activity_key):
                bar_chars.append("█")
                done += 1
            else:
                bar_chars.append("·")
        bar = "".join(bar_chars)
        bars.append((label, bar, done, len(days)))
        count_str = f"({done:02d}/{len(days):02d})"
        counts.append(count_str)
        max_bar_len = max(max_bar_len, len(bar))
        max_count_len = max(max_count_len, len(count_str))

    for idx, ((label, bar, done, total_days), count_str) in enumerate(
        zip(bars, counts)
    ):
        pad_between_bar_and_count = (
            max_bar_len - len(bar)
        ) + 1  # base 1-space plus padding to align counts
        delta_str = (
            delta_labels[idx] if delta_labels and idx < len(delta_labels) else ""
        )
        # Right-pad delta to 4 chars for consistent column; prefix single space
        delta_formatted = delta_str.rjust(4) if delta_str else ""
        line = (
            f"│ {label} {bar}"
            f"{' ' * pad_between_bar_and_count}"
            f"{count_str.rjust(max_count_len)}"
        )
        if delta_formatted:
            line += f"   {delta_formatted}"
        lines.append(line)
    return lines


def build_quarterly_metrics(
    quarter_start,
    quarter_end,
    month_ranges,
    daily_data,
    prev_daily_data,
    prev_year,
    prev_quarter,
    media_bundle,
    prior_quarter_metrics=None,
):
    today = datetime.date.today()
    sections = []

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

    # STUDY
    study_lines = ["### **STUDY**"]
    month_labels = []
    study_chart_vals = []
    study_value_labels = []
    study_totals_minutes = []
    activity_totals = {}

    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        month_labels.append(label)
        days = list(daterange(start, end))
        total_min = 0
        for d in days:
            daily = daily_data.get(d, {})
            for activity, mins in daily.get("activity_totals", {}).items():
                activity_totals[activity] = activity_totals.get(activity, 0) + mins
                total_min += mins
        hours = round((total_min / 60) * 2) / 2  # Round to nearest 0.5h
        study_chart_vals.append(hours)
        study_totals_minutes.append(total_min)
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(
                format_minutes(total_min) if total_min > 0 else "0h00m"
            )

    study_delta_labels = []
    for idx, start in enumerate([m[0] for m in month_ranges]):
        if start > today:
            study_delta_labels.append("")
            continue
        if idx == 0:
            study_delta_labels.append("—")
            continue
        curr = study_totals_minutes[idx]
        prev = study_totals_minutes[idx - 1]
        delta = compute_percent_change(curr, prev)
        study_delta_labels.append(format_percent_change(delta))

    chart_lines = render_bar_chart(
        month_labels,
        study_chart_vals,
        study_value_labels,
        preset=QUARTERLY_3MONTH_STUDY,
        delta_labels=study_delta_labels,
    )
    study_lines.extend(wrap_code_block(chart_lines))
    study_lines.append(
        f"**`SUM: {format_minutes(sum(activity_totals.values()), always_show_both=True)}`**"
    )
    study_lines.append("")

    study_lines.extend(render_activity_table(activity_totals))
    study_lines.append("")

    study_counts = []
    for start, end in month_ranges:
        days = list(daterange(start, end))
        elapsed = sum(1 for d in days if d <= today)
        done = sum(
            1
            for d in days
            if d <= today
            and (daily_data.get(d, {}).get("study_minutes") or 0) >= STUDY_TARGET_MIN
        )
        study_counts.append((done, elapsed, start))

    prev_study_baseline = None
    if prev_last_month_range:
        prev_days = list(daterange(prev_last_month_range[0], prev_last_month_range[1]))
        prev_study_baseline = sum(
            1
            for d in prev_days
            if d <= today
            and (prev_daily_data.get(d, {}).get("study_minutes") or 0)
            >= STUDY_TARGET_MIN
        )

    study_delta_labels = compute_period_deltas(study_counts, prev_study_baseline, today)

    study_grid = render_quarterly_study_coverage(
        month_ranges,
        daily_data,
        today=today,
        delta_labels=study_delta_labels,
    )
    study_lines.extend(wrap_code_block(study_grid))
    study_lines.append("")

    append_interrupts_table(study_lines, dates, daily_data)
    sections.append(trim_blank_lines(study_lines))

    # TRAINING
    training_lines = ["### **TRAINING**"]

    # Per-month counts + deltas (compare each month to previous; first month vs last month of previous quarter)
    month_labels = [MONTH_ABBR[m[0].month - 1] for m in month_ranges]

    def _month_count(range_tuple, key, source_data):
        start, end = range_tuple
        days = list(daterange(start, end))
        elapsed = sum(1 for d in days if d <= today)
        done = sum(1 for d in days if d <= today and source_data.get(d, {}).get(key))
        return done, elapsed, start

    mindful_counts = [_month_count(rng, "meditate", daily_data) for rng in month_ranges]
    workout_counts = [_month_count(rng, "workout", daily_data) for rng in month_ranges]
    stretch_counts = [_month_count(rng, "stretch", daily_data) for rng in month_ranges]
    if prev_last_month_range:
        prev_mindful_baseline = _month_count(
            prev_last_month_range, "meditate", prev_daily_data
        )[0]
        prev_workout_baseline = _month_count(
            prev_last_month_range, "workout", prev_daily_data
        )[0]
        prev_stretch_baseline = _month_count(
            prev_last_month_range, "stretch", prev_daily_data
        )[0]
    else:
        prev_mindful_baseline = None
        prev_workout_baseline = None
        prev_stretch_baseline = None

    mindful_delta_labels = compute_period_deltas(
        mindful_counts, prev_mindful_baseline, today
    )
    workout_delta_labels = compute_period_deltas(
        workout_counts, prev_workout_baseline, today
    )
    stretch_delta_labels = compute_period_deltas(
        stretch_counts, prev_stretch_baseline, today
    )

    def _build_training_block(title, activity_key, counts, deltas):
        total_done = sum(d for d, _, _ in counts)
        total_elapsed = sum(e for _, e, _ in counts)
        block = [f"┌ {title} ({total_done:02d}/{total_elapsed:02d})", "│"]
        block.extend(
            render_quarterly_training_bars(
                month_ranges, daily_data, activity_key, deltas
            )
        )
        block.append("└")
        return block

    training_block = []
    training_block.extend(
        _build_training_block(
            "MINDFUL", "meditate", mindful_counts, mindful_delta_labels
        )
    )
    training_block.append("")  # blank line between blocks
    training_block.extend(
        _build_training_block(
            "WORKOUT", "workout", workout_counts, workout_delta_labels
        )
    )
    training_block.append(
        ""
    )  # blank line between workout and stretch inside same block
    training_block.extend(
        _build_training_block(
            "STRETCH", "stretch", stretch_counts, stretch_delta_labels
        )
    )
    training_lines.extend(wrap_code_block(training_block))
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
            render_screen_time_period_table(
                month_ranges, daily_data, "MONTH", month_labels, month_wikilinks
            ),
        )
        sections.append(trim_blank_lines(procrastination_lines))

    # SLEEP
    sleep_lines = ["### **SLEEP**"]
    sleep_labels = []
    sleep_chart_vals = []
    sleep_avgs_minutes = []
    sleep_value_labels = []
    awake_vals = []
    awakenings_vals = []
    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        sleep_labels.append(label)
        days = list(daterange(start, end))
        mins = [
            daily_data.get(d, {}).get("sleep_minutes")
            for d in days
            if daily_data.get(d)
        ]
        mins_clean = [m for m in mins if m is not None]
        if mins_clean:
            avg_min = sum(mins_clean) / len(mins_clean)
            sleep_chart_vals.append(
                round((avg_min / 60) * 2) / 2
            )  # Round to nearest 0.5h
            sleep_avgs_minutes.append(avg_min)
            sleep_value_labels.append(format_minutes(avg_min))
        else:
            sleep_chart_vals.append(0)
            sleep_avgs_minutes.append(0)
            sleep_value_labels.append("0h00m" if start <= today else "")

        awake_vals.extend(
            [
                daily_data.get(d, {}).get("awake_minutes")
                for d in days
                if daily_data.get(d)
            ]
        )
        awakenings_vals.extend(
            [daily_data.get(d, {}).get("awakenings") for d in days if daily_data.get(d)]
        )

    sleep_delta_labels = []
    for idx, start in enumerate([m[0] for m in month_ranges]):
        if start > today:
            sleep_delta_labels.append("")
            continue
        if idx == 0:
            sleep_delta_labels.append("—")
            continue
        curr = sleep_avgs_minutes[idx]
        prev = sleep_avgs_minutes[idx - 1]
        delta = compute_percent_change(curr, prev)
        sleep_delta_labels.append(format_percent_change(delta))

    sleep_chart = render_bar_chart(
        sleep_labels,
        sleep_chart_vals,
        sleep_value_labels,
        preset=QUARTERLY_3MONTH_METRIC,
        delta_labels=sleep_delta_labels,
    )
    sleep_lines.extend(wrap_code_block(sleep_chart))
    sleep_lines.append("")

    awake_vals = [v for v in awake_vals if v is not None]
    awakenings_vals = [v for v in awakenings_vals if v is not None]
    sleep_avg = current_metrics.get("sleep_avg_minutes")
    avg_awake = sum(awake_vals) / len(awake_vals) if awake_vals else None
    avg_awakenings = (
        sum(awakenings_vals) / len(awakenings_vals) if awakenings_vals else None
    )

    sleep_lines.extend(render_sleep_stats_table(sleep_avg, avg_awake, avg_awakenings))
    sleep_lines.append("")
    sections.append(trim_blank_lines(sleep_lines))

    # MOOD
    mood_lines = ["### **MOOD**"]
    mood_labels = []
    mood_chart_vals = []
    mood_value_labels = []
    mood_avgs = []
    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        mood_labels.append(label)
        days = list(daterange(start, end))
        vals = [daily_data.get(d, {}).get("mood") for d in days if daily_data.get(d)]
        vals_clean = [v for v in vals if v is not None]
        if vals_clean:
            avg_val = sum(vals_clean) / len(vals_clean)
            mood_chart_vals.append(avg_val)
            mood_avgs.append(avg_val)
            mood_value_labels.append(f"{avg_val:.1f}")
        else:
            mood_chart_vals.append(0)
            mood_avgs.append(0)
            mood_value_labels.append("0.0" if start <= today else "")

    mood_delta_labels = []
    for idx, start in enumerate([m[0] for m in month_ranges]):
        if start > today:
            mood_delta_labels.append("")
            continue
        if idx == 0:
            mood_delta_labels.append("—")
            continue
        curr = mood_avgs[idx]
        prev = mood_avgs[idx - 1]
        delta = compute_percent_change(curr, prev)
        mood_delta_labels.append(format_percent_change(delta))

    mood_chart = render_bar_chart(
        mood_labels,
        mood_chart_vals,
        mood_value_labels,
        preset=QUARTERLY_3MONTH_MOOD,
        delta_labels=mood_delta_labels,
    )
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    append_media_section(sections, media_bundle)

    return join_sections(sections)


def _quarter_totals(daily_data, quarter_ranges):
    totals = []
    for start, end in quarter_ranges:
        total_min = 0
        for d in daterange(start, end):
            daily = daily_data.get(d)
            if not daily:
                continue
            total_min += sum(daily.get("activity_totals", {}).values())
        totals.append(total_min)
    return totals


def build_yearly_metrics(
    year,
    year_start,
    year_end,
    quarter_ranges,
    prev_quarter_ranges,
    daily_data,
    prev_daily_data,
    media_bundle,
    prior_year_metrics=None,
):
    today = datetime.date.today()
    sections = []

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

    # STUDY (quarter bars, y_max=720h)
    study_lines = ["### **STUDY**"]
    q_labels = [f"Q{i + 1}" for i in range(4)]
    prev_quarter_totals = _quarter_totals(prev_daily_data, prev_quarter_ranges)

    activity_totals = {}
    study_totals_minutes = []
    study_values_hours = []
    study_value_labels = []
    study_delta_labels = []

    for start, end in quarter_ranges:
        total_min = 0
        for d in daterange(start, end):
            daily = daily_data.get(d)
            if not daily:
                continue
            for activity, mins in daily.get("activity_totals", {}).items():
                activity_totals[activity] = activity_totals.get(activity, 0) + mins
                total_min += mins

        study_totals_minutes.append(total_min)
        study_values_hours.append(
            round((total_min / 60) * 2) / 2 if total_min else 0
        )  # Round to nearest 0.5h
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(
                format_minutes(total_min) if total_min > 0 else "0h00m"
            )

    for idx, (start, _) in enumerate(quarter_ranges):
        if start > today:
            study_delta_labels.append("")
            continue
        if idx == 0:
            prev_val = prev_quarter_totals[-1] if prev_quarter_totals else None
        else:
            prev_val = study_totals_minutes[idx - 1]
        delta = compute_percent_change(study_totals_minutes[idx], prev_val)
        study_delta_labels.append(format_percent_change(delta))

    study_chart = render_bar_chart(
        q_labels,
        study_values_hours,
        study_value_labels,
        preset=YEARLY_4QTR_STUDY,
        delta_labels=study_delta_labels,
    )
    study_lines.extend(wrap_code_block(study_chart))
    study_lines.append(
        f"**`SUM: {format_minutes(sum(activity_totals.values()), always_show_both=True)}`**"
    )
    study_lines.append("")

    study_lines.extend(render_activity_table(activity_totals))
    study_lines.append("")

    # Compute per-quarter full-study day counts (only elapsed days) for deltas
    study_counts = []
    study_bars = []
    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        elapsed_days = sum(1 for d in days if d <= today)
        done = sum(
            1
            for d in days
            if d <= today
            and (daily_data.get(d, {}).get("study_minutes") or 0) >= STUDY_TARGET_MIN
        )
        study_counts.append((done, elapsed_days, start))
        bar = compress_days_time_order(
            days,
            lambda d: (
                (daily_data.get(d, {}).get("study_minutes") or 0) >= STUDY_TARGET_MIN
            ),
            YEARLY_STUDY_BAR_WIDTH,
            allow_partial=True,
            fill_char=RENDER.study_symbol_deep,
            partial_char="░",
            empty_char=RENDER.study_symbol_none,
            today=today,
        )
        study_bars.append(bar)

    prev_study_baseline = None
    if prev_quarter_ranges:
        prev_q_start, prev_q_end = prev_quarter_ranges[-1]
        prev_days = list(daterange(prev_q_start, prev_q_end))
        prev_study_baseline = sum(
            1
            for d in prev_days
            if d <= today
            and (prev_daily_data.get(d, {}).get("study_minutes") or 0)
            >= STUDY_TARGET_MIN
        )

    study_delta_labels = []
    for idx, (done, _, start) in enumerate(study_counts):
        if start > today:
            study_delta_labels.append("")
            continue
        if idx == 0:
            prev_val = prev_study_baseline
        else:
            prev_val = study_counts[idx - 1][0]
        delta = compute_percent_change(done, prev_val)
        study_delta_labels.append(format_percent_change(delta))

    study_grid = render_yearly_study_coverage(
        quarter_ranges,
        daily_data,
        today=today,
        bar_width=YEARLY_STUDY_BAR_WIDTH,
        delta_labels=study_delta_labels,
        bars_override=study_bars,
        legend_line=RENDER.yearly_study_legend,
    )
    study_lines.extend(wrap_code_block(study_grid))
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
            1 for d in days if d <= today and daily_data.get(d, {}).get("meditate")
        )
        workout_done = sum(
            1 for d in days if d <= today and daily_data.get(d, {}).get("workout")
        )
        stretch_done = sum(
            1 for d in days if d <= today and daily_data.get(d, {}).get("stretch")
        )
        mindful_counts.append((mindful_done, elapsed_days, start))
        workout_counts.append((workout_done, elapsed_days, start))
        stretch_counts.append((stretch_done, elapsed_days, start))
        mindful_done_year += mindful_done
        workout_done_year += workout_done
        stretch_done_year += stretch_done
        elapsed_year += elapsed_days

    # Baseline is last quarter of previous year
    prev_mindful_baseline = None
    prev_workout_baseline = None
    prev_stretch_baseline = None
    if prev_quarter_ranges:
        last_q_start, last_q_end = prev_quarter_ranges[-1]
        prev_days = list(daterange(last_q_start, last_q_end))
        prev_mindful_baseline = sum(
            1 for d in prev_days if prev_daily_data.get(d, {}).get("meditate")
        )
        prev_workout_baseline = sum(
            1 for d in prev_days if prev_daily_data.get(d, {}).get("workout")
        )
        prev_stretch_baseline = sum(
            1 for d in prev_days if prev_daily_data.get(d, {}).get("stretch")
        )

    mindful_delta_labels = compute_period_deltas(
        mindful_counts, prev_mindful_baseline, today
    )
    workout_delta_labels = compute_period_deltas(
        workout_counts, prev_workout_baseline, today
    )
    stretch_delta_labels = compute_period_deltas(
        stretch_counts, prev_stretch_baseline, today
    )

    mindful_bars = []
    workout_bars = []
    stretch_bars = []
    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        mindful_bars.append(
            compress_activity_time_order(
                days,
                lambda d: daily_data.get(d, {}).get("meditate"),
                YEARLY_TRAINING_BAR_WIDTH,
                fill_char="█",
                empty_char="·",
                today=today,
            )
        )
        workout_bars.append(
            compress_activity_time_order(
                days,
                lambda d: daily_data.get(d, {}).get("workout"),
                YEARLY_TRAINING_BAR_WIDTH,
                fill_char="█",
                empty_char="·",
                today=today,
            )
        )
        stretch_bars.append(
            compress_activity_time_order(
                days,
                lambda d: daily_data.get(d, {}).get("stretch"),
                YEARLY_TRAINING_BAR_WIDTH,
                fill_char="█",
                empty_char="·",
                today=today,
            )
        )

    mindful_block = [f"┌ MINDFUL ({mindful_done_year:02d}/{elapsed_year:02d})", "│"]
    mindful_block.extend(
        render_training_quarter_block(
            quarter_labels,
            [(d, t) for d, t, _ in mindful_counts],
            mindful_delta_labels,
            bar_width=YEARLY_TRAINING_BAR_WIDTH,
            bars_override=mindful_bars,
            fill_char="█",
            empty_char="·",
        )
    )
    mindful_block.append("└")

    workout_block = [f"┌ WORKOUT ({workout_done_year:02d}/{elapsed_year:02d})", "│"]
    workout_block.extend(
        render_training_quarter_block(
            quarter_labels,
            [(d, t) for d, t, _ in workout_counts],
            workout_delta_labels,
            bar_width=YEARLY_TRAINING_BAR_WIDTH,
            bars_override=workout_bars,
            fill_char="█",
            empty_char="·",
        )
    )
    workout_block.append("└")

    stretch_block = [f"┌ STRETCH ({stretch_done_year:02d}/{elapsed_year:02d})", "│"]
    stretch_block.extend(
        render_training_quarter_block(
            quarter_labels,
            [(d, t) for d, t, _ in stretch_counts],
            stretch_delta_labels,
            bar_width=YEARLY_TRAINING_BAR_WIDTH,
            bars_override=stretch_bars,
            fill_char="█",
            empty_char="·",
        )
    )
    stretch_block.append("└")

    training_lines.extend(
        wrap_code_block(mindful_block + [""] + workout_block + [""] + stretch_block)
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
            render_screen_time_period_table(
                quarter_ranges, daily_data, "QTR", quarter_labels, quarter_wikilinks
            ),
        )
        sections.append(trim_blank_lines(procrastination_lines))

    # SLEEP
    sleep_lines = ["### **SLEEP**"]
    sleep_chart_vals = []
    sleep_value_labels = []
    sleep_avgs_minutes = []
    sleep_delta_labels = []

    # Previous year's Q4 baseline for Q1 deltas
    prev_q4_sleep_avg = None
    if prev_quarter_ranges:
        prev_q4_start, prev_q4_end = prev_quarter_ranges[-1]
        prev_q4_days = list(daterange(prev_q4_start, prev_q4_end))
        prev_q4_vals = [
            prev_daily_data.get(d, {}).get("sleep_minutes")
            for d in prev_q4_days
            if prev_daily_data.get(d)
        ]
        prev_q4_vals = [v for v in prev_q4_vals if v is not None]
        prev_q4_sleep_avg = (
            (sum(prev_q4_vals) / len(prev_q4_vals)) if prev_q4_vals else None
        )

    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        mins = [
            daily_data.get(d, {}).get("sleep_minutes")
            for d in days
            if daily_data.get(d)
        ]
        mins_clean = [m for m in mins if m is not None]
        if mins_clean:
            avg_min = sum(mins_clean) / len(mins_clean)
            sleep_chart_vals.append(
                round((avg_min / 60) * 2) / 2
            )  # Round to nearest 0.5h
            sleep_avgs_minutes.append(avg_min)
            sleep_value_labels.append(format_minutes(avg_min))
        else:
            sleep_chart_vals.append(0)
            sleep_avgs_minutes.append(0)
            sleep_value_labels.append("" if start > today else "0h00m")

    for idx, (start, _) in enumerate(quarter_ranges):
        if start > today:
            sleep_delta_labels.append("")
            continue
        if idx == 0:
            prev_avg = prev_q4_sleep_avg
        else:
            prev_avg = sleep_avgs_minutes[idx - 1]
        delta = compute_percent_change(sleep_avgs_minutes[idx], prev_avg)
        sleep_delta_labels.append(format_percent_change(delta))

    sleep_chart = render_bar_chart(
        q_labels,
        sleep_chart_vals,
        sleep_value_labels,
        preset=YEARLY_4QTR_METRIC,
        delta_labels=sleep_delta_labels,
    )
    sleep_lines.extend(wrap_code_block(sleep_chart))
    sleep_lines.append("")

    awake_vals = [
        daily_data.get(d, {}).get("awake_minutes") for d in dates if daily_data.get(d)
    ]
    awakenings_vals = [
        daily_data.get(d, {}).get("awakenings") for d in dates if daily_data.get(d)
    ]
    awake_vals = [v for v in awake_vals if v is not None]
    awakenings_vals = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_vals) / len(awake_vals) if awake_vals else None
    avg_awakenings = (
        sum(awakenings_vals) / len(awakenings_vals) if awakenings_vals else None
    )
    sleep_avg = current_metrics.get("sleep_avg_minutes")

    sleep_lines.extend(render_sleep_stats_table(sleep_avg, avg_awake, avg_awakenings))
    sleep_lines.append("")
    sections.append(trim_blank_lines(sleep_lines))

    # MOOD
    mood_lines = ["### **MOOD**"]
    mood_chart_vals = []
    mood_value_labels = []
    mood_avgs = []
    mood_delta_labels = []

    prev_q4_mood_avg = None
    if prev_quarter_ranges:
        prev_q4_start, prev_q4_end = prev_quarter_ranges[-1]
        prev_q4_days = list(daterange(prev_q4_start, prev_q4_end))
        prev_q4_vals = [
            prev_daily_data.get(d, {}).get("mood")
            for d in prev_q4_days
            if prev_daily_data.get(d)
        ]
        prev_q4_vals = [v for v in prev_q4_vals if v is not None]
        prev_q4_mood_avg = (
            (sum(prev_q4_vals) / len(prev_q4_vals)) if prev_q4_vals else None
        )

    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        vals = [daily_data.get(d, {}).get("mood") for d in days if daily_data.get(d)]
        vals_clean = [v for v in vals if v is not None]
        if vals_clean:
            avg_val = sum(vals_clean) / len(vals_clean)
            mood_chart_vals.append(avg_val)
            mood_avgs.append(avg_val)
            mood_value_labels.append(f"{avg_val:.1f}")
        else:
            mood_chart_vals.append(0)
            mood_avgs.append(0)
            mood_value_labels.append("" if start > today else "0.0")

    for idx, (start, _) in enumerate(quarter_ranges):
        if start > today:
            mood_delta_labels.append("")
            continue
        if idx == 0:
            prev_avg = prev_q4_mood_avg
        else:
            prev_avg = mood_avgs[idx - 1]
        delta = compute_percent_change(mood_avgs[idx], prev_avg)
        mood_delta_labels.append(format_percent_change(delta))

    mood_chart = render_bar_chart(
        q_labels,
        mood_chart_vals,
        mood_value_labels,
        preset=YEARLY_4QTR_MOOD,
        delta_labels=mood_delta_labels,
    )
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    append_media_section(sections, media_bundle)

    return join_sections(sections)
