#!/usr/bin/env python3
import argparse
import datetime
import os

from sync_utils import (
    JOURNAL_DIR,
    MONTHLY_TEMPLATE_PATH,
    DEFAULT_MONTHLY_DIR,
    MONTH_ABBR,
    parse_daily_note,
    daterange,
    month_range,
    month_week_ranges,
    format_week_label,
    format_minutes,
    render_summary_table,
    render_monthly_chart,
    render_training_frequency_grid,
    wrap_code_block,
    ensure_note,
    replace_metrics_block,
)


def compute_month_metrics(dates, daily_data):
    """
    Compute aggregated metrics for a list of dates (month).
    Returns a dict with study_total_minutes, sleep_avg_minutes, mood_avg,
    workout_count, stretch_count, total_days.
    """
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
    }


def build_monthly_metrics(start_date, end_date, week_ranges, daily_data, prev_daily_data, current_month_label, prev_month_label):
    """
    Build the metrics block for a monthly note.
    
    current_month_label: e.g., "DEC"
    prev_month_label: wiki link like "[[2025-11|NOV]]"
    """
    days_in_period = (end_date - start_date).days + 1
    dates = list(daterange(start_date, end_date))

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
    study_chart_vals = []
    study_value_labels = []
    for start, end in week_ranges:
        label = format_week_label(start, end)
        week_labels.append(label)
        week_days = list(daterange(start, end))
        mins = [daily_data.get(d, {}).get("study_minutes") for d in week_days]
        mins = [m for m in mins if m is not None]
        total_min = sum(mins) if mins else 0
        study_chart_vals.append(total_min / 60)  # Convert to hours for chart
        # Always use 0h00m format for zero values
        study_value_labels.append(format_minutes(total_min) if total_min > 0 else "0h00m")

    chart_lines = render_monthly_chart(week_labels, study_chart_vals, study_value_labels, height=10, y_max=40, bar_width=6, col_spacing=12)
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

    # TRAINING section
    lines.append("### **TRAINING**")
    training_grid = render_training_frequency_grid(
        week_ranges, daily_data, workout_days, stretch_days, days_in_period
    )
    lines.extend(wrap_code_block(training_grid))
    lines.append("")

    # SLEEP section (5-char bars, weekly averages)
    lines.append("### **SLEEP**")
    sleep_chart_vals = []
    sleep_value_labels = []
    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        mins = [daily_data.get(d, {}).get("sleep_minutes") for d in week_days]
        mins = [m for m in mins if m is not None]
        if mins:
            avg_min = sum(mins) / len(mins)  # AVERAGE for sleep
            sleep_chart_vals.append(avg_min / 60)
            sleep_value_labels.append(format_minutes(avg_min))
        else:
            sleep_chart_vals.append(0)
            sleep_value_labels.append("0h00m")

    sleep_chart = render_monthly_chart(week_labels, sleep_chart_vals, sleep_value_labels, height=10, y_max=10, bar_width=5, col_spacing=12)
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
    mood_chart_vals = []
    mood_value_labels = []
    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        vals = [daily_data.get(d, {}).get("mood") for d in week_days]
        vals = [v for v in vals if v is not None]
        if vals:
            avg_val = sum(vals) / len(vals)  # AVERAGE for mood
            mood_chart_vals.append(avg_val)
            # Always show one decimal for mood (e.g., 5.0, 6.0, 10.0)
            mood_value_labels.append(f"{avg_val:.1f}")
        else:
            mood_chart_vals.append(0)
            mood_value_labels.append("0.0")

    mood_chart = render_monthly_chart(week_labels, mood_chart_vals, mood_value_labels, height=10, y_max=10, bar_width=5, col_spacing=12, left_pad=2, center_labels_on_bars=True)
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
    with open(note_path, "w") as f:
        f.write("\n".join(updated_lines).rstrip() + "\n")


if __name__ == "__main__":
    main()
