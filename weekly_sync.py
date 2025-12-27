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
    render_bar_chart,
    render_weekly_training_grid,
    render_weekly_study_grid,
    wrap_code_block,
    ensure_note,
    replace_metrics_block,
    goals_section_bounds,
    extract_subsection_tasks,
    render_goal_lines,
    build_goals_block,
    trim_blank_lines,
    join_sections,
    ensure_goal_ids,
    compute_period_metrics,
    compute_moving_average,
    load_daily_data,
    render_sleep_stats_table,
    render_activity_table,
    render_interrupts_table,
    aggregate_activity_totals,
    aggregate_interrupt_overrun,
)



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
    tasks = extract_subsection_tasks(lines, g_start, g_end, "MONTHLY")
    ensure_goal_ids(tasks, "monthly", month_start.isoformat())
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
    return monthly_mirror, weekly_tasks



def build_weekly_metrics(start_date, end_date, daily_data, prev_daily_data, prev_week_label, prior_week_metrics=None):
    """
    Build the metrics block for a weekly note.
    
    prev_week_label: wiki link like "[[2025-W50|LAST WEEK]]"
    prior_week_metrics: list of metrics dicts for prior 4 weeks (oldest first)
    """
    dates = [start_date + datetime.timedelta(days=i) for i in range(7)]
    today = datetime.date.today()

    # Compute metrics for current and previous week
    current_metrics = compute_period_metrics(dates, daily_data)
    prev_dates = [start_date - datetime.timedelta(days=7) + datetime.timedelta(days=i) for i in range(7)]
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
    summary_lines = render_summary_table(
        current_metrics, prev_metrics,
        "THIS WEEK", prev_week_label,
        ma_metrics=ma_metrics,
        ma_label="4-WK AVG" if ma_metrics else None,
        ma_training_unit="7",
    )
    sections.append(trim_blank_lines(summary_lines))

    # STUDY section (using activity totals for accuracy)
    study_lines = ["### **STUDY**"]
    study_hours = [m / 60 if m is not None and m > 0 else 0 for m in study_minutes]
    study_values = []
    for d, m in zip(dates, study_minutes):
        if d > today:
            study_values.append("")
        else:
            study_values.append(format_minutes(m) if m is not None and m > 0 else "0h00m")
    chart_lines = render_bar_chart(
        DAYS,
        study_hours,
        study_values,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=8,
        label_prefix="   ",
    )
    study_lines.extend(wrap_code_block(chart_lines))
    study_lines.append(f"**`SUM: {format_minutes(study_total_from_activities, always_show_both=True)}`**")
    study_lines.append("")

    # Activity table (activity_totals already computed above)
    study_lines.extend(render_activity_table(activity_totals))
    study_lines.append("")

    current_week_date = today if start_date <= today <= end_date else None
    study_grid = render_weekly_study_grid(dates, daily_data, current_date=current_week_date)
    study_lines.extend(wrap_code_block(study_grid))
    study_lines.append("")

    # INTERRUPTIONS table
    total_interrupts, total_overruns, study_day_count = aggregate_interrupt_overrun(dates, daily_data)
    avg_interrupts = total_interrupts / max(1, study_day_count)
    avg_overruns = total_overruns / max(1, study_day_count)
    
    study_lines.extend(render_interrupts_table(avg_interrupts, avg_overruns))
    study_lines.append("")
    sections.append(trim_blank_lines(study_lines))

    # TRAINING section
    training_lines = ["### **TRAINING**"]
    current_week_date = today if start_date <= today <= end_date else None
    training_grid = render_weekly_training_grid(
        dates, daily_data, workout_days, stretch_days, current_date=current_week_date
    )
    training_lines.extend(wrap_code_block(training_grid))
    training_lines.append("")
    sections.append(trim_blank_lines(training_lines))

    # SLEEP section (values on top of bars, 5-char bars like monthly)
    sleep_lines = ["### **SLEEP**"]
    sleep_hours = [m / 60 if m is not None else 0 for m in sleep_minutes]
    sleep_values = []
    for d, m in zip(dates, sleep_minutes):
        if d > today:
            sleep_values.append("")
        else:
            sleep_values.append(format_minutes(m) if m is not None and m > 0 else "0h00m")
    sleep_chart = render_bar_chart(
        DAYS,
        sleep_hours,
        sleep_values,
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=8,
        label_prefix="   ",
    )
    sleep_lines.extend(wrap_code_block(sleep_chart))
    sleep_lines.append("")

    awake_vals = [daily_data.get(d, {}).get("awake_minutes") for d in dates if daily_data.get(d)]
    awakenings_vals = [daily_data.get(d, {}).get("awakenings") for d in dates if daily_data.get(d)]
    awake_vals = [v for v in awake_vals if v is not None]
    awakenings_vals = [v for v in awakenings_vals if v is not None]

    avg_awake = sum(awake_vals) / len(awake_vals) if awake_vals else None
    avg_awakenings = sum(awakenings_vals) / len(awakenings_vals) if awakenings_vals else None

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
        height=10,
        y_max=10,
        bar_width=5,
        col_spacing=8,
        label_prefix="   ",
        center_labels_on_bars=True,
    )
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    return join_sections(sections)


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

        # Load 4 prior weeks for moving average calculation
        prior_week_metrics = []
        for weeks_ago in range(4, 0, -1):  # 4 weeks ago, 3 weeks ago, 2 weeks ago, 1 week ago
            prior_start = week_start - datetime.timedelta(days=7 * weeks_ago)
            prior_end = prior_start + datetime.timedelta(days=7)
            prior_data = load_daily_data(prior_start, prior_end)
            prior_dates = [prior_start + datetime.timedelta(days=i) for i in range(7)]
            prior_metrics = compute_period_metrics(prior_dates, prior_data)
            prior_week_metrics.append(prior_metrics)

        metrics_block = build_weekly_metrics(
            week_start, week_end, daily_data, prev_daily_data, prev_week_label,
            prior_week_metrics=prior_week_metrics
        )

        try:
            with open(note_path, "r") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            lines = []

        # Parse existing goals in the weekly note
        monthly_mirror, weekly_tasks = _parse_weekly_note_goals(lines)
        ensure_goal_ids(monthly_mirror, "monthly", month_start.isoformat())
        ensure_goal_ids(weekly_tasks, "weekly", week_start.isoformat())

        # Carry forward open weekly goals from prior week (ID-based, idempotent)
        prev_week_path = os.path.join(weekly_dir, f"{prev_year}-W{prev_week_num:02d}.md")
        prev_week_tasks = []
        if os.path.exists(prev_week_path):
            try:
                with open(prev_week_path, "r") as pf:
                    prev_lines = pf.read().splitlines()
                _, prev_week_tasks = _parse_weekly_note_goals(prev_lines)
                ensure_goal_ids(prev_week_tasks, "weekly", prev_week_start.isoformat())
            except Exception:
                prev_week_tasks = []
        open_prev = [t for t in prev_week_tasks if not t.get("done")]
        existing_ids = {t["id"] for t in weekly_tasks if t.get("id")}
        for t in open_prev:
            if t.get("id") in existing_ids:
                continue
            weekly_tasks.append({**t, "done": False})
            existing_ids.add(t.get("id"))

        # Propagate MONTHLY status changes from weekly mirror to monthly source
        mirror_lookup = {t["id"]: t for t in monthly_mirror if t.get("id")}
        monthly_changed = False
        for task in monthly_tasks:
            mirror = mirror_lookup.get(task.get("id"))
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
        monthly_lines = render_goal_lines(monthly_tasks) if monthly_tasks else [
            "",
            "_No monthly goals have been defined yet._",
        ]
        goals_block = build_goals_block([
            ("MONTHLY", monthly_lines),
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
