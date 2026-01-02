"""
Shared base patterns for periodic sync modules.

Provides common functionality used across weekly, monthly, quarterly, and yearly sync:
- Goal carry-forward with cache guard
- Goal status propagation from mirror to source
- Atomic file writes
- Period data loading
"""
from __future__ import annotations

import datetime
import os

from sync_utils import (
    JOURNAL_DIR,
    parse_daily_note,
)
from sync_utils.carried_goals import get_carried_ids, record_carried_ids, cleanup_old_entries


def load_period_data(start: datetime.date, end: datetime.date) -> dict[datetime.date, dict]:
    """
    Load parsed daily notes for a date range.

    Args:
        start: Start date (inclusive)
        end: End date (exclusive)

    Returns:
        Dict mapping dates to parsed daily note data
    """
    from sync_utils import daterange  # Import here to avoid circular
    
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
    prev_tasks: list[dict],
    current_tasks: list[dict],
    period_key: str,
    horizon: str,
) -> tuple[list[dict], int]:
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
    # Clean up old cache entries - only keep current period
    cleanup_old_entries(horizon, [period_key])

    open_prev = [t for t in prev_tasks if not t.get("done")]
    if not open_prev:
        return current_tasks, 0

    previously_offered = get_carried_ids(horizon, period_key)
    existing_ids = {t["id"] for t in current_tasks if t.get("id")}
    newly_offered: list[str] = []
    added = 0

    for task in open_prev:
        tid = task.get("id")
        if not tid:
            continue
        if tid in existing_ids:
            continue
        if tid in previously_offered:
            continue
        current_tasks.append({**task, "done": False})
        existing_ids.add(tid)
        newly_offered.append(tid)
        added += 1

    # Record all offered goals (already offered + newly offered)
    all_offered = list(previously_offered) + newly_offered
    record_carried_ids(horizon, period_key, all_offered)

    return current_tasks, added


def propagate_goal_status(
    source_tasks: list[dict],
    mirror_tasks: list[dict],
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
    mirror_lookup = {t["id"]: t for t in mirror_tasks if t.get("id")}
    changed = False

    for task in source_tasks:
        tid = task.get("id")
        if not tid:
            continue
        mirror = mirror_lookup.get(tid)
        if mirror and mirror.get("done") and not task.get("done"):
            task["done"] = True
            changed = True

    return changed


def atomic_write_note(path: str, lines: list[str]) -> None:
    """
    Write a note atomically via temp file + replace.

    Args:
        path: Target file path
        lines: Lines to write (will be joined with newlines)
    """
    import os
    tmp_path = path + ".tmp"
    with open(tmp_path, "w") as f:
        f.write("\n".join(lines).rstrip() + "\n")
    os.replace(tmp_path, path)
