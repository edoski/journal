#!/usr/bin/env python3
import argparse
import datetime
import os

from sync.constants import (
    WEEKLY_TEMPLATE_PATH,
    MONTHLY_TEMPLATE_PATH,
    DAYS,
)
from sync.io import safe_read_file
from sync.notes.locking import locked_note
from sync.notes.sections import (
    trim_blank_lines,
    join_sections,
)
from sync.dates import daterange
from sync.formatting import format_minutes
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
    render_weekly_training_grid,
    render_weekly_study_grid,
    wrap_code_block,
    render_screen_time_trend_table,
    WEEKLY_7DAY_CHART,
    WEEKLY_7DAY_MOOD,
)
from sync.writers.goals import render_goal_lines
from sync.periods.sections import (
    append_interrupts_table,
    append_media_section,
    append_summary_section,
    append_training_type_table,
    build_procrastination_section,
)
from sync.goals.carry_forward import carry_forward_with_tombstones

from sync.goals.reconcile import (
    load_quarterly_goals,
    reconcile_goal_lists,
    merge_mirror_goals,
    process_pierced_goals,
)
from sync.periods.runtime import (
    journal_path,
    maybe_cleanup_previous,
    open_period_note,
    resolve_note_path,
    write_note_metrics,
)
from sync.periods.windows import build_week_window
from sync.goals.note_store import (
    apply_goals_sections,
    ensure_note_lines,
    extract_goals,
    render_goals_or_empty,
    write_goals_sections,
)


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
    append_summary_section(
        sections,
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
    append_interrupts_table(study_lines, dates, daily_data)
    sections.append(trim_blank_lines(study_lines))

    # TRAINING section
    training_lines = ["### **TRAINING**"]
    current_week_date = today if start_date <= today <= end_date else None
    mindful_days = current_metrics["mindful_count"]
    training_grid = render_weekly_training_grid(
        dates,
        daily_data,
        mindful_days,
        workout_days,
        stretch_days,
        current_date=current_week_date,
    )
    training_lines.extend(wrap_code_block(training_grid))
    training_lines.append("")
    append_training_type_table(training_lines, dates, daily_data)
    sections.append(trim_blank_lines(training_lines))

    # PROCRASTINATION section (screen time waterfall + trend table)
    screen_time_totals = aggregate_screen_time(dates, daily_data)
    screen_time_totals = group_screen_time_by_percent(screen_time_totals)
    procrastination_lines = build_procrastination_section(
        screen_time_totals,
        render_screen_time_trend_table(dates, daily_data),
    )
    if procrastination_lines:
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
    append_media_section(sections, start_date, end_date, "week")

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

    window = build_week_window(target_date)
    note_path = resolve_note_path(window.filename, args.file)

    # Determine month note for the target week (use week_start's month).
    month_start = datetime.date(window.start.year, window.start.month, 1)
    monthly_path = journal_path(f"{month_start.year}-{month_start.month:02d}.md")
    monthly_lines = ensure_note_lines(monthly_path, MONTHLY_TEMPLATE_PATH)
    monthly_tasks = extract_goals(
        monthly_lines,
        "MONTHLY",
        horizon="monthly",
        period_key=month_start.isoformat(),
    )

    # Load quarterly note to get yearly goals for piercing
    yearly_mirror, quarterly_tasks, quarterly_path, quarterly_lines = (
        load_quarterly_goals(month_start)
    )

    with open_period_note(note_path, WEEKLY_TEMPLATE_PATH) as lines:
        # Load current week's daily data
        week_dates = list(daterange(window.start, window.end))
        daily_data = load_daily_data_for_dates(week_dates)

        # Load previous week's daily data for comparison
        prev_week_dates = list(daterange(window.previous_start, window.previous_end))
        prev_daily_data = load_daily_data_for_dates(prev_week_dates)

        # Load 4 prior weeks for moving average calculation
        prior_week_metrics = load_prior_period_metrics(
            range(4, 0, -1),
            window.prior_bounds,
        )

        metrics_block = build_weekly_metrics(
            window.start,
            window.end,
            daily_data,
            prev_daily_data,
            window.previous_label,
            prior_week_metrics=prior_week_metrics,
        )

        # Parse existing goals in the weekly note
        monthly_mirror = extract_goals(
            lines,
            "MONTHLY",
            horizon="monthly",
            period_key=month_start.isoformat(),
        )
        weekly_tasks = extract_goals(
            lines,
            "WEEKLY",
            horizon="weekly",
            period_key=window.start.isoformat(),
        )

        # Carry forward open weekly goals from prior week
        week_key = f"{window.year}-W{window.week_num:02d}"

        prev_week_path = journal_path(window.previous_filename)
        prev_week_tasks = []
        if os.path.exists(prev_week_path):
            prev_lines = safe_read_file(prev_week_path)
            if prev_lines is not None:
                prev_week_tasks = extract_goals(
                    prev_lines,
                    "WEEKLY",
                    horizon="weekly",
                    period_key=window.previous_start.isoformat(),
                )

        weekly_tasks, _ = carry_forward_with_tombstones(
            prev_week_tasks, weekly_tasks, week_key, "weekly"
        )

        # Reconcile MONTHLY source <-> WEEKLY MONTHLY-mirror state.
        monthly_tasks, monthly_mirror, monthly_changed, _ = reconcile_goal_lists(
            monthly_tasks,
            monthly_mirror,
            monthly_path,
            note_path,
        )

        if monthly_changed:
            with locked_note(monthly_path):
                monthly_lines = ensure_note_lines(monthly_path, MONTHLY_TEMPLATE_PATH)
                existing_quarterly = extract_goals(monthly_lines, "QUARTERLY")
                write_goals_sections(
                    monthly_path,
                    monthly_lines,
                    [
                        (
                            "QUARTERLY",
                            render_goals_or_empty("QUARTERLY", existing_quarterly),
                        ),
                        ("MONTHLY", render_goal_lines(monthly_tasks)),
                    ],
                    insert_if_missing=True,
                )

        # Rebuild Goals block for weekly note (MONTHLY mirror + WEEKLY source)
        # MONTHLY mirror: preserve existing + add new from filter_by_proximity
        today = datetime.date.today()
        final_monthly = merge_mirror_goals(
            monthly_mirror,
            monthly_tasks,
            proximity_days=30,
            today=today,
            source_path=monthly_path,
            mirror_path=note_path,
        )
        monthly_rendered = render_goals_or_empty("MONTHLY", final_monthly, today=today)

        # WEEKLY source: weekly goals + pierced quarterly/yearly goals (≤30d deadline)
        original_weekly, final_pierced, [updated_quarterly, updated_yearly] = (
            process_pierced_goals(
                existing_tasks=weekly_tasks,
                source_goal_lists=[quarterly_tasks, yearly_mirror],
                proximity_days=30,
                today=today,
                note_path=note_path,
                source_paths=[quarterly_path, quarterly_path],
            )
        )
        quarterly_changed = updated_quarterly != quarterly_tasks
        yearly_changed = updated_yearly != yearly_mirror
        quarterly_tasks = updated_quarterly
        yearly_mirror = updated_yearly

        # Write back quarterly note if quarterly or yearly status changed.
        if quarterly_changed or yearly_changed:
            with locked_note(quarterly_path):
                quarterly_lines = safe_read_file(quarterly_path) or []
                write_goals_sections(
                    quarterly_path,
                    quarterly_lines,
                    [
                        ("YEARLY", render_goal_lines(yearly_mirror)),
                        ("QUARTERLY", render_goal_lines(quarterly_tasks)),
                    ],
                    insert_if_missing=True,
                )

        # Render: original weekly goals (preserve dates) + final pierced goals (countdown)
        weekly_source_lines = render_goal_lines(original_weekly)
        if final_pierced:
            pierced_lines = render_goal_lines(final_pierced, today=today)
            weekly_source_lines = weekly_source_lines + pierced_lines

        lines = apply_goals_sections(
            lines,
            [("MONTHLY", monthly_rendered), ("WEEKLY", weekly_source_lines)],
            insert_if_missing=True,
        )

        write_note_metrics(note_path, lines, metrics_block)

    # One-time cleanup: re-sync previous week if it still has an arrow indicator
    maybe_cleanup_previous(
        enabled=not args.no_cleanup,
        previous_note_path=journal_path(window.previous_filename),
        module_name="sync.periods.weekly",
        module_args=["--date", window.previous_start.isoformat(), "--no-cleanup"],
    )


if __name__ == "__main__":
    main()
