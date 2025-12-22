#!/usr/bin/env python3
import argparse
import datetime
import os

from sync_utils import (
    JOURNAL_DIR,
    WEEKLY_TEMPLATE_PATH,
    DEFAULT_WEEKLY_DIR,
    DAYS,
    parse_daily_note,
    daterange,
    iso_week_range,
    format_minutes,
    format_mood_value,
    format_hours_value,
    render_summary_block,
    render_vertical_chart,
    wrap_code_block,
    ensure_note,
    replace_metrics_block,
)


def build_weekly_metrics(start_date, end_date, daily_data):
    days_in_period = 7
    dates = [start_date + datetime.timedelta(days=i) for i in range(7)]

    study_minutes = [daily_data.get(d, {}).get("study_minutes") for d in dates]
    sleep_minutes = [daily_data.get(d, {}).get("sleep_minutes") for d in dates]
    mood_vals = [daily_data.get(d, {}).get("mood") for d in dates]

    study_total = sum((m for m in study_minutes if m is not None), 0)
    sleep_vals = [m for m in sleep_minutes if m is not None]
    sleep_avg = sum(sleep_vals) / len(sleep_vals) if sleep_vals else None
    mood_vals_clean = [m for m in mood_vals if m is not None]
    mood_avg = sum(mood_vals_clean) / len(mood_vals_clean) if mood_vals_clean else None

    workout_days = sum(1 for d in dates if daily_data.get(d, {}).get("workout"))
    stretch_days = sum(1 for d in dates if daily_data.get(d, {}).get("stretch"))

    summary_labels = [
        ("STUDY", f"`{format_minutes(study_total)}`", study_total / 60 if study_total else 0),
        ("SLEEP", f"`{format_minutes(sleep_avg)}`" if sleep_avg is not None else "`-`", sleep_avg / 60 if sleep_avg else 0),
        ("MOOD", f"`{format_mood_value(mood_avg)}`" if mood_avg is not None else "`-`", mood_avg if mood_avg else 0),
        ("WORKOUT", f"`{workout_days}/{days_in_period}`", workout_days),
        ("STRETCH", f"`{stretch_days}/{days_in_period}`", stretch_days),
    ]

    summary_max = {
        "STUDY": 10 * days_in_period,
        "SLEEP": 10,
        "MOOD": 10,
        "WORKOUT": days_in_period,
        "STRETCH": days_in_period,
    }

    lines = []
    lines.extend(render_summary_block(summary_labels, summary_max))

    # STUDY
    lines.append("### STUDY")
    lines.append("")
    study_hours = [m / 60 if m is not None else None for m in study_minutes]
    study_values = [
        f"`{format_minutes(m)}`" if m is not None else "" for m in study_minutes
    ]
    chart_lines = render_vertical_chart(DAYS, study_hours, study_values, height=10, col_width=8)
    lines.extend(wrap_code_block(chart_lines))
    lines.append("")

    # Activity table
    activity_totals = {}
    for d in dates:
        daily = daily_data.get(d)
        if not daily:
            continue
        for activity, mins in daily.get("activity_totals", {}).items():
            activity_totals[activity] = activity_totals.get(activity, 0) + mins

    total_activity = sum(activity_totals.values())
    lines.append("| ACTIVITY | TIME | SHARE |")
    lines.append("| -------- | ---- | ----- |")
    if activity_totals:
        for activity, mins in sorted(activity_totals.items(), key=lambda x: x[1], reverse=True):
            share = f"{int(round((mins / total_activity) * 100))}%" if total_activity else "0%"
            lines.append(f"| {activity} | `{format_minutes(mins)}` | `{share}` |")
    else:
        lines.append("|  |  |  |")
    lines.append("")

    # TRAINING
    lines.append("### TRAINING")
    lines.append("| TYPE | MON | TUE | WED | THU | FRI | SAT | SUN |")
    lines.append("| ---- | --- | --- | --- | --- | --- | --- | --- |")

    def training_row(label, key):
        cells = []
        for d in dates:
            val = daily_data.get(d, {}).get(key)
            cells.append("`X`" if val else "")
        return f"| **{label}** | " + " | ".join(cells) + " |"

    lines.append(training_row("WORKOUT", "workout"))
    lines.append(training_row("STRETCH", "stretch"))
    lines.append("")

    lines.append("| TOTAL | VALUE |")
    lines.append("| ----- | ----- |")
    lines.append(f"| WORKOUTS | `{workout_days}/{days_in_period}` |")
    lines.append(f"| STRETCH | `{stretch_days}/{days_in_period}` |")
    lines.append("")

    # SLEEP
    lines.append("### SLEEP")
    lines.append("")
    sleep_hours = [m / 60 if m is not None else None for m in sleep_minutes]
    sleep_values = [
        f"`{format_minutes(m)}`" if m is not None else "" for m in sleep_minutes
    ]
    sleep_chart = render_vertical_chart(DAYS, sleep_hours, sleep_values, height=10, col_width=8)
    lines.extend(wrap_code_block(sleep_chart))
    lines.append("")

    awake_vals = [daily_data.get(d, {}).get("awake_minutes") for d in dates if daily_data.get(d)]
    awakenings_vals = [daily_data.get(d, {}).get("awakenings") for d in dates if daily_data.get(d)]
    awake_vals = [v for v in awake_vals if v is not None]
    awakenings_vals = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_vals) / len(awake_vals) if awake_vals else None
    avg_awakenings = sum(awakenings_vals) / len(awakenings_vals) if awakenings_vals else None

    lines.append("| METRIC | VALUE (AVG.) |")
    lines.append("| ------ | ------------ |")
    lines.append(f"| **SLEEP** | `{format_minutes(sleep_avg)}` |" if sleep_avg is not None else "| **SLEEP** | |")
    lines.append(f"| **AWAKE** | `{format_minutes(avg_awake)}` |" if avg_awake is not None else "| **AWAKE** | |")
    if avg_awakenings is not None:
        awaken_val = f"{avg_awakenings:.1f}" if abs(avg_awakenings - round(avg_awakenings)) >= 0.05 else str(int(round(avg_awakenings)))
        lines.append(f"| **AWAKENINGS** | `{awaken_val}` |")
    else:
        lines.append("| **AWAKENINGS** | |")
    lines.append("")

    # MOOD
    lines.append("### MOOD")
    lines.append("")
    mood_values = [
        f"`{format_mood_value(m)}`" if m is not None else "" for m in mood_vals
    ]
    mood_chart = render_vertical_chart(DAYS, mood_vals, mood_values, height=10, col_width=8)
    lines.extend(wrap_code_block(mood_chart))
    lines.append("")

    return lines


def main():
    parser = argparse.ArgumentParser(description="Generate weekly metrics from daily notes.")
    parser.add_argument("--file", help="Path to weekly note")
    parser.add_argument("--date", help="Date within week (YYYY-MM-DD)")
    parser.add_argument("--weekly-dir", help="Directory for weekly notes")
    args = parser.parse_args()

    if args.date:
        target_date = datetime.datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        target_date = datetime.date.today()

    week_start, week_end = iso_week_range(target_date)
    year, week_num, _ = target_date.isocalendar()
    filename = f"{year}-W{week_num:02d}.md"

    weekly_dir = args.weekly_dir or DEFAULT_WEEKLY_DIR
    note_path = args.file or os.path.join(weekly_dir, filename)

    ensure_note(note_path, WEEKLY_TEMPLATE_PATH)

    daily_data = {}
    for day in daterange(week_start, week_end):
        path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
        if not os.path.exists(path):
            continue
        parsed = parse_daily_note(path)
        if parsed:
            daily_data[day] = parsed

    metrics_block = build_weekly_metrics(week_start, week_end, daily_data)

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
