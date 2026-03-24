"""Daily goal orchestration helpers owned by the goals domain."""

from __future__ import annotations

import datetime
import os

from sync.constants import JOURNAL_DIR
from sync.dates import iso_week_range
from sync.goals.carry_forward import carry_forward_with_tombstones
from sync.goals.identity import goal_id_kind
from sync.contracts.goals import Goal
from sync.ports.cache import GoalCarryForwardCacheStore
from sync.ports.goals import GoalStore
from sync.ports.notes import NoteStore
from sync.readers.goals import ensure_goal_ids


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
