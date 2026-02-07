"""JSON-backed goal cache adapters."""

from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Any

from sync.constants import GOAL_CACHE_DIR, STATE_LOCK_DIR
from sync.contracts.cache import CarryForwardCacheState, GoalReconcileCacheState
from sync.notes.locking import locked_path
from sync.ports.cache import GoalCarryForwardCacheStore, GoalReconcileCacheStore

_HORIZONS = ("daily", "weekly", "monthly", "quarterly", "yearly")


def _safe_load_json(path: str, default: Any) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _atomic_write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
    os.replace(tmp_path, path)


def _normalize_carried_cache(raw: Any) -> CarryForwardCacheState:
    if not isinstance(raw, dict):
        return {}

    normalized: CarryForwardCacheState = {}

    for horizon in _HORIZONS:
        bucket = raw.get(horizon)
        if not isinstance(bucket, dict):
            continue

        normalized_bucket: dict[str, list[str]] = {}
        for period_key, goal_ids in bucket.items():
            if not isinstance(period_key, str) or not period_key:
                continue
            if not isinstance(goal_ids, list):
                continue

            filtered = sorted(
                {
                    goal_id
                    for goal_id in goal_ids
                    if isinstance(goal_id, str) and goal_id
                }
            )
            if filtered:
                normalized_bucket[period_key] = filtered

        if normalized_bucket:
            normalized[horizon] = normalized_bucket

    deleted_raw = raw.get("_deleted")
    if isinstance(deleted_raw, dict):
        normalized_deleted: dict[str, dict[str, str]] = {}
        for horizon in _HORIZONS:
            bucket = deleted_raw.get(horizon)
            if not isinstance(bucket, dict):
                continue
            normalized_deleted_bucket: dict[str, str] = {
                goal_id: period_key
                for goal_id, period_key in bucket.items()
                if isinstance(goal_id, str)
                and goal_id
                and isinstance(period_key, str)
                and period_key
            }
            if normalized_deleted_bucket:
                normalized_deleted[horizon] = normalized_deleted_bucket
        if normalized_deleted:
            normalized["_deleted"] = normalized_deleted

    return normalized


def _normalize_reconcile_cache(raw: Any) -> GoalReconcileCacheState:
    if not isinstance(raw, dict):
        return {"version": 1, "goals": {}}

    goals_raw = raw.get("goals")
    if not isinstance(goals_raw, dict):
        return {"version": 1, "goals": {}}

    normalized_goals: dict[str, dict[str, Any]] = {}
    for gid, entry in goals_raw.items():
        if not isinstance(gid, str) or not gid or not isinstance(entry, dict):
            continue

        notes_raw = entry.get("notes")
        notes: dict[str, dict[str, bool]] = {}
        if isinstance(notes_raw, dict):
            for note_path, note_entry in notes_raw.items():
                if not isinstance(note_path, str) or not note_path:
                    continue
                if isinstance(note_entry, dict) and isinstance(
                    note_entry.get("done"), bool
                ):
                    notes[note_path] = {"done": bool(note_entry["done"])}
                elif isinstance(note_entry, bool):
                    notes[note_path] = {"done": note_entry}

        last_value = entry.get("last_value")
        if not isinstance(last_value, bool):
            last_value = next(iter(notes.values()))["done"] if notes else False

        last_updated_at = entry.get("last_updated_at")
        if not isinstance(last_updated_at, str):
            last_updated_at = ""

        last_updated_by = entry.get("last_updated_by")
        if not isinstance(last_updated_by, str):
            last_updated_by = ""

        normalized_goals[gid] = {
            "last_value": last_value,
            "last_updated_at": last_updated_at,
            "last_updated_by": last_updated_by,
            "notes": notes,
        }

    return {"version": 1, "goals": normalized_goals}


class JsonGoalCarryForwardCacheStore(GoalCarryForwardCacheStore):
    """Filesystem-backed carried-goals/tombstones cache store."""

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        self.cache_dir = cache_dir or GOAL_CACHE_DIR
        self.lock_root = lock_root or STATE_LOCK_DIR
        self.path = os.path.join(self.cache_dir, "carry_forward.json")

    def load(self) -> CarryForwardCacheState:
        raw = _safe_load_json(self.path, {})
        return _normalize_carried_cache(raw)

    def save(self, state: CarryForwardCacheState) -> None:
        _atomic_write_json(self.path, _normalize_carried_cache(state))

    @contextmanager
    def locked_state(self):
        with locked_path(self.path, lock_root=self.lock_root):
            state = self.load()
            try:
                yield state
            finally:
                self.save(state)


class JsonGoalReconcileCacheStore(GoalReconcileCacheStore):
    """Filesystem-backed goal-reconcile cache store."""

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        self.cache_dir = cache_dir or GOAL_CACHE_DIR
        self.lock_root = lock_root or STATE_LOCK_DIR
        self.path = os.path.join(self.cache_dir, "reconcile_state.json")

    def load(self) -> GoalReconcileCacheState:
        raw = _safe_load_json(self.path, None)
        return _normalize_reconcile_cache(raw)

    def save(self, state: GoalReconcileCacheState) -> None:
        _atomic_write_json(self.path, _normalize_reconcile_cache(state))

    @contextmanager
    def locked_state(self):
        with locked_path(self.path, lock_root=self.lock_root):
            state = self.load()
            try:
                yield state
            finally:
                self.save(state)
