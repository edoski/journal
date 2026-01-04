#!/usr/bin/env python3
import argparse
import datetime
import os

from sync.constants import (
    YEARLY_TEMPLATE_PATH,
    DEFAULT_YEARLY_DIR,
    YEARLY_STUDY_LEGEND_LINE,
    STUDY_TARGET_MIN,
    STUDY_SYMBOL_DEEP,
    STUDY_SYMBOL_NONE,
)
from sync.notes import (
    locked_note,
    ensure_note,
    replace_metrics_block,
    goals_section_bounds,
    extract_subsection_tasks,
    trim_blank_lines,
)
from sync.dates import daterange, year_range, year_quarters
from sync.formatting import (
    format_minutes,
    compute_percent_change,
    format_percent_change,
)
from sync.metrics import (
    load_daily_data,
    compute_period_metrics,
    aggregate_interrupt_overrun,
    compute_period_deltas,
    compute_moving_average,
    aggregate_screen_time,
)
from sync.writers.tables import (
    render_summary_table,
    render_sleep_stats_table,
    render_activity_table,
    render_interrupts_table,
    render_ideals_table,
)
from sync.writers.charts import (
    render_bar_chart,
    render_training_quarter_block,
    render_yearly_study_coverage,
    wrap_code_block,
    compress_activity_time_order,
    _compress_days_time_order,
    render_waterfall_chart,
    render_screen_time_period_table,
)
from sync.writers.goals import render_goal_lines, build_goals_block
from sync.writers.media import build_media_section
from sync.readers.goals import ensure_goal_ids

from sync.base import atomic_write_note

YEARLY_STUDY_BAR_WIDTH = 45
YEARLY_TRAINING_BAR_WIDTH = 45


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
    summary_lines = render_summary_table(
        current_metrics,
        prev_metrics,
        "THIS YEAR",
        f"**[[{year - 1}\\|LAST YEAR]]**",
        ma_metrics=ma_metrics,
        ma_label="3-YR AVG" if ma_metrics else None,
        ma_training_unit="yr",
    )
    # Add IDEALS progress table
    days_in_year = (year_end - year_start).days + 1
    ideals_lines = render_ideals_table(
        study_total_minutes=current_metrics.get("study_total_minutes", 0),
        sleep_avg_minutes=current_metrics.get("sleep_avg_minutes"),
        workout_count=current_metrics.get("workout_count", 0),
        stretch_count=current_metrics.get("stretch_count", 0),
        period_type="year",
        total_days=days_in_year,
    )
    summary_lines.extend(ideals_lines)
    sections.append(trim_blank_lines(summary_lines))

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
        study_values_hours.append(total_min / 60 if total_min else 0)
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
        height=12,
        y_max=720,
        bar_width=7,
        col_spacing=11,
        left_pad=2,
        label_prefix="    ",
        axis_trim=None,
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
        bar = _compress_days_time_order(
            days,
            lambda d: (daily_data.get(d, {}).get("study_minutes") or 0)
            >= STUDY_TARGET_MIN,
            YEARLY_STUDY_BAR_WIDTH,
            allow_partial=True,
            fill_char=STUDY_SYMBOL_DEEP,
            partial_char="░",
            empty_char=STUDY_SYMBOL_NONE,
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
        legend_line=YEARLY_STUDY_LEGEND_LINE,
    )
    study_lines.extend(wrap_code_block(study_grid))
    study_lines.append("")

    total_interrupts, total_overruns, study_day_count = aggregate_interrupt_overrun(
        dates, daily_data
    )
    avg_interrupts = total_interrupts / max(1, study_day_count)
    avg_overruns = total_overruns / max(1, study_day_count)

    study_lines.extend(render_interrupts_table(avg_interrupts, avg_overruns))
    study_lines.append("")
    sections.append(trim_blank_lines(study_lines))

    # TRAINING (quarter rows)
    training_lines = ["### **TRAINING**"]
    quarter_labels = [f"Q{i + 1}" for i in range(4)]
    workout_counts = []
    stretch_counts = []
    workout_done_year = 0
    stretch_done_year = 0
    elapsed_year = 0

    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        elapsed_days = sum(1 for d in days if d <= today)
        workout_done = sum(
            1 for d in days if d <= today and daily_data.get(d, {}).get("workout")
        )
        stretch_done = sum(
            1 for d in days if d <= today and daily_data.get(d, {}).get("stretch")
        )
        workout_counts.append((workout_done, elapsed_days, start))
        stretch_counts.append((stretch_done, elapsed_days, start))
        workout_done_year += workout_done
        stretch_done_year += stretch_done
        elapsed_year += elapsed_days

    # Baseline is last quarter of previous year
    prev_workout_baseline = None
    prev_stretch_baseline = None
    if prev_quarter_ranges:
        last_q_start, last_q_end = prev_quarter_ranges[-1]
        prev_days = list(daterange(last_q_start, last_q_end))
        prev_workout_baseline = sum(
            1 for d in prev_days if prev_daily_data.get(d, {}).get("workout")
        )
        prev_stretch_baseline = sum(
            1 for d in prev_days if prev_daily_data.get(d, {}).get("stretch")
        )

    workout_delta_labels = compute_period_deltas(
        workout_counts, prev_workout_baseline, today
    )
    stretch_delta_labels = compute_period_deltas(
        stretch_counts, prev_stretch_baseline, today
    )

    workout_bars = []
    stretch_bars = []
    for start, end in quarter_ranges:
        days = list(daterange(start, end))
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

    training_lines.extend(wrap_code_block(workout_block + [""] + stretch_block))
    training_lines.append("")
    sections.append(trim_blank_lines(training_lines))

    # PROCRASTINATION section (screen time waterfall + trend table)
    screen_time_totals = aggregate_screen_time(dates, daily_data)
    if screen_time_totals:
        procrastination_lines = ["### **PROCRASTINATION**"]
        waterfall_lines = render_waterfall_chart(screen_time_totals)
        chart_body = [line for line in waterfall_lines if not line.startswith("### ")]
        procrastination_lines.extend(wrap_code_block(chart_body))
        procrastination_lines.append("")
        # Quarterly trend table with wikilinks to quarterly notes
        quarter_labels = [f"Q{i + 1}" for i in range(len(quarter_ranges))]
        quarter_wikilinks = []
        for i, _ in enumerate(quarter_ranges):
            quarter_wikilinks.append(f"[[{year}-Q{i + 1}\\|Q{i + 1}]]")
        procrastination_lines.extend(
            render_screen_time_period_table(quarter_ranges, daily_data, "QTR", quarter_labels, quarter_wikilinks)
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
            sleep_chart_vals.append(avg_min / 60)
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
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=11,
        left_pad=2,
        label_prefix="    ",
        axis_trim=None,
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
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=11,
        left_pad=2,
        label_prefix="    ",
        axis_trim=None,
        center_labels_on_bars=True,
        delta_labels=mood_delta_labels,
    )
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    media_lines = build_media_section(year_start, year_end, "year")
    sections.append(trim_blank_lines(media_lines))

    combined = []
    for sec in sections:
        combined.extend(sec)
        combined.append("")
    return trim_blank_lines(combined)


def main():
    parser = argparse.ArgumentParser(
        description="Generate yearly metrics from daily notes."
    )
    parser.add_argument("--file", help="Path to yearly note")
    parser.add_argument("--year", help="Year (YYYY)")
    parser.add_argument("--yearly-dir", help="Directory for yearly notes")
    args = parser.parse_args()

    if args.year:
        year = int(args.year)
    else:
        year = datetime.date.today().year

    year_start, year_end = year_range(year)
    filename = f"{year}.md"

    yearly_dir = args.yearly_dir or DEFAULT_YEARLY_DIR
    note_path = args.file or os.path.join(yearly_dir, filename)

    prev_year = year - 1
    prev_year_start, prev_year_end = year_range(prev_year)

    with locked_note(note_path):
        ensure_note(note_path, YEARLY_TEMPLATE_PATH)

        try:
            with open(note_path, "r") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            lines = []

        g_start, g_end = goals_section_bounds(lines)
        yearly_tasks = extract_subsection_tasks(lines, g_start, g_end, "YEARLY")
        ensure_goal_ids(yearly_tasks, "yearly", str(year))

        prev_tasks = []
        prev_note_path = os.path.join(yearly_dir, f"{prev_year}.md")
        try:
            with open(prev_note_path, "r") as pf:
                prev_lines = pf.read().splitlines()
            p_start, p_end = goals_section_bounds(prev_lines)
            prev_tasks = extract_subsection_tasks(prev_lines, p_start, p_end, "YEARLY")
            ensure_goal_ids(prev_tasks, "yearly", str(prev_year))
        except Exception:
            prev_tasks = []

        open_prev = [t for t in prev_tasks if not t.done]
        existing_ids = {t.id for t in yearly_tasks if t.id}
        for t in open_prev:
            if t.id in existing_ids:
                continue
            from dataclasses import replace as dc_replace
            yearly_tasks.append(dc_replace(t, done=False))
            existing_ids.add(t.id)

        new_goals_block = build_goals_block(
            [
                ("YEARLY", render_goal_lines(yearly_tasks)),
            ]
        )
        if g_start == -1:
            lines = (
                new_goals_block + ([""] if lines and lines[0].strip() else []) + lines
            )
        else:
            lines[g_start:g_end] = new_goals_block

        daily_data = load_daily_data(year_start, year_end)
        prev_daily_data = load_daily_data(prev_year_start, prev_year_end)

        quarter_ranges = year_quarters(year)
        prev_quarter_ranges = year_quarters(prev_year)

        # Load 3 prior years for moving average calculation
        prior_year_metrics = []
        for years_ago in range(3, 0, -1):  # 3 years ago... 1 year ago
            p_year = year - years_ago
            p_start, p_end = year_range(p_year)
            p_data = load_daily_data(p_start, p_end)
            p_dates = list(daterange(p_start, p_end))
            p_metrics = compute_period_metrics(p_dates, p_data)
            prior_year_metrics.append(p_metrics)

        metrics_block = build_yearly_metrics(
            year,
            year_start,
            year_end,
            quarter_ranges,
            prev_quarter_ranges,
            daily_data,
            prev_daily_data,
            prior_year_metrics=prior_year_metrics,
        )

        updated_lines = replace_metrics_block(lines, metrics_block)
        atomic_write_note(note_path, updated_lines)


if __name__ == "__main__":
    main()
