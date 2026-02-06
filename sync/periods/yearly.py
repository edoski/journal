#!/usr/bin/env python3
import argparse
import datetime

from sync.logging import get_logger


from sync.constants import (
    YEARLY_TEMPLATE_PATH,
    STUDY_TARGET_MIN,
    RENDER,
)
from sync.io import safe_read_file
from sync.notes.sections import (
    goals_section_bounds,
    extract_subsection_tasks,
    trim_blank_lines,
    join_sections,
    splice_goals_section,
)
from sync.dates import daterange, year_range
from sync.formatting import (
    format_minutes,
    compute_percent_change,
    format_percent_change,
)
from sync.metrics import (
    load_daily_data,
    compute_period_metrics,
    compute_period_deltas,
    compute_moving_average,
    load_prior_period_metrics,
    aggregate_screen_time,
    group_screen_time_by_percent,
)
from sync.writers.tables import (
    render_sleep_stats_table,
    render_activity_table,
)
from sync.writers.charts import (
    render_bar_chart,
    render_training_quarter_block,
    render_yearly_study_coverage,
    wrap_code_block,
    compress_activity_time_order,
    compress_days_time_order,
    render_screen_time_period_table,
    YEARLY_4QTR_STUDY,
    YEARLY_4QTR_METRIC,
    YEARLY_4QTR_MOOD,
)
from sync.writers.goals import render_goal_lines, build_goals_block
from sync.periods.sections import (
    append_interrupts_table,
    append_media_section,
    append_summary_section,
    append_training_type_table,
    build_procrastination_section,
)
from sync.goals.carry_forward import carry_forward_with_tombstones
from sync.readers.goals import ensure_goal_ids
from sync.periods.runtime import (
    journal_path,
    open_period_note,
    resolve_note_path,
    write_note_metrics,
)
from sync.periods.windows import build_year_window

logger = get_logger()

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
            lambda d: (daily_data.get(d, {}).get("study_minutes") or 0)
            >= STUDY_TARGET_MIN,
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
    append_media_section(sections, year_start, year_end, "year")

    return join_sections(sections)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate yearly metrics from daily notes."
    )
    parser.add_argument("--file", help="Path to yearly note")
    parser.add_argument("--year", help="Year (YYYY)")
    args = parser.parse_args()

    if args.year:
        year = int(args.year)
    else:
        year = datetime.date.today().year

    window = build_year_window(year)
    note_path = resolve_note_path(window.filename, args.file)

    with open_period_note(note_path, YEARLY_TEMPLATE_PATH) as lines:
        g_start, g_end = goals_section_bounds(lines)
        yearly_tasks = extract_subsection_tasks(lines, g_start, g_end, "YEARLY")
        yearly_tasks = ensure_goal_ids(yearly_tasks, "yearly", str(window.year))

        prev_tasks = []
        prev_note_path = journal_path(window.previous_filename)
        prev_lines = safe_read_file(prev_note_path)
        if prev_lines is not None:
            g_start, g_end = goals_section_bounds(prev_lines)
            prev_tasks = extract_subsection_tasks(prev_lines, g_start, g_end, "YEARLY")
            prev_tasks = ensure_goal_ids(
                prev_tasks, "yearly", str(window.previous_year)
            )

        yearly_tasks, _ = carry_forward_with_tombstones(
            prev_tasks,
            yearly_tasks,
            str(window.year),
            "yearly",
        )

        new_goals_block = build_goals_block(
            [
                ("YEARLY", render_goal_lines(yearly_tasks)),
            ]
        )
        splice_goals_section(lines, new_goals_block, insert_if_missing=True)

        daily_data = load_daily_data(window.start, window.end)
        prev_daily_data = load_daily_data(window.previous_start, window.previous_end)
        prior_year_metrics = load_prior_period_metrics(
            range(3, 0, -1), window.prior_bounds
        )

        metrics_block = build_yearly_metrics(
            window.year,
            window.start,
            window.end,
            window.quarter_ranges,
            window.previous_quarter_ranges,
            daily_data,
            prev_daily_data,
            prior_year_metrics=prior_year_metrics,
        )

        write_note_metrics(note_path, lines, metrics_block)


if __name__ == "__main__":
    main()
