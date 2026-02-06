"""Goal section pipeline for daily note orchestration."""

from __future__ import annotations

import datetime

from sync.constants import REMINDERS_PATH
from sync.goals.reconcile import reconcile_goal_lists, process_pierced_goals
from sync.goals.reminders import get_reminders_for_date, load_reminder_rules
from sync.notes.sections import goals_section_bounds
from sync.readers.goals import filter_by_proximity
from sync.writers.goals import build_goals_block, render_goal_lines

from ..goals import (
    carry_forward_daily_tasks,
    load_weekly_goals,
    parse_daily_goal_subsections,
    write_weekly_goals,
)


def apply_goals_section(
    lines: list[str],
    today: datetime.date,
    file_path: str,
    yaml_end_idx: int,
) -> None:
    """Update daily Goals section and sync mirrored source files."""
    # Parse existing goal subsections from today's note.
    existing_weekly_tasks, existing_daily_tasks = parse_daily_goal_subsections(lines)

    # Carry forward yesterday's incomplete DAILY goals (ID-based, idempotent across runs).
    yesterday = today - datetime.timedelta(days=1)
    existing_daily_tasks, _ = carry_forward_daily_tasks(
        today, yesterday, existing_daily_tasks
    )

    # Inject configured reminders from REMINDERS.md (required file).
    rules = load_reminder_rules(REMINDERS_PATH)
    reminders = get_reminders_for_date(today, rules)
    existing_ids = {t.id for t in existing_daily_tasks if t.id}
    for reminder in reminders:
        if reminder.id not in existing_ids:
            existing_daily_tasks.append(reminder)
            existing_ids.add(reminder.id)

    # Load weekly goals (and monthly/quarterly/yearly sources used for piercing).
    (
        weekly_tasks,
        monthly_tasks,
        quarterly_tasks,
        yearly_tasks,
        weekly_path,
        monthly_path,
        quarterly_path,
    ) = load_weekly_goals(today)

    # Reconcile WEEKLY source <-> DAILY WEEKLY-mirror state.
    updated_weekly_tasks, _, weekly_changed, _ = reconcile_goal_lists(
        weekly_tasks,
        existing_weekly_tasks,
        weekly_path,
        file_path,
    )

    # Rebuild Goals block with WEEKLY mirror then DAILY goals.
    # Filter weekly tasks to only show those with deadlines within 7 days (or no deadline).
    filtered_weekly = filter_by_proximity(updated_weekly_tasks, 7, today)
    weekly_lines = (
        render_goal_lines(filtered_weekly, today=today)
        if filtered_weekly
        else [
            "",
            "_No weekly goals have been defined yet._",
        ]
    )

    # DAILY source: daily goals + pierced monthly/quarterly/yearly goals (≤7d deadline)
    (
        original_daily,
        final_pierced,
        [updated_monthly, updated_quarterly, updated_yearly],
    ) = process_pierced_goals(
        existing_tasks=existing_daily_tasks,
        source_goal_lists=[monthly_tasks, quarterly_tasks, yearly_tasks],
        proximity_days=7,
        today=today,
        note_path=file_path,
        source_paths=[monthly_path, quarterly_path, quarterly_path],
    )
    monthly_changed = updated_monthly != monthly_tasks
    quarterly_changed = updated_quarterly != quarterly_tasks
    yearly_changed = updated_yearly != yearly_tasks

    # Write back weekly/monthly/quarterly files if status reconciliation changed them.
    if weekly_changed or monthly_changed or quarterly_changed or yearly_changed:
        write_weekly_goals(
            today,
            updated_weekly_tasks,
            updated_monthly if monthly_changed else None,
            updated_quarterly if quarterly_changed else None,
            updated_yearly if yearly_changed else None,
        )

    # Render: original daily goals + final pierced goals (with countdown)
    daily_source_lines = render_goal_lines(original_daily, today=today)
    if final_pierced:
        pierced_lines = render_goal_lines(final_pierced, today=today)
        daily_source_lines = daily_source_lines + pierced_lines

    goals_block = build_goals_block(
        [
            ("WEEKLY", weekly_lines),
            ("DAILY", daily_source_lines),
        ]
    )

    g_start, g_end = goals_section_bounds(lines)
    if g_start == -1:
        insert_pos = yaml_end_idx + 1 if yaml_end_idx != -1 else 0
        lines[insert_pos:insert_pos] = goals_block
    else:
        lines[g_start:g_end] = goals_block
