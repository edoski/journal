"""Daily goal orchestration helpers owned by the goals domain."""

from __future__ import annotations

import datetime
import os

from sync.constants import (
    JOURNAL_DIR,
    MONTHLY_TEMPLATE_PATH,
    QUARTERLY_TEMPLATE_PATH,
    WEEKLY_TEMPLATE_PATH,
)
from sync.dates import iso_week_range, quarter_id, quarter_of_date
from sync.goals.carry_forward import carry_forward_with_tombstones
from sync.goals.identity import goal_id_kind
from sync.goals.note_store import render_goals_or_empty
from sync.goals.period_pipeline import SourceWriteConfig, propagate_source_sections
from sync.contracts.goals import Goal
from sync.notes.locking import locked_note
from sync.ports.cache import GoalCarryForwardCacheStore
from sync.ports.goals import GoalStore
from sync.ports.notes import NoteStore
from sync.readers.goals import ensure_goal_ids
from sync.writers.goals import render_goal_lines


def weekly_note_path(date_obj: datetime.date, *, journal_dir: str = JOURNAL_DIR) -> str:
    """Get the path to the weekly note for a given date."""
    year, week_num, _ = date_obj.isocalendar()
    filename = f"{year}-W{week_num:02d}.md"
    return os.path.join(journal_dir, filename)


def load_weekly_goals(
    date_obj: datetime.date,
    *,
    note_store: NoteStore,
    goal_store: GoalStore,
    journal_dir: str = JOURNAL_DIR,
) -> tuple[list[Goal], list[Goal], list[Goal], list[Goal], str, str, str]:
    """Load weekly/monthly/quarterly/yearly source goals used by daily sync."""
    path = weekly_note_path(date_obj, journal_dir=journal_dir)
    week_start, _ = iso_week_range(date_obj)
    month_start = datetime.date(date_obj.year, date_obj.month, 1)
    month_key = f"{month_start.year}-{month_start.month:02d}"
    monthly_path = os.path.join(journal_dir, f"{month_key}.md")

    q_year, q_num = quarter_of_date(date_obj)
    qtr_key = quarter_id(q_year, q_num)
    quarterly_path = os.path.join(journal_dir, f"{qtr_key}.md")

    lines = note_store.read(path)
    if lines is None:
        return [], [], [], [], path, monthly_path, quarterly_path

    weekly_tasks = goal_store.extract(
        lines,
        "WEEKLY",
        horizon="weekly",
        period_key=week_start.isoformat(),
    )

    monthly_lines = note_store.read_or_create(monthly_path, MONTHLY_TEMPLATE_PATH)
    monthly_tasks = goal_store.extract(
        monthly_lines,
        "MONTHLY",
        horizon="monthly",
        period_key=month_key,
    )

    quarterly_lines = note_store.read_or_create(quarterly_path, QUARTERLY_TEMPLATE_PATH)
    quarterly_tasks = goal_store.extract(
        quarterly_lines,
        "QUARTERLY",
        horizon="quarterly",
        period_key=qtr_key,
    )
    yearly_tasks = goal_store.extract(
        quarterly_lines,
        "YEARLY",
        horizon="yearly",
        period_key=str(q_year),
    )

    return (
        weekly_tasks,
        monthly_tasks,
        quarterly_tasks,
        yearly_tasks,
        path,
        monthly_path,
        quarterly_path,
    )


def write_weekly_goals(
    date_obj: datetime.date,
    weekly_tasks: list[Goal],
    monthly_tasks: list[Goal] | None = None,
    quarterly_tasks: list[Goal] | None = None,
    yearly_tasks: list[Goal] | None = None,
    *,
    note_store: NoteStore,
    goal_store: GoalStore,
    journal_dir: str = JOURNAL_DIR,
) -> str:
    """Write source goal sections for weekly/monthly/quarterly notes."""
    path = weekly_note_path(date_obj, journal_dir=journal_dir)
    with locked_note(path):
        lines = note_store.read_or_create(path, WEEKLY_TEMPLATE_PATH)
        existing_monthly = goal_store.extract(lines, "MONTHLY")
        propagate_source_sections(
            config=SourceWriteConfig(path=path),
            sections=[
                ("MONTHLY", render_goals_or_empty("MONTHLY", existing_monthly)),
                ("WEEKLY", render_goal_lines(weekly_tasks)),
            ],
            existing_lines=lines,
        )

    if monthly_tasks:
        month_start = datetime.date(date_obj.year, date_obj.month, 1)
        monthly_path = os.path.join(
            journal_dir,
            f"{month_start.year}-{month_start.month:02d}.md",
        )
        with locked_note(monthly_path):
            monthly_lines = note_store.read_or_create(
                monthly_path, MONTHLY_TEMPLATE_PATH
            )
            existing_quarterly = goal_store.extract(monthly_lines, "QUARTERLY")
            propagate_source_sections(
                config=SourceWriteConfig(path=monthly_path),
                sections=[
                    (
                        "QUARTERLY",
                        render_goals_or_empty("QUARTERLY", existing_quarterly),
                    ),
                    ("MONTHLY", render_goal_lines(monthly_tasks)),
                ],
                existing_lines=monthly_lines,
            )

    if quarterly_tasks or yearly_tasks:
        q_year, q_num = quarter_of_date(date_obj)
        qtr_key = quarter_id(q_year, q_num)
        quarterly_path = os.path.join(journal_dir, f"{qtr_key}.md")
        with locked_note(quarterly_path):
            quarterly_lines = note_store.read_or_create(
                quarterly_path,
                QUARTERLY_TEMPLATE_PATH,
            )
            existing_yearly = goal_store.extract(quarterly_lines, "YEARLY")
            existing_quarterly_src = goal_store.extract(quarterly_lines, "QUARTERLY")
            yearly_to_write = yearly_tasks if yearly_tasks else existing_yearly
            quarterly_to_write = (
                quarterly_tasks if quarterly_tasks else existing_quarterly_src
            )
            propagate_source_sections(
                config=SourceWriteConfig(path=quarterly_path),
                sections=[
                    ("YEARLY", render_goal_lines(yearly_to_write)),
                    ("QUARTERLY", render_goal_lines(quarterly_to_write)),
                ],
                existing_lines=quarterly_lines,
            )

    return path


def parse_daily_goal_subsections(
    lines: list[str],
    *,
    day: datetime.date,
    goal_store: GoalStore,
) -> tuple[list[Goal], list[Goal]]:
    """Extract WEEKLY and DAILY goal subsections from a daily note."""
    week_start, _ = iso_week_range(day)
    weekly_tasks = goal_store.extract(
        lines,
        "WEEKLY",
        horizon="weekly",
        period_key=week_start.isoformat(),
    )
    daily_tasks = goal_store.extract(
        lines,
        "DAILY",
        horizon="daily",
        period_key=day.isoformat(),
    )
    return weekly_tasks, daily_tasks


def carry_forward_daily_tasks(
    today_date: datetime.date,
    yesterday_date: datetime.date,
    existing_daily_tasks: list[Goal],
    *,
    carry_cache_store: GoalCarryForwardCacheStore,
    note_store: NoteStore,
    goal_store: GoalStore,
    journal_dir: str = JOURNAL_DIR,
) -> tuple[list[Goal], int]:
    """Carry forward open DAILY goals from yesterday into today."""
    yesterday_path = os.path.join(journal_dir, f"{yesterday_date:%Y-%m-%d}.md")
    y_lines = note_store.read(yesterday_path)
    if y_lines is None:
        return existing_daily_tasks, 0

    y_daily = goal_store.extract(
        y_lines,
        "DAILY",
        horizon="daily",
        period_key=yesterday_date.isoformat(),
    )

    today_key = today_date.isoformat()
    existing_daily_tasks = ensure_goal_ids(existing_daily_tasks, "daily", today_key)

    open_y = [
        task
        for task in y_daily
        if not task.done and goal_id_kind(task.id or "") != "reminder"
    ]
    if not open_y:
        return existing_daily_tasks, 0

    return carry_forward_with_tombstones(
        prev_tasks=open_y,
        current_tasks=existing_daily_tasks,
        period_key=today_key,
        horizon="daily",
        cache_store=carry_cache_store,
    )
