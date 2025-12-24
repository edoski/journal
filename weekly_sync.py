#!/usr/bin/env python3
import argparse
import datetime
import os

from sync_utils import (
    JOURNAL_DIR,
    WEEKLY_TEMPLATE_PATH,
    MONTHLY_TEMPLATE_PATH,
    DEFAULT_WEEKLY_DIR,
    DEFAULT_MONTHLY_DIR,
    locked_note,
    DAYS,
    parse_daily_note,
    daterange,
    iso_week_range,
    format_minutes,
    render_summary_table,
    render_weekly_chart,
    render_weekly_training_grid,
    wrap_code_block,
    ensure_note,
    replace_metrics_block,
    goals_section_bounds,
    extract_subsection_tasks,
    parse_goal_tasks,
    render_goal_lines,
    build_goals_block,
)


WEEKLY_CARRY_GUARD_PATH = os.path.expanduser("~/.cache/journal_sync/carry_forward_weekly.last_run")


def _week_guard_ran(week_start):
    try:
        with open(WEEKLY_CARRY_GUARD_PATH, "r") as f:
            return f.read().strip() == week_start.isoformat()
    except Exception:
        return False


def _mark_week_guard(week_start):
    try:
        os.makedirs(os.path.dirname(WEEKLY_CARRY_GUARD_PATH), exist_ok=True)
        with open(WEEKLY_CARRY_GUARD_PATH, "w") as f:
            f.write(week_start.isoformat())
    except Exception:
        pass


def _load_monthly_goals(month_start, monthly_dir=None):
    monthly_dir = monthly_dir or DEFAULT_MONTHLY_DIR
    path = os.path.join(monthly_dir, f"{month_start.year}-{month_start.month:02d}.md")
    ensure_note(path, MONTHLY_TEMPLATE_PATH)
    try:
        with open(path, "r") as f:
            lines = f.read().splitlines()
    except Exception:
        return [], path, []

    g_start, g_end = goals_section_bounds(lines)
    if g_start == -1:
        tasks = []
    else:
        body = lines[g_start + 1:g_end]
        if body and body[0].strip() == "---":
            body = body[1:]
        tasks = parse_goal_tasks(body)
    return tasks, path, lines


def _write_monthly_goals(path, tasks, existing_lines):
    g_start, g_end = goals_section_bounds(existing_lines)
    new_block = ["## Goals", "---"] + render_goal_lines(tasks)
    if g_start == -1:
        lines = new_block + ([""] if existing_lines and existing_lines[0].strip() else []) + existing_lines
    else:
        lines = existing_lines[:]
        lines[g_start:g_end] = new_block
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write("\n".join(lines).rstrip() + "\n")
    os.replace(tmp, path)


def _parse_weekly_note_goals(lines):
    g_start, g_end = goals_section_bounds(lines)
    if g_start == -1:
        return [], []
    monthly_mirror = extract_subsection_tasks(lines, g_start, g_end, "MONTHLY")
    weekly_tasks = extract_subsection_tasks(lines, g_start, g_end, "WEEKLY")
    if not weekly_tasks and not monthly_mirror:
        body = lines[g_start + 1:g_end]
        if body and body[0].strip() == "---":
            body = body[1:]
        weekly_tasks = parse_goal_tasks(body)
    return monthly_mirror, weekly_tasks


def compute_period_metrics(dates, daily_data):
    """
    Compute aggregated metrics for a list of dates.
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


def build_weekly_metrics(start_date, end_date, daily_data, prev_daily_data, prev_week_label):
    """
    Build the metrics block for a weekly note.
    
    prev_week_label: wiki link like "[[2025-W50|LAST WEEK]]"
    """
    days_in_period = 7
    dates = [start_date + datetime.timedelta(days=i) for i in range(7)]
    today = datetime.date.today()

    # Compute metrics for current and previous week
    current_metrics = compute_period_metrics(dates, daily_data)
    prev_dates = [start_date - datetime.timedelta(days=7) + datetime.timedelta(days=i) for i in range(7)]
    prev_metrics = compute_period_metrics(prev_dates, prev_daily_data)

    study_minutes = [daily_data.get(d, {}).get("study_minutes") for d in dates]
    sleep_minutes = [daily_data.get(d, {}).get("sleep_minutes") for d in dates]
    mood_vals = [daily_data.get(d, {}).get("mood") for d in dates]

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
        "THIS WEEK", prev_week_label
    ))

    # STUDY section (using activity totals for accuracy)
    lines.append("### **STUDY**")
    study_hours = [m / 60 if m is not None and m > 0 else 0 for m in study_minutes]
    study_values = []
    for d, m in zip(dates, study_minutes):
        if d > today:
            study_values.append("")
        else:
            study_values.append(format_minutes(m) if m is not None and m > 0 else "0h00m")
    chart_lines = render_weekly_chart(
        DAYS,
        study_hours,
        study_values,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=8,
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
    training_grid = render_weekly_training_grid(
        dates, daily_data, workout_days, stretch_days
    )
    lines.extend(wrap_code_block(training_grid))
    lines.append("")

    # SLEEP section (values on top of bars, 5-char bars like monthly)
    lines.append("### **SLEEP**")
    sleep_hours = [m / 60 if m is not None else 0 for m in sleep_minutes]
    sleep_values = []
    for d, m in zip(dates, sleep_minutes):
        if d > today:
            sleep_values.append("")
        else:
            sleep_values.append(format_minutes(m) if m is not None and m > 0 else "0h00m")
    sleep_chart = render_weekly_chart(
        DAYS,
        sleep_hours,
        sleep_values,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=8,
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

    # MOOD section (values on top of bars, always show decimal)
    lines.append("### **MOOD**")
    mood_chart_vals = [m if m is not None else 0 for m in mood_vals]
    mood_value_labels = []
    for d, m in zip(dates, mood_vals):
        if d > today:
            mood_value_labels.append("")
        else:
            mood_value_labels.append(f"{m:.1f}" if m is not None else "0.0")
    mood_chart = render_weekly_chart(
        DAYS,
        mood_chart_vals,
        mood_value_labels,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=8,
        center_labels_on_bars=True,
    )
    lines.extend(wrap_code_block(mood_chart))

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

    # Determine month note for the target week (use week_start's month).
    month_start = datetime.date(week_start.year, week_start.month, 1)
    monthly_tasks, monthly_path, monthly_lines = _load_monthly_goals(month_start)

    with locked_note(note_path):
        ensure_note(note_path, WEEKLY_TEMPLATE_PATH)

        # Load current week's daily data
        daily_data = {}
        for day in daterange(week_start, week_end):
            path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
            if not os.path.exists(path):
                continue
            parsed = parse_daily_note(path)
            if parsed:
                daily_data[day] = parsed

        # Load previous week's daily data for comparison
        prev_week_start = week_start - datetime.timedelta(days=7)
        prev_week_end = week_end - datetime.timedelta(days=7)
        prev_year, prev_week_num, _ = prev_week_start.isocalendar()
        prev_week_label = f"**[[{prev_year}-W{prev_week_num:02d}\\|LAST WEEK]]**"

        prev_daily_data = {}
        for day in daterange(prev_week_start, prev_week_end):
            path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
            if not os.path.exists(path):
                continue
            parsed = parse_daily_note(path)
            if parsed:
                prev_daily_data[day] = parsed

        metrics_block = build_weekly_metrics(week_start, week_end, daily_data, prev_daily_data, prev_week_label)

        try:
            with open(note_path, "r") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            lines = []

        # Parse existing goals in the weekly note
        monthly_mirror, weekly_tasks = _parse_weekly_note_goals(lines)

        # Carry forward open weekly goals from prior week once per week
        if not _week_guard_ran(week_start):
            prev_week_path = os.path.join(weekly_dir, f"{prev_year}-W{prev_week_num:02d}.md")
            prev_week_tasks = []
            if os.path.exists(prev_week_path):
                try:
                    with open(prev_week_path, "r") as pf:
                        prev_lines = pf.read().splitlines()
                    _, prev_week_tasks = _parse_weekly_note_goals(prev_lines)
                except Exception:
                    prev_week_tasks = []
            open_prev = [t for t in prev_week_tasks if not t.get("done")]
            existing_canon = {t["canonical"] for t in weekly_tasks}
            for t in open_prev:
                if t["canonical"] in existing_canon:
                    continue
                weekly_tasks.append({**t, "done": False})
                existing_canon.add(t["canonical"])
            _mark_week_guard(week_start)

        # Propagate MONTHLY status changes from weekly mirror to monthly source
        mirror_lookup = {t["canonical"]: t for t in monthly_mirror}
        monthly_changed = False
        for task in monthly_tasks:
            mirror = mirror_lookup.get(task["canonical"])
            if mirror and mirror.get("done") and not task.get("done"):
                task["done"] = True
                monthly_changed = True

        if monthly_changed:
            with locked_note(monthly_path):
                # refresh monthly_lines in case file changed
                try:
                    with open(monthly_path, "r") as mf:
                        monthly_lines = mf.read().splitlines()
                except Exception:
                    monthly_lines = []
                _write_monthly_goals(monthly_path, monthly_tasks, monthly_lines)

        # Rebuild Goals block for weekly note (MONTHLY mirror + WEEKLY source)
        goals_block = build_goals_block([
            ("MONTHLY", render_goal_lines(monthly_tasks)),
            ("WEEKLY", render_goal_lines(weekly_tasks)),
        ])

        g_start, g_end = goals_section_bounds(lines)
        if g_start == -1:
            lines = goals_block + ([""] if lines and lines[0].strip() else []) + lines
        else:
            lines[g_start:g_end] = goals_block

        updated_lines = replace_metrics_block(lines, metrics_block)
        tmp_path = note_path + ".tmp"
        with open(tmp_path, "w") as f:
            f.write("\n".join(updated_lines).rstrip() + "\n")
        os.replace(tmp_path, note_path)


if __name__ == "__main__":
    main()
