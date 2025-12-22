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
    format_mood_value,
    render_summary_block,
    render_vertical_chart,
    wrap_code_block,
    ensure_note,
    replace_metrics_block,
)


def build_monthly_metrics(start_date, end_date, week_ranges, daily_data):
    days_in_period = (end_date - start_date).days + 1
    dates = list(daterange(start_date, end_date))

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

    # weekly averages for chart
    week_labels = []
    study_chart_vals = []
    study_value_labels = []
    for start, end in week_ranges:
        label = format_week_label(start, end)
        week_labels.append(label)
        week_days = list(daterange(start, end))
        mins = [daily_data.get(d, {}).get("study_minutes") for d in week_days]
        mins = [m for m in mins if m is not None]
        if mins:
            avg_min = sum(mins) / len(mins)
            study_chart_vals.append(avg_min / 60)
            study_value_labels.append(f"`{format_minutes(avg_min)}`")
        else:
            study_chart_vals.append(None)
            study_value_labels.append("")

    chart_lines = render_vertical_chart(week_labels, study_chart_vals, study_value_labels, height=10, col_width=12)
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
    lines.append("| WEEK | MON | TUE | WED | THU | FRI | SAT | SUN |")
    lines.append("| ---- | --- | --- | --- | --- | --- | --- | --- |")
    for start, end in week_ranges:
        label = f"`{format_week_label(start, end)}`"
        cells = []
        for d in daterange(start, end):
            entry = daily_data.get(d)
            if not entry:
                cells.append("")
                continue
            w = entry.get("workout")
            s = entry.get("stretch")
            if w and s:
                cells.append("`WS`")
            elif w:
                cells.append("`W`")
            elif s:
                cells.append("`S`")
            else:
                cells.append("")
        # pad to 7 columns in case week ranges are partial
        while len(cells) < 7:
            cells.append("")
        lines.append(f"| {label} | " + " | ".join(cells[:7]) + " |")

    lines.append("")
    lines.append("Legend: `W`=WORKOUT, `S`=STRETCH, `WS`=BOTH")
    lines.append("")
    lines.append("| TOTAL | VALUE |")
    lines.append("| ----- | ----- |")
    lines.append(f"| WORKOUTS | `{workout_days}/{days_in_period}` |")
    lines.append(f"| STRETCH | `{stretch_days}/{days_in_period}` |")
    lines.append("")

    # SLEEP
    lines.append("### SLEEP")
    lines.append("")
    sleep_chart_vals = []
    sleep_value_labels = []
    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        mins = [daily_data.get(d, {}).get("sleep_minutes") for d in week_days]
        mins = [m for m in mins if m is not None]
        if mins:
            avg_min = sum(mins) / len(mins)
            sleep_chart_vals.append(avg_min / 60)
            sleep_value_labels.append(f"`{format_minutes(avg_min)}`")
        else:
            sleep_chart_vals.append(None)
            sleep_value_labels.append("")

    sleep_chart = render_vertical_chart(week_labels, sleep_chart_vals, sleep_value_labels, height=10, col_width=12)
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
    mood_chart_vals = []
    mood_value_labels = []
    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        vals = [daily_data.get(d, {}).get("mood") for d in week_days]
        vals = [v for v in vals if v is not None]
        if vals:
            avg_val = sum(vals) / len(vals)
            mood_chart_vals.append(avg_val)
            mood_value_labels.append(f"`{format_mood_value(avg_val)}`")
        else:
            mood_chart_vals.append(None)
            mood_value_labels.append("")

    mood_chart = render_vertical_chart(week_labels, mood_chart_vals, mood_value_labels, height=10, col_width=12)
    lines.extend(wrap_code_block(mood_chart))
    lines.append("")

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

    daily_data = {}
    for day in daterange(month_start, month_end):
        path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
        if not os.path.exists(path):
            continue
        parsed = parse_daily_note(path)
        if parsed:
            daily_data[day] = parsed

    week_ranges = month_week_ranges(target_date.year, target_date.month)
    metrics_block = build_monthly_metrics(month_start, month_end, week_ranges, daily_data)

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
