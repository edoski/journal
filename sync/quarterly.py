#!/usr/bin/env python3
import argparse
import datetime
import os

from sync.constants import (
    JOURNAL_DIR,
    QUARTERLY_TEMPLATE_PATH,
    MONTH_ABBR,
    STUDY_TARGET_MIN,
)
from sync.notes import (
    locked_note,
    ensure_note,
    replace_metrics_block,
    goals_section_bounds,
    extract_subsection_tasks,
    trim_blank_lines,
)
from sync.dates import (
    daterange,
    quarter_range,
    quarter_months,
    quarter_of_date,
    quarter_id,
)
from sync.formatting import (
    format_minutes,
    compute_percent_change,
    format_percent_change,
)
from sync.metrics import (
    compute_period_metrics,
    compute_moving_average,
    load_daily_data,
    aggregate_interrupt_overrun,
    compute_period_deltas,
    aggregate_screen_time,
    group_screen_time_by_percent,
)
from sync.writers.tables import (
    render_summary_table,
    render_sleep_stats_table,
    render_activity_table,
    render_interrupts_table,
)
from sync.writers.charts import (
    render_bar_chart,
    render_quarterly_study_coverage,
    wrap_code_block,
    render_waterfall_chart,
    render_screen_time_period_table,
    QUARTERLY_3MONTH_STUDY,
    QUARTERLY_3MONTH_METRIC,
    QUARTERLY_3MONTH_MOOD,
)
from sync.writers.goals import render_goal_lines, build_goals_block
from sync.writers.media import build_media_section
from sync.readers.goals import filter_by_proximity, ensure_goal_ids

from sync.base import carry_forward_goals, propagate_goal_status, atomic_write_note


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
    prior_quarter_metrics=None,
):
    today = datetime.date.today()
    sections = []

    dates = list(daterange(quarter_start, quarter_end))
    prev_dates = list(prev_daily_data.keys())

    # Summary with MA
    current_metrics = compute_period_metrics(dates, daily_data)
    prev_metrics = (
        compute_period_metrics(prev_dates, prev_daily_data)
        if prev_daily_data
        else {
            "study_total_minutes": 0,
            "sleep_avg_minutes": None,
            "mood_avg": None,
            "workout_count": 0,
            "stretch_count": 0,
            "total_days": len(prev_dates),
            "days_up_to_today": len(prev_dates),
        }
    )

    # Compute 4-quarter moving average
    ma_metrics = None
    if prior_quarter_metrics and len(prior_quarter_metrics) >= 4:
        ma_metrics = compute_moving_average(prior_quarter_metrics, 4)

    prev_label = f"**[[{quarter_id(prev_year, prev_quarter)}\\|LAST QUARTER]]**"
    days_in_quarter = (quarter_end - quarter_start).days + 1
    summary_lines = render_summary_table(
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
    sections.append(trim_blank_lines(summary_lines))

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

    total_interrupts, total_overruns, study_day_count = aggregate_interrupt_overrun(
        dates, daily_data
    )
    avg_interrupts = total_interrupts / max(1, study_day_count)
    avg_overruns = total_overruns / max(1, study_day_count)

    study_lines.extend(render_interrupts_table(avg_interrupts, avg_overruns))
    study_lines.append("")
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

    workout_counts = [_month_count(rng, "workout", daily_data) for rng in month_ranges]
    stretch_counts = [_month_count(rng, "stretch", daily_data) for rng in month_ranges]
    if prev_last_month_range:
        prev_workout_baseline = _month_count(
            prev_last_month_range, "workout", prev_daily_data
        )[0]
        prev_stretch_baseline = _month_count(
            prev_last_month_range, "stretch", prev_daily_data
        )[0]
    else:
        prev_workout_baseline = None
        prev_stretch_baseline = None

    workout_delta_labels = compute_period_deltas(
        workout_counts, prev_workout_baseline, today
    )
    stretch_delta_labels = compute_period_deltas(
        stretch_counts, prev_stretch_baseline, today
    )

    def _build_training_block(title, activity_key, deltas):
        total_done = sum(
            d
            for d, _, _ in (
                workout_counts if activity_key == "workout" else stretch_counts
            )
        )
        total_elapsed = sum(
            e
            for _, e, _ in (
                workout_counts if activity_key == "workout" else stretch_counts
            )
        )
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
        _build_training_block("WORKOUT", "workout", workout_delta_labels)
    )
    training_block.append(
        ""
    )  # blank line between workout and stretch inside same block
    training_block.extend(
        _build_training_block("STRETCH", "stretch", stretch_delta_labels)
    )
    training_lines.extend(wrap_code_block(training_block))
    training_lines.append("")

    sections.append(trim_blank_lines(training_lines))

    # PROCRASTINATION section (screen time waterfall + trend table)
    screen_time_totals = aggregate_screen_time(dates, daily_data)
    screen_time_totals = group_screen_time_by_percent(screen_time_totals)
    if screen_time_totals:
        procrastination_lines = ["### **PROCRASTINATION**"]
        waterfall_lines = render_waterfall_chart(screen_time_totals)
        chart_body = [line for line in waterfall_lines if not line.startswith("### ")]
        procrastination_lines.extend(wrap_code_block(chart_body))
        procrastination_lines.append("")
        # Monthly trend table with wikilinks to monthly notes
        month_labels = [MONTH_ABBR[m[0].month - 1] for m in month_ranges]
        month_wikilinks = []
        for (start, _), label in zip(month_ranges, month_labels):
            month_wikilinks.append(f"[[{start.year}-{start.month:02d}\\|{label}]]")
        procrastination_lines.extend(
            render_screen_time_period_table(month_ranges, daily_data, "MONTH", month_labels, month_wikilinks)
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
            sleep_chart_vals.append(round((avg_min / 60) * 2) / 2)  # Round to nearest 0.5h
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
    media_lines = build_media_section(quarter_start, quarter_end, "quarter")
    sections.append(trim_blank_lines(media_lines))

    combined = []
    for sec in sections:
        combined.extend(sec)
        combined.append("")
    return trim_blank_lines(combined)


def main():
    parser = argparse.ArgumentParser(
        description="Generate quarterly metrics from daily notes."
    )
    parser.add_argument("--file", help="Path to quarterly note")
    parser.add_argument("--quarter", help="Quarter (YYYY-Qn, e.g., 2025-Q4)")
    args = parser.parse_args()

    if args.quarter:
        parts = args.quarter.upper().split("-Q")
        if len(parts) != 2:
            raise ValueError("Quarter must be in format YYYY-Qn")
        year = int(parts[0])
        quarter_num = int(parts[1])
    else:
        today = datetime.date.today()
        year, quarter_num = quarter_of_date(today)

    quarter_start, quarter_end = quarter_range(year, quarter_num)
    filename = f"{quarter_id(year, quarter_num)}.md"

    note_path = args.file or os.path.join(JOURNAL_DIR, filename)

    if quarter_num == 1:
        prev_year = year - 1
        prev_quarter = 4
    else:
        prev_year = year
        prev_quarter = quarter_num - 1
    prev_start, prev_end = quarter_range(prev_year, prev_quarter)

    with locked_note(note_path):
        ensure_note(note_path, QUARTERLY_TEMPLATE_PATH)

        try:
            with open(note_path, "r") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            lines = []

        g_start, g_end = goals_section_bounds(lines)
        yearly_mirror = extract_subsection_tasks(lines, g_start, g_end, "YEARLY")
        ensure_goal_ids(yearly_mirror, "yearly", str(year))
        quarterly_tasks = extract_subsection_tasks(lines, g_start, g_end, "QUARTERLY")
        ensure_goal_ids(quarterly_tasks, "quarterly", quarter_id(year, quarter_num))

        qtr_key = quarter_id(year, quarter_num)

        prev_note_path = os.path.join(
            JOURNAL_DIR, f"{quarter_id(prev_year, prev_quarter)}.md"
        )
        prev_tasks = []
        try:
            with open(prev_note_path, "r") as pf:
                prev_lines = pf.read().splitlines()
            p_start, p_end = goals_section_bounds(prev_lines)
            p_body = extract_subsection_tasks(prev_lines, p_start, p_end, "QUARTERLY")
            ensure_goal_ids(p_body, "quarterly", quarter_id(prev_year, prev_quarter))
            prev_tasks = p_body
        except Exception:
            prev_tasks = []

        quarterly_tasks, _ = carry_forward_goals(
            prev_tasks, quarterly_tasks, qtr_key, "quarterly"
        )

        yearly_tasks = []
        yearly_lines = []
        yearly_path = os.path.join(JOURNAL_DIR, f"{year}.md")
        try:
            with open(yearly_path, "r") as yf:
                yearly_lines = yf.read().splitlines()
            y_start, y_end = goals_section_bounds(yearly_lines)
            yearly_tasks = extract_subsection_tasks(
                yearly_lines, y_start, y_end, "YEARLY"
            )
        except Exception:
            yearly_tasks = []
        ensure_goal_ids(yearly_tasks, "yearly", str(year))

        # Propagate completed YEARLY goals from quarterly mirror back to the yearly source.
        yearly_changed = propagate_goal_status(yearly_tasks, yearly_mirror)

        if yearly_changed:
            with locked_note(yearly_path):
                # Reload yearly note in case it changed while we were working.
                try:
                    with open(yearly_path, "r") as yf:
                        yearly_lines = yf.read().splitlines()
                except Exception:
                    yearly_lines = yearly_lines or []
                y_start, y_end = goals_section_bounds(yearly_lines)
                new_yearly_block = build_goals_block(
                    [
                        ("YEARLY", render_goal_lines(yearly_tasks)),
                    ]
                )
                if y_start == -1:
                    yearly_lines = (
                        new_yearly_block
                        + ([""] if yearly_lines and yearly_lines[0].strip() else [])
                        + yearly_lines
                    )
                else:
                    yearly_lines[y_start:y_end] = new_yearly_block
                atomic_write_note(yearly_path, yearly_lines)

        # Rebuild Goals block for quarterly note (YEARLY mirror + QUARTERLY source).
        # Filter yearly tasks to only show those with deadlines within 365 days (or no deadline).
        today = datetime.date.today()
        filtered_yearly = filter_by_proximity(yearly_tasks, 365, today)
        yearly_lines_block = (
            render_goal_lines(filtered_yearly, today=today)
            if filtered_yearly
            else [
                "",
                "_No yearly goals have been defined yet._",
            ]
        )
        new_goals_block = build_goals_block(
            [
                ("YEARLY", yearly_lines_block),
                # QUARTERLY is the source (not a mirror), so omit today to preserve deadline dates
                ("QUARTERLY", render_goal_lines(quarterly_tasks)),
            ]
        )
        if g_start == -1:
            lines = (
                new_goals_block + ([""] if lines and lines[0].strip() else []) + lines
            )
        else:
            lines[g_start:g_end] = new_goals_block

        daily_data = load_daily_data(quarter_start, quarter_end)
        prev_daily_data = load_daily_data(prev_start, prev_end)
        month_ranges = quarter_months(year, quarter_num)

        metrics_block = build_quarterly_metrics(
            quarter_start,
            quarter_end,
            month_ranges,
            daily_data,
            prev_daily_data,
            prev_year,
            prev_quarter,
        )

        # Load 4 prior quarters for moving average calculation
        prior_quarter_metrics = []
        for q_ago in range(4, 0, -1):  # 4 quarters ago... 1 quarter ago
            # Calculate prior quarter (year, q)
            # Logic: total_q = current_total_q - q_ago
            # current_total_q = year * 4 + (quarter_num - 1)
            curr_total = year * 4 + (quarter_num - 1)
            target_total = curr_total - q_ago
            p_year = target_total // 4
            p_q = (target_total % 4) + 1

            p_start, p_end = quarter_range(p_year, p_q)
            p_data = load_daily_data(p_start, p_end)
            p_dates = list(daterange(p_start, p_end))
            p_metrics = compute_period_metrics(p_dates, p_data)
            prior_quarter_metrics.append(p_metrics)

        metrics_block = build_quarterly_metrics(
            quarter_start,
            quarter_end,
            month_ranges,
            daily_data,
            prev_daily_data,
            prev_year,
            prev_quarter,
            prior_quarter_metrics=prior_quarter_metrics,
        )

        updated_lines = replace_metrics_block(lines, metrics_block)
        atomic_write_note(note_path, updated_lines)


if __name__ == "__main__":
    main()
