"""
Shared base patterns for periodic sync modules.

Provides common functionality used across weekly, monthly, quarterly, and yearly sync:
- Goal carry-forward with cache guard
- Goal status propagation from mirror to source
- Period data loading
"""

from __future__ import annotations

import datetime
import os

from sync.constants import JOURNAL_DIR
from sync.notes import parse_daily_note, safe_read_file
from sync.io import atomic_write_note  # noqa: F401
from sync.carried_goals import get_carried_ids, record_carried_ids, cleanup_old_entries


def load_period_data(
    start: datetime.date, end: datetime.date
) -> dict[datetime.date, dict]:
    """
    Load parsed daily notes for a date range.

    Args:
        start: Start date (inclusive)
        end: End date (exclusive)

    Returns:
        Dict mapping dates to parsed daily note data
    """
    from sync.dates import daterange  # Import here to avoid circular

    daily_data: dict[datetime.date, dict] = {}
    for day in daterange(start, end):
        path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
        if not os.path.exists(path):
            continue
        parsed = parse_daily_note(path)
        if parsed:
            daily_data[day] = parsed
    return daily_data


def carry_forward_goals(
    prev_tasks: list,
    current_tasks: list,
    period_key: str,
    horizon: str,
) -> tuple[list, int]:
    """
    Carry forward open goals from previous period with cache guard.

    Uses ID-based tracking to prevent re-adding goals the user deleted.

    Args:
        prev_tasks: Tasks from previous period (must have IDs assigned)
        current_tasks: Tasks from current period (modified in place)
        period_key: Cache key for this period (e.g., "2025-W52")
        horizon: Goal horizon (e.g., "weekly", "monthly")

    Returns:
        Tuple of (updated current_tasks, count of tasks added)
    """
    from dataclasses import replace

    # Clean up old cache entries - only keep current period
    cleanup_old_entries(horizon, [period_key])

    open_prev = [t for t in prev_tasks if not t.done]
    if not open_prev:
        return current_tasks, 0

    previously_offered = get_carried_ids(horizon, period_key)
    existing_ids = {t.id for t in current_tasks if t.id}
    newly_offered: list[str] = []
    added = 0

    for task in open_prev:
        tid = task.id
        if not tid:
            continue
        if tid in existing_ids:
            continue
        if tid in previously_offered:
            continue
        current_tasks.append(replace(task, done=False))
        existing_ids.add(tid)
        newly_offered.append(tid)
        added += 1

    # Record all offered goals (already offered + newly offered)
    all_offered = list(previously_offered) + newly_offered
    record_carried_ids(horizon, period_key, all_offered)

    return current_tasks, added


def propagate_goal_status(
    source_tasks: list,
    mirror_tasks: list,
) -> bool:
    """
    Propagate done=True from mirror to source.

    When a goal is marked done in a lower-level note (e.g., weekly mirror),
    propagate that status back to the source (e.g., monthly note).

    Args:
        source_tasks: Source of truth tasks (will be modified if status changed)
        mirror_tasks: Mirror tasks to check for done status

    Returns:
        True if any status was changed, False otherwise
    """
    mirror_lookup = {t.id: t for t in mirror_tasks if t.id}
    changed = False

    for i, task in enumerate(source_tasks):
        tid = task.id
        if not tid:
            continue
        mirror = mirror_lookup.get(tid)
        if mirror and mirror.done and not task.done:
            from dataclasses import replace

            source_tasks[i] = replace(task, done=True)
            changed = True

    return changed



def load_quarterly_goals(month_start: datetime.date) -> tuple[list, list, str, list[str]]:
    """
    Load quarterly note goals for the quarter containing month_start.

    Args:
        month_start: Any date within the target quarter

    Returns:
        Tuple of (yearly_mirror, quarterly_tasks, path, lines)
        - yearly_mirror: Goals from YEARLY section (mirror from yearly note)
        - quarterly_tasks: Goals from QUARTERLY section (source)
        - path: Path to quarterly note
        - lines: Raw lines of quarterly note
    """
    from sync.dates import quarter_of_date, quarter_id
    from sync.notes import ensure_note, goals_section_bounds, extract_subsection_tasks
    from sync.readers.goals import ensure_goal_ids
    from sync.constants import QUARTERLY_TEMPLATE_PATH
    from sync.logging import get_logger

    get_logger()

    q_year, q_num = quarter_of_date(month_start)
    quarter_key = quarter_id(q_year, q_num)
    filename = f"{quarter_key}.md"
    path = os.path.join(JOURNAL_DIR, filename)
    ensure_note(path, QUARTERLY_TEMPLATE_PATH)

    lines = safe_read_file(path)
    if lines is None:
        return [], [], path, []

    g_start, g_end = goals_section_bounds(lines)
    yearly_mirror = extract_subsection_tasks(lines, g_start, g_end, "YEARLY")
    quarterly_tasks = extract_subsection_tasks(lines, g_start, g_end, "QUARTERLY")
    yearly_mirror = ensure_goal_ids(yearly_mirror, "yearly", str(q_year))
    quarterly_tasks = ensure_goal_ids(quarterly_tasks, "quarterly", quarter_key)
    return yearly_mirror, quarterly_tasks, path, lines


def process_pierced_goals(
    existing_tasks: list,
    source_goal_lists: list[list],
    proximity_days: int,
    today: datetime.date,
) -> tuple[list, list, list[list]]:
    """
    Process pierced goals: separate original from pierced, transfer done status,
    get new pierced goals, and restore deadline info.

    This consolidates the repeated goal-piercing logic found in daily/orchestrator.py,
    weekly.py, and monthly.py.

    Args:
        existing_tasks: Goals parsed from the current note (mix of original + pierced)
        source_goal_lists: List of source goal lists to pierce from (e.g., [monthly, quarterly, yearly])
        proximity_days: Number of days for proximity filtering (e.g., 7 for daily, 30 for weekly)
        today: Reference date for filtering

    Returns:
        Tuple of:
        - original_tasks: Goals from existing_tasks that aren't pierced (original to this note)
        - final_pierced: Combined existing pierced (with restored deadlines) + new pierced goals
        - updated_source_lists: Source lists with done status transferred from existing_tasks
    """
    from dataclasses import replace
    from sync.readers.goals import filter_by_proximity

    # Build set of all pierced IDs from source goal lists
    pierced_ids: set[str] = set()
    for source_list in source_goal_lists:
        for g in source_list:
            if g.id:
                pierced_ids.add(g.id)

    # Separate original from existing pierced goals
    original_tasks = [g for g in existing_tasks if g.id not in pierced_ids]
    existing_pierced = [g for g in existing_tasks if g.id in pierced_ids]
    existing_pierced_ids = {g.id for g in existing_pierced}

    # Build lookup of done status from existing tasks
    parsed_status = {g.id: g.done for g in existing_tasks if g.id in pierced_ids}

    # Transfer done status from existing tasks to source goals
    updated_source_lists: list[list] = []
    all_updated_sources: list = []  # Flat list for source_goal_info lookup

    for source_list in source_goal_lists:
        updated_list: list = []
        for g in source_list:
            if g.id in parsed_status and parsed_status[g.id] and not g.done:
                updated = replace(g, done=True)
                updated_list.append(updated)
                all_updated_sources.append(updated)
            else:
                updated_list.append(g)
                all_updated_sources.append(g)
        updated_source_lists.append(updated_list)

    # Get NEW pierced goals from each source (only those not already in note)
    new_pierced: list = []
    for updated_list in updated_source_lists:
        filtered = filter_by_proximity(updated_list, proximity_days, today)
        for g in filtered:
            if g.deadline is not None and g.id not in existing_pierced_ids:
                new_pierced.append(g)

    # Restore deadline info to existing pierced goals from source
    source_goal_info = {g.id: g for g in all_updated_sources if g.id}
    restored_existing_pierced: list = []
    for g in existing_pierced:
        if g.id in source_goal_info:
            src = source_goal_info[g.id]
            restored_existing_pierced.append(replace(g,
                deadline=src.deadline,
                date_str=src.date_str,
                reminder_offset=src.reminder_offset,
            ))
        else:
            restored_existing_pierced.append(g)

    # Final pierced = existing (with restored deadlines) + new (from source)
    final_pierced = restored_existing_pierced + new_pierced

    return original_tasks, final_pierced, updated_source_lists
