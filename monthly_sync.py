#!/usr/bin/env python3
import argparse
import datetime
import os

from sync_utils import (
    JOURNAL_DIR,
    MONTHLY_TEMPLATE_PATH,
    QUARTERLY_TEMPLATE_PATH,
    DEFAULT_MONTHLY_DIR,
    DEFAULT_QUARTERLY_DIR,
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
    render_monthly_study_grid,
    STUDY_TARGET_MIN,
    STUDY_LEGEND_LINE,
    wrap_code_block,
    ensure_note,
    replace_metrics_block,
    round_half_up,
    format_training_ratio,
    parse_goal_tasks,
    render_goal_lines,
    goals_section_bounds,
    extract_subsection_tasks,
    build_goals_block,
    trim_blank_lines,
    join_sections,
    ensure_goal_ids,
    quarter_of_date,
    quarter_id,
    compute_period_metrics,
    render_sleep_stats_table,
    render_activity_table,
    render_interrupts_table,
)



def _load_quarterly_goals(month_start, quarterly_dir=None):
    """
    Load quarterly note goals for the quarter containing month_start.
    Returns (yearly_mirror, quarterly_tasks, path, lines).
    """
    quarterly_dir = quarterly_dir or DEFAULT_QUARTERLY_DIR
    q_year, q_num = quarter_of_date(month_start)
    quarter_key = quarter_id(q_year, q_num)
    filename = f"{quarter_key}.md"
    path = os.path.join(quarterly_dir, filename)
    ensure_note(path, QUARTERLY_TEMPLATE_PATH)
    try:
        with open(path, "r") as f:
            lines = f.read().splitlines()
    except Exception:
        return [], [], path, []

    g_start, g_end = goals_section_bounds(lines)
    yearly_mirror = extract_subsection_tasks(lines, g_start, g_end, "YEARLY")
    quarterly_tasks = extract_subsection_tasks(lines, g_start, g_end, "QUARTERLY")
    ensure_goal_ids(yearly_mirror, "yearly", str(q_year))
    ensure_goal_ids(quarterly_tasks, "quarterly", quarter_key)
    return yearly_mirror, quarterly_tasks, path, lines


def _write_quarterly_goals(path, yearly_tasks, quarterly_tasks, existing_lines):
    g_start, g_end = goals_section_bounds(existing_lines)
    new_block = build_goals_block([
        ("YEARLY", render_goal_lines(yearly_tasks)),
        ("QUARTERLY", render_goal_lines(quarterly_tasks)),
    ])
    if g_start == -1:
        lines = new_block + ([""] if existing_lines and existing_lines[0].strip() else []) + existing_lines
    else:
        lines = existing_lines[:]
        lines[g_start:g_end] = new_block
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write("\n".join(lines).rstrip() + "\n")
    os.replace(tmp, path)


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
    current_metrics = compute_period_metrics(dates, daily_data)
    prev_metrics = compute_period_metrics(list(prev_daily_data.keys()), prev_daily_data)

    sleep_avg = current_metrics["sleep_avg_minutes"]
    mood_avg = current_metrics["mood_avg"]
    workout_days = current_metrics["workout_count"]
    stretch_days = current_metrics["stretch_count"]

    # Collect study minutes list and total from activity tables (more accurate than frontmatter)
    study_minutes = [daily_data.get(d, {}).get("study_minutes") for d in dates]
    activity_totals = {}
    for d in dates:
        daily = daily_data.get(d)
        if not daily:
            continue
        for activity, mins in daily.get("activity_totals", {}).items():
            activity_totals[activity] = activity_totals.get(activity, 0) + mins
    study_total_from_activities = sum(activity_totals.values())

    sections = []
    
    # Summary
    summary_lines = render_summary_table(
        current_metrics, prev_metrics,
        current_month_label, prev_month_label
    )
    sections.append(trim_blank_lines(summary_lines))

    # STUDY section (using activity totals for accuracy)
    study_lines = ["### **STUDY**"]

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
    study_lines.extend(wrap_code_block(chart_lines))
    study_lines.append(f"**`SUM: {format_minutes(study_total_from_activities, always_show_both=True)}`**")
    study_lines.append("")

    # Activity table (activity_totals already computed above)
    study_lines.extend(render_activity_table(activity_totals))
    study_lines.append("")

    # Full-study-day deltas per week (mirror training delta behavior)
    study_week_done = []
    for week_days in week_day_lists:
        done = sum(
            1
            for d in week_days
            if (daily_data.get(d, {}).get("study_minutes") or 0) >= STUDY_TARGET_MIN
        )
        study_week_done.append(done)

    study_grid_delta_labels = []
    for idx, week_days in enumerate(week_day_lists):
        week_start = week_days[0]
        if is_current_month and week_start > today:
            study_grid_delta_labels.append("")
            continue
        if idx == 0:
            study_grid_delta_labels.append("—")
            continue
        delta = compute_percent_change(study_week_done[idx], study_week_done[idx - 1])
        study_grid_delta_labels.append(format_percent_change(delta))

    current_month_date = today if is_current_month else None
    study_grid = render_monthly_study_grid(
        week_ranges,
        daily_data,
        current_date=current_month_date,
        delta_labels=study_grid_delta_labels,
    )
    study_lines.extend(wrap_code_block(study_grid))
    study_lines.append("")

    # INTERRUPTIONS table
    interrupt_totals = [daily_data.get(d, {}).get("interrupt_minutes", 0) for d in dates]
    overrun_totals = [daily_data.get(d, {}).get("overrun_minutes", 0) for d in dates]
    total_interrupts = sum(interrupt_totals)
    total_overruns = sum(overrun_totals)

    # Use only study days (any study minutes > 0) as the denominator for both
    study_day_count = sum(1 for m in study_minutes if m and m > 0)
    avg_interrupts = total_interrupts / max(1, study_day_count)
    avg_overruns = total_overruns / max(1, study_day_count)
    
    study_lines.extend(render_interrupts_table(avg_interrupts, avg_overruns))
    study_lines.append("")
    sections.append(trim_blank_lines(study_lines))

    # TRAINING section
    training_lines = ["### **TRAINING**"]
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

        prev_week_days = week_day_lists[idx - 1]

        # Compare full periods (no partial-window truncation)
        curr_workout_count = sum(1 for d in week_days if daily_data.get(d, {}).get("workout"))
        prev_workout_count = sum(1 for d in prev_week_days if daily_data.get(d, {}).get("workout"))
        workout_delta = compute_percent_change(curr_workout_count, prev_workout_count)
        workout_delta_labels.append(format_percent_change(workout_delta))

        curr_stretch_count = sum(1 for d in week_days if daily_data.get(d, {}).get("stretch"))
        prev_stretch_count = sum(1 for d in prev_week_days if daily_data.get(d, {}).get("stretch"))
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
        current_date=current_month_date,
    )
    # Inject counts into headers of the grid lines
    elapsed_days = current_metrics.get("days_up_to_today", days_in_period)
    if training_grid:
        for idx, line in enumerate(training_grid):
            if line.startswith("┌ WORKOUT"):
                training_grid[idx] = f"┌ WORKOUT ({workout_days:02d}/{elapsed_days:02d})"
            if line.startswith("┌ STRETCH"):
                training_grid[idx] = f"┌ STRETCH ({stretch_days:02d}/{elapsed_days:02d})"

    training_lines.extend(wrap_code_block(training_grid))
    training_lines.append("")
    sections.append(trim_blank_lines(training_lines))

    # SLEEP section (5-char bars, weekly averages)
    sleep_lines = ["### **SLEEP**"]
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

    # MOOD section (5-char bars, weekly averages, always show decimal)
    mood_lines = ["### **MOOD**"]
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
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    return join_sections(sections)


def main():
    parser = argparse.ArgumentParser(description="Generate monthly metrics from daily notes.")
    parser.add_argument("--file", help="Path to monthly note")
    parser.add_argument("--month", help="Month (YYYY-MM)")
    parser.add_argument("--monthly-dir", help="Directory for monthly notes")
    parser.add_argument("--quarterly-dir", help="Directory for quarterly notes")
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
    quarterly_dir = args.quarterly_dir or DEFAULT_QUARTERLY_DIR
    note_path = args.file or os.path.join(monthly_dir, filename)

    with locked_note(note_path):
        ensure_note(note_path, MONTHLY_TEMPLATE_PATH)

        try:
            with open(note_path, "r") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            lines = []

        # Parse goals (existing mirrors + monthly source) and carry forward open monthly goals.
        g_start, g_end = goals_section_bounds(lines)
        quarterly_mirror = extract_subsection_tasks(lines, g_start, g_end, "QUARTERLY")
        monthly_tasks = extract_subsection_tasks(lines, g_start, g_end, "MONTHLY")
        ensure_goal_ids(monthly_tasks, "monthly", month_start.isoformat())
        q_year, q_num = quarter_of_date(month_start)
        quarter_key = quarter_id(q_year, q_num)
        ensure_goal_ids(quarterly_mirror, "quarterly", quarter_key)

        # Determine previous month path
        if month_start.month == 1:
            prev_year = month_start.year - 1
            prev_month = 12
        else:
            prev_year = month_start.year
            prev_month = month_start.month - 1
        prev_month_start, _ = month_range(prev_year, prev_month)
        prev_path = os.path.join(monthly_dir, f"{prev_year}-{prev_month:02d}.md")
        try:
            with open(prev_path, "r") as pf:
                prev_lines = pf.read().splitlines()
            p_start, p_end = goals_section_bounds(prev_lines)
            prev_tasks = extract_subsection_tasks(prev_lines, p_start, p_end, "MONTHLY")
            ensure_goal_ids(prev_tasks, "monthly", prev_month_start.isoformat())
        except Exception:
            prev_tasks = []

        open_prev = [t for t in prev_tasks if not t.get("done")]
        existing_ids = {t["id"] for t in monthly_tasks if t.get("id")}
        for t in open_prev:
            if t.get("id") in existing_ids:
                continue
            monthly_tasks.append({**t, "done": False})
            existing_ids.add(t.get("id"))

        # Load quarterly goals (source of truth) and propagate any completed statuses from the monthly mirror.
        yearly_mirror, quarterly_tasks, quarterly_path, quarterly_lines = _load_quarterly_goals(
            month_start, quarterly_dir
        )
        mirror_lookup = {t.get("id"): t for t in quarterly_mirror if t.get("id")}
        quarterly_changed = False
        for task in quarterly_tasks:
            mirror = mirror_lookup.get(task.get("id"))
            if mirror and mirror.get("done") and not task.get("done"):
                task["done"] = True
                quarterly_changed = True
        if quarterly_changed:
            _write_quarterly_goals(quarterly_path, yearly_mirror, quarterly_tasks, quarterly_lines)

        # Rewrite Goals block with QUARTERLY mirror + MONTHLY source.
        quarterly_lines = render_goal_lines(quarterly_tasks) if quarterly_tasks else [
            "",
            "_No quarterly goals have been defined yet._",
        ]
        new_goals_block = build_goals_block([
            ("QUARTERLY", quarterly_lines),
            ("MONTHLY", render_goal_lines(monthly_tasks)),
        ])
        if g_start == -1:
            lines = new_goals_block + ([""] if lines and lines[0].strip() else []) + lines
        else:
            lines[g_start:g_end] = new_goals_block

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

        updated_lines = replace_metrics_block(lines, metrics_block)
        tmp_path = note_path + ".tmp"
        with open(tmp_path, "w") as f:
            f.write("\n".join(updated_lines).rstrip() + "\n")
        os.replace(tmp_path, note_path)


if __name__ == "__main__":
    main()
