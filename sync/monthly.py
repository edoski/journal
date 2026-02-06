#!/usr/bin/env python3
import argparse
import datetime
import os

from sync.constants import (
    JOURNAL_DIR,
    MONTHLY_TEMPLATE_PATH,
    STUDY_TARGET_MIN,
)
from sync.io import safe_read_file, atomic_write_note
from sync.notes.locking import locked_note
from sync.notes.sections import (
    ensure_note,
    replace_metrics_block,
    goals_section_bounds,
    extract_subsection_tasks,
    trim_blank_lines,
    join_sections,
    splice_goals_section,
)
from sync.dates import (
    daterange,
    month_range,
    month_week_ranges,
    format_week_label,
    shift_month,
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
    load_daily_data_for_dates,
    load_prior_period_metrics,
    aggregate_activity_totals,
    aggregate_screen_time,
    group_screen_time_by_percent,
)
from sync.writers.tables import (
    render_sleep_stats_table,
    render_activity_table,
)
from sync.writers.charts import (
    render_bar_chart,
    render_training_frequency_grid,
    render_monthly_study_grid,
    wrap_code_block,
    render_screen_time_period_table,
    MONTHLY_WEEK_STUDY,
    MONTHLY_WEEK_METRIC,
    MONTHLY_WEEK_MOOD,
)
from sync.writers.goals import render_goal_lines, build_goals_block
from sync.period_sections import (
    append_interrupts_table,
    append_media_section,
    append_summary_section,
    append_training_type_table,
    build_procrastination_section,
)
from sync.goals.carry_forward import carry_forward_with_tombstones
from sync.readers.goals import ensure_goal_ids

from sync.goals.reconcile import (
    load_quarterly_goals,
    reconcile_goal_lists,
    merge_mirror_goals,
    process_pierced_goals,
)
from sync.period_cleanup import resync_if_marker


def _write_quarterly_goals(path, yearly_tasks, quarterly_tasks, existing_lines):
    new_block = build_goals_block(
        [
            ("YEARLY", render_goal_lines(yearly_tasks)),
            ("QUARTERLY", render_goal_lines(quarterly_tasks)),
        ]
    )
    lines = existing_lines[:]
    splice_goals_section(lines, new_block, insert_if_missing=True)
    atomic_write_note(path, lines)


def build_monthly_metrics(
    start_date,
    end_date,
    week_ranges,
    daily_data,
    prev_daily_data,
    current_month_label,
    prev_month_label,
    prior_month_metrics=None,
):
    """
    Build the metrics block for a monthly note.

    current_month_label: e.g., "DEC"
    prev_month_label: wiki link like "[[2025-11|NOV]]"
    prior_month_metrics: list of metrics dicts for prior 3 months (oldest first)
    """
    days_in_period = (end_date - start_date).days + 1
    dates = list(daterange(start_date, end_date))
    today = datetime.date.today()

    # Compute metrics for current and previous month
    current_metrics = compute_period_metrics(dates, daily_data)
    prev_metrics = compute_period_metrics(list(prev_daily_data.keys()), prev_daily_data)

    # Compute 3-month moving average
    ma_metrics = None
    if prior_month_metrics and len(prior_month_metrics) >= 3:
        ma_metrics = compute_moving_average(prior_month_metrics, 3)

    sleep_avg = current_metrics["sleep_avg_minutes"]
    workout_days = current_metrics["workout_count"]
    stretch_days = current_metrics["stretch_count"]

    # Collect study total from activity tables (more accurate than frontmatter)
    activity_totals = aggregate_activity_totals(dates, daily_data)
    study_total_from_activities = sum(activity_totals.values())

    sections = []

    # Summary with MA
    append_summary_section(
        sections,
        current_metrics,
        prev_metrics,
        current_month_label,
        prev_month_label,
        ma_metrics=ma_metrics,
        ma_label="3-MO AVG" if ma_metrics else None,
        ma_training_unit="mo",
        period_type="month",
        total_days=days_in_period,
    )

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
        study_chart_vals.append(
            round((total_min / 60) * 2) / 2
        )  # Round to nearest 0.5h
        # Always use 0h00m format for zero values
        if start > today:
            study_value_labels.append("")
        else:
            study_value_labels.append(
                format_minutes(total_min) if total_min > 0 else "0h00m"
            )

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

    chart_lines = render_bar_chart(
        week_labels,
        study_chart_vals,
        study_value_labels,
        preset=MONTHLY_WEEK_STUDY,
        delta_labels=study_delta_labels,
    )
    study_lines.extend(wrap_code_block(chart_lines))
    study_lines.append(
        f"**`SUM: {format_minutes(study_total_from_activities, always_show_both=True)}`**"
    )
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
    append_interrupts_table(study_lines, dates, daily_data)
    sections.append(trim_blank_lines(study_lines))

    # TRAINING section
    training_lines = ["### **TRAINING**"]
    mindful_delta_labels = []
    workout_delta_labels = []
    stretch_delta_labels = []
    for idx, week_days in enumerate(week_day_lists):
        week_start = week_days[0]
        if is_current_month and week_start > today:
            mindful_delta_labels.append("")
            workout_delta_labels.append("")
            stretch_delta_labels.append("")
            continue
        if idx == 0:
            mindful_delta_labels.append("—")
            workout_delta_labels.append("—")
            stretch_delta_labels.append("—")
            continue

        prev_week_days = week_day_lists[idx - 1]

        # Compare full periods (no partial-window truncation)
        curr_mindful_count = sum(
            1 for d in week_days if daily_data.get(d, {}).get("meditate")
        )
        prev_mindful_count = sum(
            1 for d in prev_week_days if daily_data.get(d, {}).get("meditate")
        )
        mindful_delta = compute_percent_change(curr_mindful_count, prev_mindful_count)
        mindful_delta_labels.append(format_percent_change(mindful_delta))

        curr_workout_count = sum(
            1 for d in week_days if daily_data.get(d, {}).get("workout")
        )
        prev_workout_count = sum(
            1 for d in prev_week_days if daily_data.get(d, {}).get("workout")
        )
        workout_delta = compute_percent_change(curr_workout_count, prev_workout_count)
        workout_delta_labels.append(format_percent_change(workout_delta))

        curr_stretch_count = sum(
            1 for d in week_days if daily_data.get(d, {}).get("stretch")
        )
        prev_stretch_count = sum(
            1 for d in prev_week_days if daily_data.get(d, {}).get("stretch")
        )
        stretch_delta = compute_percent_change(curr_stretch_count, prev_stretch_count)
        stretch_delta_labels.append(format_percent_change(stretch_delta))

    mindful_days = current_metrics["mindful_count"]
    training_grid = render_training_frequency_grid(
        week_ranges,
        daily_data,
        mindful_days,
        workout_days,
        stretch_days,
        days_in_period,
        mindful_delta_labels=mindful_delta_labels,
        workout_delta_labels=workout_delta_labels,
        stretch_delta_labels=stretch_delta_labels,
        current_date=current_month_date,
    )
    # Inject counts into headers of the grid lines
    elapsed_days = current_metrics.get("days_up_to_today", days_in_period)
    if training_grid:
        for idx, line in enumerate(training_grid):
            if line.startswith("┌ MINDFUL"):
                training_grid[idx] = (
                    f"┌ MINDFUL ({mindful_days:02d}/{elapsed_days:02d})"
                )
            if line.startswith("┌ WORKOUT"):
                training_grid[idx] = (
                    f"┌ WORKOUT ({workout_days:02d}/{elapsed_days:02d})"
                )
            if line.startswith("┌ STRETCH"):
                training_grid[idx] = (
                    f"┌ STRETCH ({stretch_days:02d}/{elapsed_days:02d})"
                )

    training_lines.extend(wrap_code_block(training_grid))
    training_lines.append("")
    append_training_type_table(training_lines, dates, daily_data)
    sections.append(trim_blank_lines(training_lines))

    # PROCRASTINATION section (screen time waterfall + trend table)
    screen_time_totals = aggregate_screen_time(dates, daily_data)
    screen_time_totals = group_screen_time_by_percent(screen_time_totals)
    if screen_time_totals:
        # Weekly trend table with wikilinks to weekly notes
        week_labels = [format_week_label(s, e) for s, e in week_ranges]
        week_wikilinks = []
        for (s, _), label in zip(week_ranges, week_labels):
            year, week_num, _ = s.isocalendar()
            week_wikilinks.append(f"[[{year}-W{week_num:02d}\\|{label}]]")
        procrastination_lines = build_procrastination_section(
            screen_time_totals,
            render_screen_time_period_table(
                week_ranges, daily_data, "WEEK", week_labels, week_wikilinks
            ),
        )
        sections.append(trim_blank_lines(procrastination_lines))

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
            sleep_chart_vals.append(
                round((avg_min / 60) * 2) / 2
            )  # Round to nearest 0.5h
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
        prev_vals = [
            v for v in sleep_week_raw[idx - 1][:prev_slice_len] if v is not None
        ]
        curr_avg = (sum(curr_vals) / len(curr_vals)) if curr_vals else 0
        prev_avg = (sum(prev_vals) / len(prev_vals)) if prev_vals else 0
        delta = compute_percent_change(curr_avg, prev_avg)
        sleep_delta_labels.append(format_percent_change(delta))

    sleep_chart = render_bar_chart(
        week_labels,
        sleep_chart_vals,
        sleep_value_labels,
        preset=MONTHLY_WEEK_METRIC,
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
        prev_vals = [
            v for v in mood_week_raw[idx - 1][:prev_slice_len] if v is not None
        ]
        curr_avg = (sum(curr_vals) / len(curr_vals)) if curr_vals else 0
        prev_avg = (sum(prev_vals) / len(prev_vals)) if prev_vals else 0
        delta = compute_percent_change(curr_avg, prev_avg)
        mood_delta_labels.append(format_percent_change(delta))

    mood_chart = render_bar_chart(
        week_labels,
        mood_chart_vals,
        mood_value_labels,
        preset=MONTHLY_WEEK_MOOD,
        delta_labels=mood_delta_labels,
    )
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    append_media_section(sections, start_date, end_date, "month")

    return join_sections(sections)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate monthly metrics from daily notes."
    )
    parser.add_argument("--file", help="Path to monthly note")
    parser.add_argument("--month", help="Month (YYYY-MM)")
    parser.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Skip cleanup of previous period (used internally to avoid recursion)",
    )
    args = parser.parse_args()

    if args.month:
        year, month = map(int, args.month.split("-"))
        target_date = datetime.date(year, month, 1)
    else:
        today = datetime.date.today()
        target_date = datetime.date(today.year, today.month, 1)

    month_start, month_end = month_range(target_date.year, target_date.month)
    filename = f"{target_date.year}-{target_date.month:02d}.md"

    note_path = args.file or os.path.join(JOURNAL_DIR, filename)

    with locked_note(note_path):
        ensure_note(note_path, MONTHLY_TEMPLATE_PATH)

        lines = safe_read_file(note_path) or []

        # Parse goals (existing mirrors + monthly source) and carry forward open monthly goals.
        g_start, g_end = goals_section_bounds(lines)
        quarterly_mirror = extract_subsection_tasks(lines, g_start, g_end, "QUARTERLY")
        monthly_tasks = extract_subsection_tasks(lines, g_start, g_end, "MONTHLY")
        monthly_tasks = ensure_goal_ids(
            monthly_tasks, "monthly", month_start.isoformat()
        )
        q_year, q_num = quarter_of_date(month_start)
        quarter_key = quarter_id(q_year, q_num)
        quarterly_mirror = ensure_goal_ids(quarterly_mirror, "quarterly", quarter_key)

        # Determine previous month path
        month_key = f"{month_start.year}-{month_start.month:02d}"

        prev_year, prev_month = shift_month(month_start.year, month_start.month, -1)
        prev_month_start, _ = month_range(prev_year, prev_month)
        prev_path = os.path.join(JOURNAL_DIR, f"{prev_year}-{prev_month:02d}.md")
        prev_lines = safe_read_file(prev_path)
        if prev_lines is not None:
            p_start, p_end = goals_section_bounds(prev_lines)
            prev_tasks = extract_subsection_tasks(prev_lines, p_start, p_end, "MONTHLY")
            prev_tasks = ensure_goal_ids(
                prev_tasks, "monthly", prev_month_start.isoformat()
            )
        else:
            prev_tasks = []

        monthly_tasks, _ = carry_forward_with_tombstones(
            prev_tasks, monthly_tasks, month_key, "monthly"
        )

        # Load quarterly goals and reconcile QUARTERLY source <-> MONTHLY mirror state.
        yearly_mirror, quarterly_tasks, quarterly_path, quarterly_lines = (
            load_quarterly_goals(month_start)
        )
        quarterly_tasks, quarterly_mirror, quarterly_changed, _ = reconcile_goal_lists(
            quarterly_tasks,
            quarterly_mirror,
            quarterly_path,
            note_path,
        )

        # Rewrite Goals block with QUARTERLY mirror + MONTHLY source.
        # QUARTERLY mirror: preserve existing + add new from filter_by_proximity
        today = datetime.date.today()
        final_quarterly = merge_mirror_goals(
            quarterly_mirror,
            quarterly_tasks,
            proximity_days=90,
            today=today,
            source_path=quarterly_path,
            mirror_path=note_path,
        )
        quarterly_lines_rendered = (
            render_goal_lines(final_quarterly, today=today)
            if final_quarterly
            else [
                "",
                "_No quarterly goals have been defined yet._",
            ]
        )

        # MONTHLY source section: monthly goals + pierced yearly goals (≤90d deadline)
        original_monthly, final_pierced, [updated_yearly] = process_pierced_goals(
            existing_tasks=monthly_tasks,
            source_goal_lists=[yearly_mirror],
            proximity_days=90,
            today=today,
            note_path=note_path,
            source_paths=[quarterly_path],
        )
        yearly_changed = updated_yearly != yearly_mirror
        yearly_mirror = updated_yearly

        # Persist source updates in quarterly note when any source list changed.
        if quarterly_changed or yearly_changed:
            _write_quarterly_goals(
                quarterly_path, yearly_mirror, quarterly_tasks, quarterly_lines
            )

        # Render: original monthly goals (preserve dates) + final pierced yearly (countdown)
        monthly_source_lines = render_goal_lines(original_monthly)
        if final_pierced:
            pierced_lines = render_goal_lines(final_pierced, today=today)
            monthly_source_lines = monthly_source_lines + pierced_lines

        new_goals_block = build_goals_block(
            [
                ("QUARTERLY", quarterly_lines_rendered),
                ("MONTHLY", monthly_source_lines),
            ]
        )
        splice_goals_section(lines, new_goals_block, insert_if_missing=True)

        # Load current month's daily data
        month_dates = list(daterange(month_start, month_end))
        daily_data = load_daily_data_for_dates(month_dates)

        # Load previous month's daily data for comparison
        prev_year, prev_month = shift_month(target_date.year, target_date.month, -1)

        prev_month_start, prev_month_end = month_range(prev_year, prev_month)
        prev_month_label = f"**[[{prev_year}-{prev_month:02d}\\|LAST MONTH]]**"
        current_month_label = "THIS MONTH"

        prev_month_dates = list(daterange(prev_month_start, prev_month_end))
        prev_daily_data = load_daily_data_for_dates(prev_month_dates)

        # Load 3 prior months for moving average calculation
        def _prior_month_bounds(months_ago: int) -> tuple[datetime.date, datetime.date]:
            prior_year, prior_month_num = shift_month(
                target_date.year, target_date.month, -months_ago
            )
            return month_range(prior_year, prior_month_num)

        prior_month_metrics = load_prior_period_metrics(
            range(3, 0, -1), _prior_month_bounds
        )

        week_ranges = month_week_ranges(target_date.year, target_date.month)
        metrics_block = build_monthly_metrics(
            month_start,
            month_end,
            week_ranges,
            daily_data,
            prev_daily_data,
            current_month_label,
            prev_month_label,
            prior_month_metrics=prior_month_metrics,
        )

        updated_lines = replace_metrics_block(lines, metrics_block)
        atomic_write_note(note_path, updated_lines)

    # One-time cleanup: re-sync previous month if it still has an arrow indicator
    prev_month_path = os.path.join(JOURNAL_DIR, f"{prev_year}-{prev_month:02d}.md")
    if not args.no_cleanup:
        # Re-sync removes arrow since it's a past period (current_date=None)
        resync_if_marker(
            prev_month_path,
            "sync.monthly",
            ["--month", f"{prev_year}-{prev_month:02d}", "--no-cleanup"],
        )


if __name__ == "__main__":
    main()
