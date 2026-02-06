"""
Carried goals cache for goal carry-forward tracking.

Provides functions to load, save, and check which goal IDs have been
"offered" for carry forward to prevent re-adding deleted goals.

Cache structure:
{
    "daily": {"2025-12-29": ["gid-abc123", ...]},
    "weekly": {"2025-W52": ["gid-def456", ...]},
    "monthly": {"2025-12": ["gid-ghi789", ...]},
    "quarterly": {"2025-Q4": ["gid-jkl012", ...]},
    "yearly": {"2025": ["gid-mno345", ...]},
    "_deleted": {
        "daily": {"gid-aaa111": "2026-02-06", ...},
        "weekly": {"gid-bbb222": "2026-W06", ...},
        "monthly": {"gid-ccc333": "2026-02", ...},
        "quarterly": {"gid-ddd444": "2026-Q1", ...},
        "yearly": {"gid-eee555": "2026", ...}
    }
}
"""

from __future__ import annotations

import json
import os
from typing import Any

from sync.constants import CARRIED_GOALS_PATH

DELETED_CACHE_KEY = "_deleted"
# Bounded retention windows for deleted-goal tombstones.
DELETED_RETENTION_PERIODS = {
    "daily": 120,
    "weekly": 52,
    "monthly": 36,
    "quarterly": 20,
    "yearly": 12,
}


def get_prior_period_key(period_type: str, current_key: str) -> str | None:
    """
    Get the prior period key for cache retention.

    When cleaning up old cache entries, we need to keep the prior period
    so that carry-forward can check if goals were already offered.

    Args:
        period_type: One of "daily", "weekly", "monthly", "quarterly", "yearly"
        current_key: Current period identifier (e.g., "2026-02", "2026-W06")

    Returns:
        Prior period key, or None if it can't be computed
    """
    import datetime

    try:
        if period_type == "daily":
            # Parse YYYY-MM-DD, subtract 1 day
            d = datetime.datetime.strptime(current_key, "%Y-%m-%d").date()
            prior = d - datetime.timedelta(days=1)
            return prior.isoformat()

        elif period_type == "weekly":
            # Parse YYYY-Www, subtract 7 days
            year, week = int(current_key[:4]), int(current_key[6:])
            d = datetime.datetime.strptime(f"{year}-W{week}-1", "%G-W%V-%u").date()
            prior = d - datetime.timedelta(days=7)
            prior_year, prior_week, _ = prior.isocalendar()
            return f"{prior_year}-W{prior_week:02d}"

        elif period_type == "monthly":
            # Parse YYYY-MM, subtract 1 month
            year, month = int(current_key[:4]), int(current_key[5:])
            if month == 1:
                return f"{year - 1}-12"
            return f"{year}-{month - 1:02d}"

        elif period_type == "quarterly":
            # Parse YYYY-Qn, subtract 1 quarter
            year, quarter = int(current_key[:4]), int(current_key[-1])
            if quarter == 1:
                return f"{year - 1}-Q4"
            return f"{year}-Q{quarter - 1}"

        elif period_type == "yearly":
            # Parse YYYY, subtract 1 year
            year = int(current_key)
            return str(year - 1)
    except (IndexError, ValueError):
        return None

    return None


def _load_cache() -> dict[str, Any]:
    """Load the carried goals cache from disk."""
    if not os.path.exists(CARRIED_GOALS_PATH):
        return {}
    try:
        with open(CARRIED_GOALS_PATH, "r") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_cache(cache: dict[str, Any]) -> None:
    """Save the carried goals cache to disk."""
    os.makedirs(os.path.dirname(CARRIED_GOALS_PATH), exist_ok=True)
    tmp_path = CARRIED_GOALS_PATH + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(cache, f, indent=2)
    os.replace(tmp_path, CARRIED_GOALS_PATH)


def _compute_retention_window(
    period_type: str,
    current_key: str,
    count: int,
) -> set[str]:
    """
    Compute the set of period keys to keep for tombstone retention.

    Walks backward from current_key using get_prior_period_key() for `count`
    periods (inclusive of current_key). If key parsing fails, returns the keys
    collected so far.
    """
    if count <= 0:
        return set()

    keys: set[str] = set()
    key: str | None = current_key
    for _ in range(count):
        if not key:
            break
        keys.add(key)
        key = get_prior_period_key(period_type, key)
    return keys


def _get_deleted_bucket(cache: dict[str, Any], period_type: str) -> dict[str, str]:
    """
    Return a normalized deleted-tombstone bucket for a horizon.

    Missing or malformed structures are treated as empty.
    """
    deleted = cache.get(DELETED_CACHE_KEY)
    if not isinstance(deleted, dict):
        return {}

    bucket = deleted.get(period_type)
    if not isinstance(bucket, dict):
        return {}

    normalized: dict[str, str] = {}
    for goal_id, deleted_period in bucket.items():
        if isinstance(goal_id, str) and goal_id and isinstance(deleted_period, str):
            normalized[goal_id] = deleted_period
    return normalized


def _ensure_deleted_bucket(cache: dict[str, Any], period_type: str) -> dict[str, str]:
    """Ensure cache has a mutable deleted-tombstone bucket for the horizon."""
    deleted = cache.get(DELETED_CACHE_KEY)
    if not isinstance(deleted, dict):
        deleted = {}
        cache[DELETED_CACHE_KEY] = deleted

    bucket = deleted.get(period_type)
    if not isinstance(bucket, dict):
        bucket = {}
        deleted[period_type] = bucket

    return bucket


def get_carried_ids(period_type: str, period_key: str) -> set[str]:
    """
    Get goal IDs that have been offered for carry forward to this period.

    Args:
        period_type: One of "daily", "weekly", "monthly", "quarterly", "yearly"
        period_key: Period identifier (e.g., "2025-12-29", "2025-W52")

    Returns:
        Set of goal IDs that were previously offered
    """
    cache = _load_cache()
    period_cache = cache.get(period_type, {})
    return set(period_cache.get(period_key, []))


def record_carried_ids(period_type: str, period_key: str, goal_ids: list[str]) -> None:
    """
    Record goal IDs that have been offered for carry forward.

    Args:
        period_type: One of "daily", "weekly", "monthly", "quarterly", "yearly"
        period_key: Period identifier (e.g., "2025-12-29", "2025-W52")
        goal_ids: List of goal IDs that were offered
    """
    if not goal_ids:
        return

    cache = _load_cache()
    if period_type not in cache:
        cache[period_type] = {}

    # Merge with existing IDs (don't overwrite)
    existing = set(cache[period_type].get(period_key, []))
    existing.update(goal_ids)
    cache[period_type][period_key] = sorted(existing)

    _save_cache(cache)


def get_deleted_ids(period_type: str) -> set[str]:
    """
    Get goal IDs tombstoned as intentionally deleted for the given horizon.

    Args:
        period_type: One of "daily", "weekly", "monthly", "quarterly", "yearly"

    Returns:
        Set of goal IDs currently suppressed from re-adding
    """
    cache = _load_cache()
    bucket = _get_deleted_bucket(cache, period_type)
    return set(bucket.keys())


def record_deleted_ids(period_type: str, period_key: str, goal_ids: list[str]) -> None:
    """
    Record intentionally deleted goal IDs as tombstones for this horizon.

    Args:
        period_type: One of "daily", "weekly", "monthly", "quarterly", "yearly"
        period_key: Current period key when deletion was observed
        goal_ids: Goal IDs intentionally removed by the user
    """
    if not goal_ids:
        return

    cache = _load_cache()
    bucket = _ensure_deleted_bucket(cache, period_type)

    changed = False
    for goal_id in goal_ids:
        if not isinstance(goal_id, str) or not goal_id:
            continue
        if bucket.get(goal_id) != period_key:
            bucket[goal_id] = period_key
            changed = True

    if changed:
        _save_cache(cache)


def remove_deleted_ids(period_type: str, goal_ids: list[str]) -> None:
    """
    Remove goal IDs from tombstones (e.g., explicit user re-add).

    Args:
        period_type: One of "daily", "weekly", "monthly", "quarterly", "yearly"
        goal_ids: Goal IDs to un-suppress
    """
    if not goal_ids:
        return

    cache = _load_cache()
    deleted = cache.get(DELETED_CACHE_KEY)
    if not isinstance(deleted, dict):
        return

    bucket = deleted.get(period_type)
    if not isinstance(bucket, dict):
        return

    changed = False
    for goal_id in goal_ids:
        if goal_id in bucket:
            del bucket[goal_id]
            changed = True

    if changed:
        _save_cache(cache)


def prune_deleted_ids(period_type: str, current_key: str) -> None:
    """
    Prune deleted-goal tombstones for a horizon to a bounded retention window.

    Args:
        period_type: One of "daily", "weekly", "monthly", "quarterly", "yearly"
        current_key: Current period key used as retention anchor
    """
    retention = DELETED_RETENTION_PERIODS.get(period_type)
    if retention is None:
        return

    keep_keys = _compute_retention_window(period_type, current_key, retention)
    if not keep_keys:
        return

    cache = _load_cache()
    bucket = _get_deleted_bucket(cache, period_type)
    if not bucket:
        return

    pruned = {
        goal_id: deleted_period
        for goal_id, deleted_period in bucket.items()
        if deleted_period in keep_keys
    }

    if pruned == bucket:
        return

    _ensure_deleted_bucket(cache, period_type).clear()
    _ensure_deleted_bucket(cache, period_type).update(pruned)
    _save_cache(cache)


def cleanup_old_entries(period_type: str, keep_keys: list[str]) -> None:
    """
    Remove old entries from the cache to prevent unbounded growth.

    Args:
        period_type: One of "daily", "weekly", "monthly", "quarterly", "yearly"
        keep_keys: Period keys to keep (remove all others)
    """
    cache = _load_cache()
    if period_type not in cache:
        return

    keep_set = set(keep_keys)
    cache[period_type] = {k: v for k, v in cache[period_type].items() if k in keep_set}
    _save_cache(cache)
