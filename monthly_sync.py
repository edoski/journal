#!/usr/bin/env python3
import argparse
import datetime
import os

from sync_utils import (
    JOURNAL_DIR,
    MONTHLY_TEMPLATE_PATH,
    DEFAULT_MONTHLY_DIR,
    locked_note,
    MONTH_ABBR,
    parse_daily_note,
    daterange,
    month_range,
    month_week_ranges,
    format_week_label,
    format_minutes,
    compute_percent_change,
    format_percent_change,
    render_summary_table,
    render_monthly_chart,
    render_training_frequency_grid,
    wrap_code_block,
    ensure_note,
    replace_metrics_block,
    round_half_up,
)


def compute_month_metrics(dates, daily_data):
    """
    Compute aggregated metrics for a list of dates (month).
    Returns a dict with study_total_minutes, sleep_avg_minutes, mood_avg,
    workout_count, stretch_count, total_days, days_up_to_today.
    """
    # Only count days up to today (or last day with any data)
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


def build_monthly_metrics(start_date, end_date, week_ranges, daily_data, prev_daily_data, current_month_label, prev_month_label):
    """
    Build the metrics block for a monthly note.
    
    current_month_label: e.g., "DEC"
    prev_month_label: wiki link like "[[2025-11|NOV]]"
    """
    days_in_period = (end_date - start_date).days + 1
    dates = list(daterange(start_date, end_date))
    today = datetime.date.today()

    # Compute metrics for current and previous month
    current_metrics = compute_month_metrics(dates, daily_data)
    prev_metrics = compute_month_metrics(list(prev_daily_data.keys()), prev_daily_data)

    sleep_avg = current_metrics["sleep_avg_minutes"]
    mood_avg = current_metrics["mood_avg"]
    workout_days = current_metrics["workout_count"]
    stretch_days = current_metrics["stretch_count"]

    # Calculate study total from activity tables (more accurate than frontmatter)
    activity_totals = {}
    for d in dates:
        daily = daily_data.get(d)
        if not daily:
            continue
        for activity, mins in daily.get("activity_totals", {}).items():
            activity_totals[activity] = activity_totals.get(activity, 0) + mins
    study_total_from_activities = sum(activity_totals.values())

    lines = []
    
    # Summary table with comparison
    lines.extend(render_summary_table(
        current_metrics, prev_metrics,
        current_month_label, prev_month_label
    ))

    # STUDY section (using activity totals for accuracy)
    lines.append("### **STUDY**")

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
        study_chart_vals.append(total_min / 60)  # Convert to hours for chart
        # Always use 0h00m format for zero values
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(format_minutes(total_min) if total_min > 0 else "0h00m")

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

    chart_lines = render_monthly_chart(
        week_labels,
        study_chart_vals,
        study_value_labels,
        height=10,
        y_max=40,
        bar_width=6,
        col_spacing=12,
        delta_labels=study_delta_labels,
    )
    lines.extend(wrap_code_block(chart_lines))
    lines.append(f"**`SUM: {format_minutes(study_total_from_activities, always_show_both=True)}`**")
    lines.append("")

    # Activity table (activity_totals already computed above)
    total_activity = sum(activity_totals.values())
    lines.append("| ACTIVITY | TIME | SHARE |")
    lines.append("| -------- | ---- | ----- |")
    if activity_totals:
        for activity, mins in sorted(activity_totals.items(), key=lambda x: x[1], reverse=True):
            share = f"{int(round((mins / total_activity) * 100))}%" if total_activity else "0%"
            lines.append(f"| **{activity}** | `{format_minutes(mins)}` | `{share}` |")
    else:
        lines.append("|  |  |  |")
    lines.append("")

    # INTERRUPTIONS table
    interrupt_totals = [daily_data.get(d, {}).get("interrupt_minutes", 0) for d in dates]
    overrun_totals = [daily_data.get(d, {}).get("overrun_minutes", 0) for d in dates]
    total_interrupts = sum(interrupt_totals)
    total_overruns = sum(overrun_totals)
    
    # Calculate averages per day (only count days up to today)
    days_up_to_today = current_metrics.get("days_up_to_today", len(dates))
    avg_interrupts = total_interrupts / max(1, days_up_to_today)
    avg_overruns = total_overruns / max(1, days_up_to_today)
    
    # Calculate study daily average for percentage comparison
    study_daily_avg = study_total_from_activities / max(1, days_up_to_today)
    
    # Calculate percentage of study time lost to interrupts
    interrupt_pct_str = "-"
    if study_total_from_activities > 0 and total_interrupts > 0:
        interrupt_pct = (total_interrupts / study_total_from_activities) * 100
        interrupt_pct_str = f"{int(round(interrupt_pct))}%"
    
    # Calculate percentage comparison for overruns vs daily study average
    overrun_pct_str = "-"
    if study_daily_avg > 0 and avg_overruns > 0:
        overrun_pct = (avg_overruns / study_daily_avg) * 100
        overrun_pct_str = f"{int(round(overrun_pct))}%"
    
    lines.append("| METRIC | AVERAGE | % OF STUDY |")
    lines.append("| ------ | ------- | ---------- |")
    lines.append(f"| **INTERRUPTS** | `{format_minutes(avg_interrupts)}/day` | `{interrupt_pct_str}` |")
    lines.append(f"| **OVERRUNS**   | `{format_minutes(avg_overruns)}/day` | `{overrun_pct_str}` |")
    lines.append("")

    # TRAINING section
    lines.append("### **TRAINING**")
    workout_delta_labels = []
    stretch_delta_labels = []
    for idx, week_days in enumerate(week_day_lists):
        week_start = week_days[0]
        if is_current_month and week_start > today:
            workout_delta_labels.append("")
            stretch_delta_labels.append("")
            continue
        if idx == 0:
            workout_delta_labels.append("—")
            stretch_delta_labels.append("—")
            continue
        if is_current_month and week_start <= today <= week_days[-1]:
            days_elapsed = sum(1 for d in week_days if d <= today)
        else:
            days_elapsed = len(week_days)
        prev_week_days = week_day_lists[idx - 1]
        slice_len = min(days_elapsed, len(week_days))
        prev_slice_len = min(days_elapsed, len(prev_week_days))

        curr_workout_count = sum(1 for d in week_days[:slice_len] if daily_data.get(d, {}).get("workout"))
        prev_workout_count = sum(1 for d in prev_week_days[:prev_slice_len] if daily_data.get(d, {}).get("workout"))
        workout_delta = compute_percent_change(curr_workout_count, prev_workout_count)
        workout_delta_labels.append(format_percent_change(workout_delta))

        curr_stretch_count = sum(1 for d in week_days[:slice_len] if daily_data.get(d, {}).get("stretch"))
        prev_stretch_count = sum(1 for d in prev_week_days[:prev_slice_len] if daily_data.get(d, {}).get("stretch"))
        stretch_delta = compute_percent_change(curr_stretch_count, prev_stretch_count)
        stretch_delta_labels.append(format_percent_change(stretch_delta))

    training_grid = render_training_frequency_grid(
        week_ranges,
        daily_data,
        workout_days,
        stretch_days,
        days_in_period,
        workout_delta_labels=workout_delta_labels,
        stretch_delta_labels=stretch_delta_labels,
    )
    lines.extend(wrap_code_block(training_grid))
    lines.append("")

    days_elapsed = current_metrics.get("days_up_to_today", len(dates))
    lines.append("| ACTIVITY | % DONE | % MISSED |")
    lines.append("| -------- | ------ | -------- |")
    if days_elapsed > 0:
        workout_done_pct = min(100, max(0, round_half_up((workout_days / days_elapsed) * 100)))
        workout_missed_pct = max(0, 100 - workout_done_pct)
        stretch_done_pct = min(100, max(0, round_half_up((stretch_days / days_elapsed) * 100)))
        stretch_missed_pct = max(0, 100 - stretch_done_pct)
        lines.append(f"| **WORKOUT** | `{workout_done_pct}%` | `{workout_missed_pct}%` |")
        lines.append(f"| **STRETCH** | `{stretch_done_pct}%` | `{stretch_missed_pct}%` |")
    else:
        lines.append("| **WORKOUT** | `-` | `-` |")
        lines.append("| **STRETCH** | `-` | `-` |")
    lines.append("")

    # SLEEP section (5-char bars, weekly averages)
    lines.append("### **SLEEP**")
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
            sleep_chart_vals.append(avg_min / 60)
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
        prev_vals = [v for v in sleep_week_raw[idx - 1][:prev_slice_len] if v is not None]
        curr_avg = (sum(curr_vals) / len(curr_vals)) if curr_vals else 0
        prev_avg = (sum(prev_vals) / len(prev_vals)) if prev_vals else 0
        delta = compute_percent_change(curr_avg, prev_avg)
        sleep_delta_labels.append(format_percent_change(delta))

    sleep_chart = render_monthly_chart(
        week_labels,
        sleep_chart_vals,
        sleep_value_labels,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=12,
        delta_labels=sleep_delta_labels,
    )
    lines.extend(wrap_code_block(sleep_chart))
    lines.append("")

    awake_vals = [daily_data.get(d, {}).get("awake_minutes") for d in dates if daily_data.get(d)]
    awakenings_vals = [daily_data.get(d, {}).get("awakenings") for d in dates if daily_data.get(d)]
    awake_vals = [v for v in awake_vals if v is not None]
    awakenings_vals = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_vals) / len(awake_vals) if awake_vals else None
    avg_awakenings = sum(awakenings_vals) / len(awakenings_vals) if awakenings_vals else None

    lines.append("| ACTIVITY | AVERAGE |")
    lines.append("| -------- | ------- |")
    lines.append(f"| **SLEEP**      | `{format_minutes(sleep_avg)}` |" if sleep_avg is not None else "| **SLEEP**      | |")
    lines.append(f"| **AWAKE**      | `{format_minutes(avg_awake)}` |" if avg_awake is not None else "| **AWAKE**      | |")
    if avg_awakenings is not None:
        awaken_val = f"{avg_awakenings:.1f}" if abs(avg_awakenings - round(avg_awakenings)) >= 0.05 else str(int(round(avg_awakenings)))
        lines.append(f"| **AWAKENINGS** | `{awaken_val}` |")
    else:
        lines.append("| **AWAKENINGS** | |")
    lines.append("")

    # MOOD section (5-char bars, weekly averages, always show decimal)
    lines.append("### **MOOD**")
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
        prev_vals = [v for v in mood_week_raw[idx - 1][:prev_slice_len] if v is not None]
        curr_avg = (sum(curr_vals) / len(curr_vals)) if curr_vals else 0
        prev_avg = (sum(prev_vals) / len(prev_vals)) if prev_vals else 0
        delta = compute_percent_change(curr_avg, prev_avg)
        mood_delta_labels.append(format_percent_change(delta))

    mood_chart = render_monthly_chart(
        week_labels,
        mood_chart_vals,
        mood_value_labels,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=12,
        left_pad=2,
        center_labels_on_bars=True,
        delta_labels=mood_delta_labels,
    )
    lines.extend(wrap_code_block(mood_chart))

    return lines


def main():
    parser = argparse.ArgumentParser(description="Generate monthly metrics from daily notes.")
    parser.add_argument("--file", help="Path to monthly note")
    parser.add_argument("--month", help="Month (YYYY-MM)")
    parser.add_argument("--monthly-dir", help="Directory for monthly notes")
    args = parser.parse_args()

    if args.month:
        year, month = map(int, args.month.split("-"))
        target_date = datetime.date(year, month, 1)
    else:
        today = datetime.date.today()
        target_date = datetime.date(today.year, today.month, 1)

    month_start, month_end = month_range(target_date.year, target_date.month)
    filename = f"{target_date.year}-{target_date.month:02d}.md"

    monthly_dir = args.monthly_dir or DEFAULT_MONTHLY_DIR
    note_path = args.file or os.path.join(monthly_dir, filename)

    with locked_note(note_path):
        ensure_note(note_path, MONTHLY_TEMPLATE_PATH)

        # Load current month's daily data
        daily_data = {}
        for day in daterange(month_start, month_end):
            path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
            if not os.path.exists(path):
                continue
            parsed = parse_daily_note(path)
            if parsed:
                daily_data[day] = parsed

        # Load previous month's daily data for comparison
        if target_date.month == 1:
            prev_year = target_date.year - 1
            prev_month = 12
        else:
            prev_year = target_date.year
            prev_month = target_date.month - 1
        
        prev_month_start, prev_month_end = month_range(prev_year, prev_month)
        prev_month_abbr = MONTH_ABBR[prev_month - 1]
        prev_month_label = f"**[[{prev_year}-{prev_month:02d}\\|LAST MONTH]]**"
        current_month_label = "THIS MONTH"

        prev_daily_data = {}
        for day in daterange(prev_month_start, prev_month_end):
            path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
            if not os.path.exists(path):
                continue
            parsed = parse_daily_note(path)
            if parsed:
                prev_daily_data[day] = parsed

        week_ranges = month_week_ranges(target_date.year, target_date.month)
        metrics_block = build_monthly_metrics(
            month_start, month_end, week_ranges, daily_data,
            prev_daily_data, current_month_label, prev_month_label
        )

        try:
            with open(note_path, "r") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            lines = []

        updated_lines = replace_metrics_block(lines, metrics_block)
        tmp_path = note_path + ".tmp"
        with open(tmp_path, "w") as f:
            f.write("\n".join(updated_lines).rstrip() + "\n")
        os.replace(tmp_path, note_path)


if __name__ == "__main__":
    main()
