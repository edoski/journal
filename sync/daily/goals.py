"""
Goal management functions for daily sync.

Extracted from orchestrator.py to improve modularity and maintainability.
"""

from __future__ import annotations

import datetime
import os

from sync.constants import JOURNAL_DIR, WEEKLY_TEMPLATE_PATH
from sync.goals.carry_forward import carry_forward_with_tombstones
from sync.io import safe_read_file
from sync.logging import get_logger
from sync.models import Goal
from sync.notes.locking import locked_note
from sync.dates import iso_week_range
from sync.readers.goals import ensure_goal_ids
from sync.writers.goals import render_goal_lines
from sync.goals.note_store import (
    ensure_note_lines,
    extract_goals,
    render_goals_or_empty,
    write_goals_sections,
)

logger = get_logger()


def weekly_note_path(date_obj: datetime.date) -> str:
    """Get the path to the weekly note for a given date."""
    year, week_num, _ = date_obj.isocalendar()
    filename = f"{year}-W{week_num:02d}.md"
    return os.path.join(JOURNAL_DIR, filename)


def load_weekly_goals(
    date_obj: datetime.date,
) -> tuple[list[Goal], list[Goal], list[Goal], list[Goal], str, str, str]:
    """
    Load all goals from the weekly note for daily sync.

    Args:
        date_obj: Date to load goals for

    Returns:
        Tuple of (
            weekly_tasks,
            monthly_tasks,
            quarterly_tasks,
            yearly_tasks,
            weekly_path,
            monthly_path,
            quarterly_path,
        )
        - weekly_tasks: Goals from WEEKLY section (source, may contain pierced Q/Y)
        - monthly_tasks: Goals from MONTHLY source note (preserves deadline info)
        - quarterly_tasks: Goals from QUARTERLY source note (preserves deadline info)
        - yearly_tasks: Goals from YEARLY section in quarterly note (preserves deadline info)
        - path: Path to weekly note
    """
    path = weekly_note_path(date_obj)
    month_start = datetime.date(date_obj.year, date_obj.month, 1)
    month_key = f"{month_start.year}-{month_start.month:02d}"
    monthly_path = os.path.join(JOURNAL_DIR, f"{month_key}.md")
    from sync.dates import quarter_of_date, quarter_id

    q_year, q_num = quarter_of_date(date_obj)
    qtr_key = quarter_id(q_year, q_num)
    quarterly_path = os.path.join(JOURNAL_DIR, f"{qtr_key}.md")

    lines = safe_read_file(path)
    if lines is None:
        return [], [], [], [], path, monthly_path, quarterly_path

    weekly_tasks = extract_goals(
        lines,
        "WEEKLY",
        horizon="weekly",
        period_key=date_obj.isoformat(),
    )

    # Load goals from SOURCE notes (not mirrors) to preserve deadline/reminder_offset.
    # Mirror sections (e.g., weekly's MONTHLY) only have countdown text, not original dates.
    from sync.constants import MONTHLY_TEMPLATE_PATH, QUARTERLY_TEMPLATE_PATH

    monthly_tasks: list[Goal] = []
    quarterly_tasks: list[Goal] = []
    yearly_tasks: list[Goal] = []

    # Load MONTHLY goals from monthly note's MONTHLY section (source)
    monthly_lines = ensure_note_lines(monthly_path, MONTHLY_TEMPLATE_PATH)
    if monthly_lines is not None:
        monthly_tasks = extract_goals(
            monthly_lines,
            "MONTHLY",
            horizon="monthly",
            period_key=month_key,
        )

    # Load QUARTERLY and YEARLY goals from quarterly note (source for both)
    quarterly_lines = ensure_note_lines(quarterly_path, QUARTERLY_TEMPLATE_PATH)
    if quarterly_lines is not None:
        quarterly_tasks = extract_goals(
            quarterly_lines,
            "QUARTERLY",
            horizon="quarterly",
            period_key=qtr_key,
        )
        yearly_tasks = extract_goals(
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
) -> str:
    """
    Update the WEEKLY subsection in the weekly note and propagate status to monthly/quarterly.

    Args:
        date_obj: Date context for the weekly note
        weekly_tasks: Updated task list to write
        monthly_tasks: Monthly tasks with updated status (if changed)
        quarterly_tasks: Quarterly tasks with updated status (if changed)
        yearly_tasks: Yearly tasks with updated status (if changed)

    Returns:
        Path to the updated weekly note
    """
    path = weekly_note_path(date_obj)
    with locked_note(path):
        lines = ensure_note_lines(path, WEEKLY_TEMPLATE_PATH)
        existing_monthly = extract_goals(lines, "MONTHLY")
        write_goals_sections(
            path,
            lines,
            [
                ("MONTHLY", render_goals_or_empty("MONTHLY", existing_monthly)),
                ("WEEKLY", render_goal_lines(weekly_tasks)),
            ],
            insert_if_missing=True,
        )

    # Propagate status changes to monthly note if monthly goals were updated
    if monthly_tasks:
        from sync.constants import MONTHLY_TEMPLATE_PATH

        month_start = datetime.date(date_obj.year, date_obj.month, 1)
        monthly_path = os.path.join(
            JOURNAL_DIR, f"{month_start.year}-{month_start.month:02d}.md"
        )
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

    # Propagate status changes to quarterly note if quarterly/yearly goals were updated
    if quarterly_tasks or yearly_tasks:
        from sync.constants import QUARTERLY_TEMPLATE_PATH
        from sync.dates import quarter_of_date, quarter_id

        q_year, q_num = quarter_of_date(date_obj)
        qtr_key = quarter_id(q_year, q_num)
        quarterly_path = os.path.join(JOURNAL_DIR, f"{qtr_key}.md")
        with locked_note(quarterly_path):
            quarterly_lines = ensure_note_lines(quarterly_path, QUARTERLY_TEMPLATE_PATH)
            existing_yearly = extract_goals(quarterly_lines, "YEARLY")
            existing_quarterly_src = extract_goals(quarterly_lines, "QUARTERLY")
            # Use updated tasks if provided, otherwise use existing
            yearly_to_write = yearly_tasks if yearly_tasks else existing_yearly
            quarterly_to_write = (
                quarterly_tasks if quarterly_tasks else existing_quarterly_src
            )
            write_goals_sections(
                quarterly_path,
                quarterly_lines,
                [
                    ("YEARLY", render_goal_lines(yearly_to_write)),
                    ("QUARTERLY", render_goal_lines(quarterly_to_write)),
                ],
                insert_if_missing=True,
            )

    return path


def parse_daily_goal_subsections(lines: list[str]) -> tuple[list[Goal], list[Goal]]:
    """
    Parse weekly and daily goal subsections from daily note lines.

    Args:
        lines: Lines from the daily note

    Returns:
        Tuple of (weekly_tasks, daily_tasks)
    """
    today = datetime.date.today()
    week_start, _ = iso_week_range(today)
    weekly_tasks = extract_goals(
        lines, "WEEKLY", horizon="weekly", period_key=week_start.isoformat()
    )
    daily_tasks = extract_goals(
        lines, "DAILY", horizon="daily", period_key=today.isoformat()
    )
    return weekly_tasks, daily_tasks


def carry_forward_daily_tasks(
    today_date: datetime.date,
    yesterday_date: datetime.date,
    existing_daily_tasks: list[Goal],
) -> tuple[list[Goal], int]:
    """
    Carry forward unchecked DAILY goals from yesterday into today's daily tasks list.

    Uses a cache to track which goals have been "offered" for carry forward.
    If a goal was previously offered but is not in the current note, the user
    deleted it intentionally and it won't be re-added.

    Args:
        today_date: Today's date
        yesterday_date: Yesterday's date
        existing_daily_tasks: Current daily tasks list (modified in place)

    Returns:
        Tuple of (updated_tasks_list, count_of_tasks_added)
    """
    yesterday_path = os.path.join(JOURNAL_DIR, f"{yesterday_date:%Y-%m-%d}.md")
    y_lines = safe_read_file(yesterday_path)
    if y_lines is None:
        return existing_daily_tasks, 0

    y_daily = extract_goals(
        y_lines,
        "DAILY",
        horizon="daily",
        period_key=yesterday_date.isoformat(),
    )

    today_key = today_date.isoformat()
    existing_daily_tasks = ensure_goal_ids(existing_daily_tasks, "daily", today_key)

    open_y = [t for t in y_daily if not t.done]
    if not open_y:
        return existing_daily_tasks, 0

    return carry_forward_with_tombstones(
        prev_tasks=open_y,
        current_tasks=existing_daily_tasks,
        period_key=today_key,
        horizon="daily",
    )
