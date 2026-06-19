"""Pure carried-goal/tombstone cache operations."""

from __future__ import annotations

from typing import cast

from sync.contracts.cache import CarryForwardCacheState

DELETED_CACHE_KEY = "_deleted"
# Bounded retention windows for deleted-goal tombstones.
DELETED_RETENTION_PERIODS = {
    "daily": 120,
    "weekly": 52,
    "monthly": 36,
    "yearly": 12,
}
_HORIZONS = ("daily", "weekly", "monthly", "yearly")


def get_prior_period_key(period_type: str, current_key: str) -> str | None:
    """
    Get the prior period key for cache retention.

    When cleaning up old cache entries, we need to keep the prior period
    so that carry-forward can check if goals were already offered.

    Args:
        period_type: One of "daily", "weekly", "monthly", "yearly"
        current_key: Current period identifier (e.g., "2026-02", "2026-W06")

    Returns:
        Prior period key, or None if it can't be computed
    """
    import datetime

    try:
        if period_type == "daily":
            d = datetime.datetime.strptime(current_key, "%Y-%m-%d").date()
            prior = d - datetime.timedelta(days=1)
            return prior.isoformat()

        if period_type == "weekly":
            year, week = int(current_key[:4]), int(current_key[6:])
            d = datetime.datetime.strptime(f"{year}-W{week}-1", "%G-W%V-%u").date()
            prior = d - datetime.timedelta(days=7)
            prior_year, prior_week, _ = prior.isocalendar()
            return f"{prior_year}-W{prior_week:02d}"

        if period_type == "monthly":
            year, month = int(current_key[:4]), int(current_key[5:])
            if month == 1:
                return f"{year - 1}-12"
            return f"{year}-{month - 1:02d}"

        if period_type == "yearly":
            year = int(current_key)
            return str(year - 1)
    except (IndexError, ValueError):
        return None

    return None


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


def _get_deleted_bucket(
    cache: CarryForwardCacheState, period_type: str
) -> dict[str, str]:
    """Return a normalized deleted-tombstone bucket for a horizon."""
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


def _ensure_deleted_bucket(
    cache: CarryForwardCacheState,
    period_type: str,
) -> dict[str, str]:
    """Ensure cache has a mutable deleted-tombstone bucket for the horizon."""
    state = cast(dict[str, object], cache)
    deleted = state.get(DELETED_CACHE_KEY)
    if not isinstance(deleted, dict):
        deleted = {}
        state[DELETED_CACHE_KEY] = deleted

    bucket = deleted.get(period_type)
    if not isinstance(bucket, dict):
        bucket = {}
        deleted[period_type] = bucket

    return bucket


def get_carried_ids(
    cache: CarryForwardCacheState,
    period_type: str,
    period_key: str,
) -> set[str]:
    """Get goal IDs that have already been offered for carry forward."""
    state = cast(dict[str, object], cache)
    period_cache = state.get(period_type, {})
    if not isinstance(period_cache, dict):
        return set()
    goal_ids = period_cache.get(period_key, [])
    if not isinstance(goal_ids, list):
        return set()
    return {goal_id for goal_id in goal_ids if isinstance(goal_id, str) and goal_id}


def record_carried_ids(
    cache: CarryForwardCacheState,
    period_type: str,
    period_key: str,
    goal_ids: list[str],
) -> bool:
    """Record offered goal IDs for a period. Returns True when cache changed."""
    if not goal_ids:
        return False

    state = cast(dict[str, object], cache)
    period_cache = state.get(period_type)
    if not isinstance(period_cache, dict):
        period_cache = {}
        state[period_type] = period_cache

    existing = set(period_cache.get(period_key, []))
    clean_ids = {
        goal_id for goal_id in goal_ids if isinstance(goal_id, str) and goal_id
    }
    if not clean_ids:
        return False

    merged = sorted(existing | clean_ids)
    if period_cache.get(period_key) == merged:
        return False

    period_cache[period_key] = merged
    return True


def get_deleted_ids(cache: CarryForwardCacheState, period_type: str) -> set[str]:
    """Get tombstoned goal IDs for a horizon."""
    return set(_get_deleted_bucket(cache, period_type).keys())


def record_deleted_ids(
    cache: CarryForwardCacheState,
    period_type: str,
    period_key: str,
    goal_ids: list[str],
) -> bool:
    """Record intentionally deleted goal IDs as tombstones."""
    if not goal_ids:
        return False

    bucket = _ensure_deleted_bucket(cache, period_type)
    changed = False

    for goal_id in goal_ids:
        if not isinstance(goal_id, str) or not goal_id:
            continue
        if bucket.get(goal_id) != period_key:
            bucket[goal_id] = period_key
            changed = True

    return changed


def remove_deleted_ids(
    cache: CarryForwardCacheState,
    period_type: str,
    goal_ids: list[str],
) -> bool:
    """Remove tombstoned IDs (e.g., explicit user re-add)."""
    if not goal_ids:
        return False

    state = cast(dict[str, object], cache)
    deleted = state.get(DELETED_CACHE_KEY)
    if not isinstance(deleted, dict):
        return False

    bucket = deleted.get(period_type)
    if not isinstance(bucket, dict):
        return False

    changed = False
    for goal_id in goal_ids:
        if goal_id in bucket:
            del bucket[goal_id]
            changed = True

    return changed


def prune_deleted_ids(
    cache: CarryForwardCacheState,
    period_type: str,
    current_key: str,
) -> bool:
    """Prune deleted-goal tombstones to bounded retention window."""
    retention = DELETED_RETENTION_PERIODS.get(period_type)
    if retention is None:
        return False

    keep_keys = _compute_retention_window(period_type, current_key, retention)
    if not keep_keys:
        return False

    bucket = _get_deleted_bucket(cache, period_type)
    if not bucket:
        return False

    pruned = {
        goal_id: deleted_period
        for goal_id, deleted_period in bucket.items()
        if deleted_period in keep_keys
    }

    if pruned == bucket:
        return False

    target = _ensure_deleted_bucket(cache, period_type)
    target.clear()
    target.update(pruned)
    return True


def cleanup_old_entries(
    cache: CarryForwardCacheState,
    period_type: str,
    keep_keys: list[str],
) -> bool:
    """Drop old period offer entries outside keep_keys."""
    state = cast(dict[str, object], cache)
    period_cache = state.get(period_type)
    if not isinstance(period_cache, dict):
        return False

    keep_set = set(keep_keys)
    filtered = {k: v for k, v in period_cache.items() if k in keep_set}
    if filtered == period_cache:
        return False

    state[period_type] = filtered
    return True
