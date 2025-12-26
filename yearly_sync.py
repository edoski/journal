#!/usr/bin/env python3
import argparse
import datetime
import os

from sync_utils import (
    JOURNAL_DIR,
    YEARLY_TEMPLATE_PATH,
    DEFAULT_YEARLY_DIR,
    locked_note,
    parse_daily_note,
    daterange,
    year_range,
    year_quarters,
    format_minutes,
    compute_percent_change,
    format_percent_change,
    render_quarter_bar_chart,
    render_training_quarter_block,
    render_summary_table,
    render_yearly_study_coverage,
    STUDY_LEGEND_LINE,
    wrap_code_block,
    ensure_note,
    replace_metrics_block,
    round_half_up,
    format_training_ratio,
    goals_section_bounds,
    extract_subsection_tasks,
    build_goals_block,
    render_goal_lines,
    trim_blank_lines,
    ensure_goal_ids,
)


def _load_daily_data(start_date, end_date):
    data = {}
    for day in daterange(start_date, end_date):
        path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
        if not os.path.exists(path):
            continue
        parsed = parse_daily_note(path)
        if parsed:
            data[day] = parsed
    return data



def compute_year_metrics(dates, daily_data):
    """Aggregate metrics for a set of dates (full year or previous year)."""
    today = datetime.date.today()
    dates_up_to_today = [d for d in dates if d <= today]
    days_up_to_today = len(dates_up_to_today)

    study_minutes = [daily_data.get(d, {}).get("study_minutes") for d in dates]
    sleep_minutes = [daily_data.get(d, {}).get("sleep_minutes") for d in dates]
    mood_vals = [daily_data.get(d, {}).get("mood") for d in dates]

    study_total = sum((m for m in study_minutes if m is not None), 0)
    sleep_vals = [m for m in sleep_minutes if m is not None]
    sleep_avg = sum(sleep_vals) / len(sleep_vals) if sleep_vals else None
    mood_vals_clean = [m for m in mood_vals if m is not None]
    mood_avg = sum(mood_vals_clean) / len(mood_vals_clean) if mood_vals_clean else None

    workout_count = sum(1 for d in dates if daily_data.get(d, {}).get("workout"))
    stretch_count = sum(1 for d in dates if daily_data.get(d, {}).get("stretch"))

    return {
        "study_total_minutes": study_total,
        "sleep_avg_minutes": sleep_avg,
        "mood_avg": mood_avg,
        "workout_count": workout_count,
        "stretch_count": stretch_count,
        "total_days": len(dates),
        "days_up_to_today": days_up_to_today,
    }


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


def build_yearly_metrics(year, year_start, year_end, quarter_ranges, prev_quarter_ranges, daily_data, prev_daily_data):
    today = datetime.date.today()
    sections = []

    dates = list(daterange(year_start, year_end))
    prev_dates = list(daterange(*year_range(year - 1)))

    current_metrics = compute_year_metrics(dates, daily_data)
    prev_metrics = compute_year_metrics(prev_dates, prev_daily_data)

    # SUMMARY
    summary_lines = render_summary_table(
        current_metrics,
        prev_metrics,
        "THIS YEAR",
        f"**[[{year - 1}\\|LAST YEAR]]**",
    )
    sections.append(trim_blank_lines(summary_lines))

    # STUDY (quarter bars, y_max=720h)
    study_lines = ["### **STUDY**"]
    q_labels = [f"Q{i+1}" for i in range(4)]
    prev_quarter_totals = _quarter_totals(prev_daily_data, prev_quarter_ranges)

    activity_totals = {}
    study_totals_minutes = []
    study_values_hours = []
    study_value_labels = []
    study_delta_labels = []
    interrupt_totals = []
    overrun_totals = []

    for start, end in quarter_ranges:
        total_min = 0
        for d in daterange(start, end):
            daily = daily_data.get(d)
            if not daily:
                continue
            for activity, mins in daily.get("activity_totals", {}).items():
                activity_totals[activity] = activity_totals.get(activity, 0) + mins
                total_min += mins
            interrupt_totals.append(daily.get("interrupt_minutes", 0))
            overrun_totals.append(daily.get("overrun_minutes", 0))

        study_totals_minutes.append(total_min)
        study_values_hours.append(total_min / 60 if total_min else 0)
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(format_minutes(total_min) if total_min > 0 else "0h00m")

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

    study_chart = render_quarter_bar_chart(
        q_labels,
        study_values_hours,
        study_value_labels,
        height=12,
        y_max=720,
        bar_width=7,
        col_spacing=11,
        left_pad=2,
        center_labels_on_bars=False,
        delta_labels=study_delta_labels,
    )
    study_lines.extend(wrap_code_block(study_chart))
    study_lines.append(f"**`SUM: {format_minutes(sum(activity_totals.values()), always_show_both=True)}`**")
    study_lines.append("")

    total_activity = sum(activity_totals.values())
    study_lines.append("| ACTIVITY | TIME | SHARE |")
    study_lines.append("| -------- | ---- | ----- |")
    if activity_totals:
        for activity, mins in sorted(activity_totals.items(), key=lambda x: x[1], reverse=True):
            share = f"{int(round((mins / total_activity) * 100))}%" if total_activity else "0%"
            study_lines.append(f"| **{activity}** | `{format_minutes(mins)}` | `{share}` |")
    else:
        study_lines.append("|  |  |  |")
    study_lines.append("")

    study_grid = render_yearly_study_coverage(quarter_ranges, daily_data, today=today)
    study_lines.extend(wrap_code_block(study_grid))
    study_lines.append("")

    total_interrupts = sum(interrupt_totals)
    total_overruns = sum(overrun_totals)

    # Use only study days (any study minutes > 0) as the denominator for both
    study_day_count = sum(
        1 for d in dates
        if (daily_data.get(d, {}).get("study_minutes") or 0) > 0
    )
    avg_interrupts = total_interrupts / max(1, study_day_count)
    avg_overruns = total_overruns / max(1, study_day_count)
    
    study_lines.append("| METRIC | AVERAGE |")
    study_lines.append("| ------ | ------- |")
    study_lines.append(f"| **INTERRUPTS** | `{format_minutes(avg_interrupts, always_show_both=True)}/day` |")
    study_lines.append(f"| **OVERRUNS**   | `{format_minutes(avg_overruns, always_show_both=True)}/day` |")
    study_lines.append("")
    sections.append(trim_blank_lines(study_lines))

    # TRAINING (quarter rows)
    training_lines = ["### **TRAINING**"]
    quarter_labels = [f"Q{i+1}" for i in range(4)]
    workout_counts = []
    stretch_counts = []
    workout_done_year = 0
    stretch_done_year = 0
    elapsed_year = 0

    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        elapsed_days = sum(1 for d in days if d <= today)
        workout_done = sum(1 for d in days if d <= today and daily_data.get(d, {}).get("workout"))
        stretch_done = sum(1 for d in days if d <= today and daily_data.get(d, {}).get("stretch"))
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
        prev_workout_baseline = sum(1 for d in prev_days if prev_daily_data.get(d, {}).get("workout"))
        prev_stretch_baseline = sum(1 for d in prev_days if prev_daily_data.get(d, {}).get("stretch"))

    def _compute_deltas(counts, baseline):
        deltas = []
        for idx, (done, elapsed, start) in enumerate(counts):
            if start > today:
                deltas.append("")
                continue
            if idx == 0:
                prev_val = baseline
            else:
                prev_val = counts[idx - 1][0]
            delta = compute_percent_change(done, prev_val)
            deltas.append(format_percent_change(delta))
        return deltas

    workout_delta_labels = _compute_deltas(workout_counts, prev_workout_baseline)
    stretch_delta_labels = _compute_deltas(stretch_counts, prev_stretch_baseline)

    workout_block = [f"┌ WORKOUT ({workout_done_year:02d}/{elapsed_year:02d})", "│"]
    workout_block.extend(
        render_training_quarter_block(
            quarter_labels,
            [(d, t) for d, t, _ in workout_counts],
            workout_delta_labels,
            bar_width=30,
        )
    )
    workout_block.append("└")

    stretch_block = [f"┌ STRETCH ({stretch_done_year:02d}/{elapsed_year:02d})", "│"]
    stretch_block.extend(
        render_training_quarter_block(
            quarter_labels,
            [(d, t) for d, t, _ in stretch_counts],
            stretch_delta_labels,
            bar_width=30,
        )
    )
    stretch_block.append("└")

    training_lines.extend(wrap_code_block(workout_block + [""] + stretch_block))
    training_lines.append("")
    sections.append(trim_blank_lines(training_lines))

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
        prev_q4_vals = [prev_daily_data.get(d, {}).get("sleep_minutes") for d in prev_q4_days if prev_daily_data.get(d)]
        prev_q4_vals = [v for v in prev_q4_vals if v is not None]
        prev_q4_sleep_avg = (sum(prev_q4_vals) / len(prev_q4_vals)) if prev_q4_vals else None

    for start, end in quarter_ranges:
        days = list(daterange(start, end))
        mins = [daily_data.get(d, {}).get("sleep_minutes") for d in days if daily_data.get(d)]
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

    sleep_chart = render_quarter_bar_chart(
        q_labels,
        sleep_chart_vals,
        sleep_value_labels,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=11,
        left_pad=2,
        center_labels_on_bars=False,
        delta_labels=sleep_delta_labels,
    )
    sleep_lines.extend(wrap_code_block(sleep_chart))
    sleep_lines.append("")

    awake_vals = [daily_data.get(d, {}).get("awake_minutes") for d in dates if daily_data.get(d)]
    awakenings_vals = [daily_data.get(d, {}).get("awakenings") for d in dates if daily_data.get(d)]
    awake_vals = [v for v in awake_vals if v is not None]
    awakenings_vals = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_vals) / len(awake_vals) if awake_vals else None
    avg_awakenings = sum(awakenings_vals) / len(awakenings_vals) if awakenings_vals else None
    sleep_avg = current_metrics.get("sleep_avg_minutes")

    sleep_lines.append("| ACTIVITY | AVERAGE |")
    sleep_lines.append("| -------- | ------- |")
    sleep_lines.append(f"| **SLEEP**      | `{format_minutes(sleep_avg)}` |" if sleep_avg is not None else "| **SLEEP**      | |")
    sleep_lines.append(f"| **AWAKE**      | `{format_minutes(avg_awake)}` |" if avg_awake is not None else "| **AWAKE**      | |")
    if avg_awakenings is not None:
        awaken_val = f"{avg_awakenings:.1f}" if abs(avg_awakenings - round(avg_awakenings)) >= 0.05 else str(int(round(avg_awakenings)))
        sleep_lines.append(f"| **AWAKENINGS** | `{awaken_val}` |")
    else:
        sleep_lines.append("| **AWAKENINGS** | |")
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
        prev_q4_vals = [prev_daily_data.get(d, {}).get("mood") for d in prev_q4_days if prev_daily_data.get(d)]
        prev_q4_vals = [v for v in prev_q4_vals if v is not None]
        prev_q4_mood_avg = (sum(prev_q4_vals) / len(prev_q4_vals)) if prev_q4_vals else None

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

    mood_chart = render_quarter_bar_chart(
        q_labels,
        mood_chart_vals,
        mood_value_labels,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=11,
        left_pad=2,
        center_labels_on_bars=True,
        delta_labels=mood_delta_labels,
    )
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    combined = []
    for sec in sections:
        combined.extend(sec)
        combined.append("")
    return trim_blank_lines(combined)


def main():
    parser = argparse.ArgumentParser(description="Generate yearly metrics from daily notes.")
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

        open_prev = [t for t in prev_tasks if not t.get("done")]
        existing_ids = {t.get("id") for t in yearly_tasks if t.get("id")}
        for t in open_prev:
            if t.get("id") in existing_ids:
                continue
            yearly_tasks.append({**t, "done": False})
            existing_ids.add(t.get("id"))

        new_goals_block = build_goals_block([
            ("YEARLY", render_goal_lines(yearly_tasks)),
        ])
        if g_start == -1:
            lines = new_goals_block + ([""] if lines and lines[0].strip() else []) + lines
        else:
            lines[g_start:g_end] = new_goals_block

        daily_data = _load_daily_data(year_start, year_end)
        prev_daily_data = _load_daily_data(prev_year_start, prev_year_end)

        quarter_ranges = year_quarters(year)
        prev_quarter_ranges = year_quarters(prev_year)

        metrics_block = build_yearly_metrics(
            year,
            year_start,
            year_end,
            quarter_ranges,
            prev_quarter_ranges,
            daily_data,
            prev_daily_data,
        )

        updated_lines = replace_metrics_block(lines, metrics_block)
        tmp_path = note_path + ".tmp"
        with open(tmp_path, "w") as f:
            f.write("\n".join(updated_lines).rstrip() + "\n")
        os.replace(tmp_path, note_path)


if __name__ == "__main__":
    main()
