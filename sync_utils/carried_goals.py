"""
Carried goals cache for goal carry-forward tracking.

Provides functions to load, save, and check which goal IDs have been
"offered" for carry forward to prevent re-adding deleted goals.

Cache structure:
{
    "daily": {"2025-12-29": ["gid-abc123", ...]},
    "weekly": {"2025-W52": ["gid-def456", ...]},
    "monthly": {"2025-12": ["gid-ghi789", ...]},
    "quarterly": {"2025-Q4": ["gid-jkl012", ...]}
}
"""
from __future__ import annotations

import json
import os
from typing import Any

from .constants import CARRIED_GOALS_PATH


def _load_cache() -> dict[str, Any]:
    """Load the carried goals cache from disk."""
    if not os.path.exists(CARRIED_GOALS_PATH):
        return {}
    try:
        with open(CARRIED_GOALS_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save_cache(cache: dict[str, Any]) -> None:
    """Save the carried goals cache to disk."""
    os.makedirs(os.path.dirname(CARRIED_GOALS_PATH), exist_ok=True)
    tmp_path = CARRIED_GOALS_PATH + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(cache, f, indent=2)
    os.replace(tmp_path, CARRIED_GOALS_PATH)


def get_carried_ids(period_type: str, period_key: str) -> set[str]:
    """
    Get goal IDs that have been offered for carry forward to this period.

    Args:
        period_type: One of "daily", "weekly", "monthly", "quarterly"
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
        period_type: One of "daily", "weekly", "monthly", "quarterly"
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


def cleanup_old_entries(period_type: str, keep_keys: list[str]) -> None:
    """
    Remove old entries from the cache to prevent unbounded growth.

    Args:
        period_type: One of "daily", "weekly", "monthly", "quarterly"
        keep_keys: Period keys to keep (remove all others)
    """
    cache = _load_cache()
    if period_type not in cache:
        return
    
    keep_set = set(keep_keys)
    cache[period_type] = {
        k: v for k, v in cache[period_type].items() if k in keep_set
    }
    _save_cache(cache)
