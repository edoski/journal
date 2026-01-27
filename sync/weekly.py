#!/usr/bin/env python3
import argparse
import datetime
import os
import sys
from dataclasses import replace

from sync.models import Goal
from sync.logging import get_logger

from sync.constants import (
    JOURNAL_DIR,
    WEEKLY_TEMPLATE_PATH,
    MONTHLY_TEMPLATE_PATH,
    QUARTERLY_TEMPLATE_PATH,
    DAYS,
)
from sync.notes import (
    locked_note,
    parse_daily_note,
    ensure_note,
    replace_metrics_block,
    goals_section_bounds,
    extract_subsection_tasks,
    trim_blank_lines,
    join_sections,
)
from sync.dates import daterange, iso_week_range, quarter_of_date, quarter_id
from sync.formatting import format_minutes
from sync.metrics import (
    compute_period_metrics,
    compute_moving_average,
    load_daily_data,
    aggregate_activity_totals,
    aggregate_interrupt_overrun,
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
    render_weekly_training_grid,
    render_weekly_study_grid,
    wrap_code_block,
    render_waterfall_chart,
    render_screen_time_trend_table,
    WEEKLY_7DAY_CHART,
    WEEKLY_7DAY_MOOD,
)
from sync.writers.goals import render_goal_lines, build_goals_block
from sync.writers.media import build_media_section
from sync.readers.goals import filter_by_proximity, ensure_goal_ids

from sync.base import (
    carry_forward_goals,
    propagate_goal_status,
    atomic_write_note,
    load_quarterly_goals,
    process_pierced_goals,
)


def _load_monthly_goals(month_start):
    """
    Load goals from monthly note.

    Returns:
        Tuple of (monthly_tasks, quarterly_mirror, path, lines)
        - monthly_tasks: Goals from MONTHLY section (source, may contain pierced yearly)
        - quarterly_mirror: Goals from QUARTERLY section (mirror from quarterly note)
        - path: Path to monthly note
        - lines: Raw lines of monthly note
    """
    path = os.path.join(JOURNAL_DIR, f"{month_start.year}-{month_start.month:02d}.md")
    ensure_note(path, MONTHLY_TEMPLATE_PATH)
    try:
        with open(path, "r") as f:
            lines = f.read().splitlines()
    except FileNotFoundError:
        get_logger().debug("No monthly note at %s", path)
        return [], [], path, []
    except (PermissionError, OSError) as e:
        get_logger().warning("Failed to load monthly note from %s: %s", path, e)
        return [], [], path, []

    g_start, g_end = goals_section_bounds(lines)
    monthly_tasks = extract_subsection_tasks(lines, g_start, g_end, "MONTHLY")
    quarterly_mirror = extract_subsection_tasks(lines, g_start, g_end, "QUARTERLY")
    monthly_tasks = ensure_goal_ids(monthly_tasks, "monthly", month_start.isoformat())

    return monthly_tasks, quarterly_mirror, path, lines


def _write_monthly_goals(path, tasks, existing_lines):
    """
    Update the MONTHLY section in the monthly note while preserving QUARTERLY mirror.

    Args:
        path: Path to monthly note
        tasks: Updated MONTHLY tasks to write
        existing_lines: Current lines of the monthly note
    """
    g_start, g_end = goals_section_bounds(existing_lines)

    # Preserve existing QUARTERLY mirror section
    existing_quarterly = extract_subsection_tasks(existing_lines, g_start, g_end, "QUARTERLY")
    quarterly_rendered = (
        render_goal_lines(existing_quarterly)
        if existing_quarterly
        else ["", "_No quarterly goals have been defined yet._"]
    )

    # Rebuild Goals block with proper structure
    new_block = build_goals_block([
        ("QUARTERLY", quarterly_rendered),
        ("MONTHLY", render_goal_lines(tasks)),
    ])

    if g_start == -1:
        lines = (
            new_block
            + ([""] if existing_lines and existing_lines[0].strip() else [])
            + existing_lines
        )
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


def build_weekly_metrics(
    start_date,
    end_date,
    daily_data,
    prev_daily_data,
    prev_week_label,
    prior_week_metrics=None,
):
    """
    Build the metrics block for a weekly note.

    prev_week_label: wiki link like "[[2025-W50|LAST WEEK]]"
    prior_week_metrics: list of metrics dicts for prior 4 weeks (oldest first)
    """
    dates = [start_date + datetime.timedelta(days=i) for i in range(7)]
    today = datetime.date.today()

    # Compute metrics for current and previous week
    current_metrics = compute_period_metrics(dates, daily_data)
    prev_dates = [
        start_date - datetime.timedelta(days=7) + datetime.timedelta(days=i)
        for i in range(7)
    ]
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
        current_metrics,
        prev_metrics,
        "THIS WEEK",
        prev_week_label,
        ma_metrics=ma_metrics,
        ma_label="4-WK AVG" if ma_metrics else None,
        ma_training_unit="7",
        period_type="week",
        total_days=7,
    )
    sections.append(trim_blank_lines(summary_lines))

    # STUDY section (using activity totals for accuracy)
    study_lines = ["### **STUDY**"]
    study_hours = [
        round((m / 60) * 2) / 2 if m is not None and m > 0 else 0 for m in study_minutes
    ]
    study_values = []
    for d, m in zip(dates, study_minutes):
        if d > today:
            study_values.append("")
        else:
            study_values.append(
                format_minutes(m) if m is not None and m > 0 else "0h00m"
            )
    chart_lines = render_bar_chart(
        DAYS,
        study_hours,
        study_values,
        preset=WEEKLY_7DAY_CHART,
    )
    study_lines.extend(wrap_code_block(chart_lines))
    study_lines.append(
        f"**`SUM: {format_minutes(study_total_from_activities, always_show_both=True)}`**"
    )
    study_lines.append("")

    # Activity table (activity_totals already computed above)
    study_lines.extend(render_activity_table(activity_totals))
    study_lines.append("")

    current_week_date = today if start_date <= today <= end_date else None
    study_grid = render_weekly_study_grid(
        dates, daily_data, current_date=current_week_date
    )
    study_lines.extend(wrap_code_block(study_grid))
    study_lines.append("")

    # INTERRUPTIONS table
    total_interrupts, total_overruns, study_day_count = aggregate_interrupt_overrun(
        dates, daily_data
    )
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

    # PROCRASTINATION section (screen time waterfall + trend table)
    screen_time_totals = aggregate_screen_time(dates, daily_data)
    screen_time_totals = group_screen_time_by_percent(screen_time_totals)
    if screen_time_totals:
        procrastination_lines = ["### **PROCRASTINATION**"]
        waterfall_lines = render_waterfall_chart(screen_time_totals)
        # Remove header from waterfall (it includes its own) and wrap in code block
        chart_body = [line for line in waterfall_lines if not line.startswith("### ")]
        procrastination_lines.extend(wrap_code_block(chart_body))
        procrastination_lines.append("")
        procrastination_lines.extend(render_screen_time_trend_table(dates, daily_data))
        sections.append(trim_blank_lines(procrastination_lines))

    # SLEEP section (values on top of bars, 5-char bars like monthly)
    sleep_lines = ["### **SLEEP**"]
    sleep_hours = [
        round((m / 60) * 2) / 2 if m is not None else 0 for m in sleep_minutes
    ]
    sleep_values = []
    for d, m in zip(dates, sleep_minutes):
        if d > today:
            sleep_values.append("")
        else:
            sleep_values.append(
                format_minutes(m) if m is not None and m > 0 else "0h00m"
            )
    sleep_chart = render_bar_chart(
        DAYS,
        sleep_hours,
        sleep_values,
        preset=WEEKLY_7DAY_CHART,
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
        preset=WEEKLY_7DAY_MOOD,
    )
    mood_lines.extend(wrap_code_block(mood_chart))
    sections.append(trim_blank_lines(mood_lines))

    # MEDIA section
    media_lines = build_media_section(start_date, end_date, "week")
    sections.append(trim_blank_lines(media_lines))

    return join_sections(sections)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate weekly metrics from daily notes."
    )
    parser.add_argument("--file", help="Path to weekly note")
    parser.add_argument("--date", help="Date within week (YYYY-MM-DD)")
    parser.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Skip cleanup of previous period (used internally to avoid recursion)",
    )
    args = parser.parse_args()

    if args.date:
        target_date = datetime.datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        target_date = datetime.date.today()

    week_start, week_end = iso_week_range(target_date)
    year, week_num, _ = target_date.isocalendar()
    filename = f"{year}-W{week_num:02d}.md"

    note_path = args.file or os.path.join(JOURNAL_DIR, filename)

    # Determine month note for the target week (use week_start's month).
    month_start = datetime.date(week_start.year, week_start.month, 1)
    monthly_tasks, quarterly_mirror, monthly_path, monthly_lines = _load_monthly_goals(
        month_start
    )

    # Load quarterly note to get yearly goals for piercing
    yearly_mirror, quarterly_tasks, quarterly_path, quarterly_lines = (
        load_quarterly_goals(month_start)
    )

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
        for weeks_ago in range(
            4, 0, -1
        ):  # 4 weeks ago, 3 weeks ago, 2 weeks ago, 1 week ago
            prior_start = week_start - datetime.timedelta(days=7 * weeks_ago)
            prior_end = prior_start + datetime.timedelta(days=7)
            prior_data = load_daily_data(prior_start, prior_end)
            prior_dates = [prior_start + datetime.timedelta(days=i) for i in range(7)]
            prior_metrics = compute_period_metrics(prior_dates, prior_data)
            prior_week_metrics.append(prior_metrics)

        metrics_block = build_weekly_metrics(
            week_start,
            week_end,
            daily_data,
            prev_daily_data,
            prev_week_label,
            prior_week_metrics=prior_week_metrics,
        )

        try:
            with open(note_path, "r") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            lines = []

        # Parse existing goals in the weekly note
        monthly_mirror, weekly_tasks = _parse_weekly_note_goals(lines)
        monthly_mirror = ensure_goal_ids(monthly_mirror, "monthly", month_start.isoformat())
        weekly_tasks = ensure_goal_ids(weekly_tasks, "weekly", week_start.isoformat())

        # Carry forward open weekly goals from prior week
        year, week_num, _ = target_date.isocalendar()
        week_key = f"{year}-W{week_num:02d}"

        prev_week_path = os.path.join(
            JOURNAL_DIR, f"{prev_year}-W{prev_week_num:02d}.md"
        )
        prev_week_tasks = []
        if os.path.exists(prev_week_path):
            try:
                with open(prev_week_path, "r") as pf:
                    prev_lines = pf.read().splitlines()
                _, prev_week_tasks = _parse_weekly_note_goals(prev_lines)
                prev_week_tasks = ensure_goal_ids(prev_week_tasks, "weekly", prev_week_start.isoformat())
            except FileNotFoundError:
                logger.debug("Previous week note not found at %s", prev_week_path)
                prev_week_tasks = []
            except (PermissionError, OSError) as e:
                logger.warning("Failed to read previous week note at %s: %s", prev_week_path, e)
                prev_week_tasks = []

        weekly_tasks, _ = carry_forward_goals(
            prev_week_tasks, weekly_tasks, week_key, "weekly"
        )

        # Propagate status changes from weekly mirrors to sources
        monthly_changed = propagate_goal_status(monthly_tasks, monthly_mirror)
        # Propagate quarterly/yearly status from pierced goals in WEEKLY to their sources
        quarterly_changed = propagate_goal_status(quarterly_tasks, weekly_tasks)
        yearly_changed = propagate_goal_status(yearly_mirror, weekly_tasks)

        if monthly_changed:
            with locked_note(monthly_path):
                # refresh monthly_lines in case file changed
                try:
                    with open(monthly_path, "r") as mf:
                        monthly_lines = mf.read().splitlines()
                except FileNotFoundError:
                    logger.debug("Monthly note not found at %s", monthly_path)
                    monthly_lines = []
                except (PermissionError, OSError) as e:
                    logger.warning("Failed to read monthly note at %s: %s", monthly_path, e)
                    monthly_lines = []
                _write_monthly_goals(monthly_path, monthly_tasks, monthly_lines)

        # Write back quarterly note if quarterly or yearly status changed
        if quarterly_changed or yearly_changed:
            from sync.writers.goals import build_goals_block as bg

            with locked_note(quarterly_path):
                try:
                    with open(quarterly_path, "r") as qf:
                        quarterly_lines = qf.read().splitlines()
                except FileNotFoundError:
                    logger.debug("Quarterly note not found at %s", quarterly_path)
                    quarterly_lines = []
                except (PermissionError, OSError) as e:
                    logger.warning("Failed to read quarterly note at %s: %s", quarterly_path, e)
                    quarterly_lines = []
                g_start_q, g_end_q = goals_section_bounds(quarterly_lines)
                new_q_block = bg(
                    [
                        ("YEARLY", render_goal_lines(yearly_mirror)),
                        ("QUARTERLY", render_goal_lines(quarterly_tasks)),
                    ]
                )
                if g_start_q == -1:
                    quarterly_lines = (
                        new_q_block
                        + (
                            [""]
                            if quarterly_lines and quarterly_lines[0].strip()
                            else []
                        )
                        + quarterly_lines
                    )
                else:
                    quarterly_lines[g_start_q:g_end_q] = new_q_block
                atomic_write_note(quarterly_path, quarterly_lines)

        # Rebuild Goals block for weekly note (MONTHLY mirror + WEEKLY source)
        # MONTHLY mirror: preserve existing + add new from filter_by_proximity
        today = datetime.date.today()
        g_start, g_end = goals_section_bounds(lines)
        existing_monthly = extract_subsection_tasks(lines, g_start, g_end, "MONTHLY")
        existing_monthly_ids = {g.id for g in existing_monthly if g.id}

        # Get new monthly goals that aren't already in the note
        new_monthly = filter_by_proximity(monthly_tasks, 30, today)
        new_monthly = [g for g in new_monthly if g.id not in existing_monthly_ids]

        # Restore deadline info from source for existing monthly goals (for countdown)
        source_monthly_info = {g.id: g for g in monthly_tasks if g.id}
        restored_existing_monthly = []
        for g in existing_monthly:
            if g.id in source_monthly_info:
                src = source_monthly_info[g.id]
                restored_existing_monthly.append(replace(g,
                    deadline=src.deadline,
                    date_str=src.date_str,
                    reminder_offset=src.reminder_offset,
                ))
            else:
                restored_existing_monthly.append(g)

        final_monthly = restored_existing_monthly + new_monthly
        monthly_rendered = (
            render_goal_lines(final_monthly, today=today)
            if final_monthly
            else [
                "",
                "_No monthly goals have been defined yet._",
            ]
        )

        # WEEKLY source: weekly goals + pierced quarterly/yearly goals (≤30d deadline)
        original_weekly, final_pierced, [updated_quarterly, updated_yearly] = process_pierced_goals(
            existing_tasks=weekly_tasks,
            source_goal_lists=[quarterly_tasks, yearly_mirror],
            proximity_days=30,
            today=today,
        )

        # Render: original weekly goals (preserve dates) + final pierced goals (countdown)
        weekly_source_lines = render_goal_lines(original_weekly)
        if final_pierced:
            pierced_lines = render_goal_lines(final_pierced, today=today)
            weekly_source_lines = weekly_source_lines + pierced_lines

        goals_block = build_goals_block(
            [
                ("MONTHLY", monthly_rendered),
                ("WEEKLY", weekly_source_lines),
            ]
        )

        g_start, g_end = goals_section_bounds(lines)
        if g_start == -1:
            lines = goals_block + ([""] if lines and lines[0].strip() else []) + lines
        else:
            lines[g_start:g_end] = goals_block

        updated_lines = replace_metrics_block(lines, metrics_block)
        atomic_write_note(note_path, updated_lines)

    # One-time cleanup: re-sync previous week if it still has an arrow indicator
    if not args.no_cleanup and os.path.exists(prev_week_path):
        try:
            with open(prev_week_path, "r") as f:
                if "↓" in f.read():
                    # Re-sync removes arrow since it's a past period (current_date=None)
                    import subprocess

                    subprocess.run(
                        [
                            sys.executable,
                            "-m",
                            "sync.weekly",
                            "--date",
                            prev_week_start.isoformat(),
                            "--no-cleanup",
                        ],
                        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        check=False,
                    )
        except (PermissionError, OSError, subprocess.SubprocessError) as e:
            logger.debug("Cleanup subprocess failed: %s", e)


if __name__ == "__main__":
    main()
