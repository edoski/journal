"""
Shared goal carry-forward/tombstone engine.

Keeps carry-forward behavior identical across daily and period sync flows.
"""

from __future__ import annotations

from dataclasses import replace

from sync.ports.cache import GoalCarryForwardCacheStore
from sync.goals.tombstones import (
    cleanup_old_entries,
    get_carried_ids,
    get_deleted_ids,
    get_prior_period_key,
    prune_deleted_ids,
    record_carried_ids,
    record_deleted_ids,
    remove_deleted_ids,
)


def carry_forward_with_tombstones(
    prev_tasks: list,
    current_tasks: list,
    period_key: str,
    horizon: str,
    *,
    cache_store: GoalCarryForwardCacheStore,
) -> tuple[list, int]:
    """
    Carry forward open goals from prev_tasks with offered-ID/tombstone suppression.

    Args:
        prev_tasks: Tasks from previous period/note (must have IDs assigned)
        current_tasks: Existing tasks in current period/note (modified in place)
        period_key: Current period identifier (for example, ``2026-W06``)
        horizon: One of ``daily``, ``weekly``, ``monthly``, ``quarterly``

    Returns:
        Tuple of (updated_tasks, added_count)
    """
    with cache_store.locked_state() as cache:
        prior_key = get_prior_period_key(horizon, period_key)
        keep_keys = [period_key] if prior_key is None else [prior_key, period_key]
        cleanup_old_entries(cache, horizon, keep_keys)
        prune_deleted_ids(cache, horizon, period_key)

        open_prev = [task for task in prev_tasks if not task.done]
        if not open_prev:
            return current_tasks, 0

        previously_offered = get_carried_ids(cache, horizon, period_key)
        existing_ids = {task.id for task in current_tasks if task.id}
        deleted_ids = get_deleted_ids(cache, horizon)

        # Goals previously offered but missing now were intentionally deleted.
        deleted_now = previously_offered - existing_ids
        if deleted_now:
            record_deleted_ids(cache, horizon, period_key, list(deleted_now))
            deleted_ids.update(deleted_now)

        # If user explicitly re-added a tombstoned goal, restore carry-forward behavior.
        restored_ids = existing_ids & deleted_ids
        if restored_ids:
            remove_deleted_ids(cache, horizon, list(restored_ids))
            deleted_ids -= restored_ids

        added = 0
        newly_offered: list[str] = []
        for task in open_prev:
            goal_id = task.id
            if not goal_id:
                continue
            if goal_id in existing_ids:
                continue
            if goal_id in previously_offered:
                continue
            if goal_id in deleted_ids:
                continue
            current_tasks.append(replace(task, done=False))
            existing_ids.add(goal_id)
            newly_offered.append(goal_id)
            added += 1

        # Record all offered goals (already offered + newly offered)
        record_carried_ids(
            cache,
            horizon,
            period_key,
            list(previously_offered) + newly_offered,
        )
        return current_tasks, added
