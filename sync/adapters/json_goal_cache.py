"""JSON-backed goal cache adapters."""

from __future__ import annotations

import os
from typing import Final, cast

from sync.constants import GOAL_CACHE_DIR, STATE_LOCK_DIR
from sync.contracts.cache import (
    CarryForwardCacheState,
    CarryForwardDeletedBuckets,
    GoalReconcileCacheState,
    GoalReconcileGoalState,
    GoalReconcileNoteState,
)
from sync.ports.cache import GoalCarryForwardCacheStore, GoalReconcileCacheStore

from .json_cache_common import JsonValidatedStateStore, schema_error

_HORIZONS: Final[tuple[str, ...]] = (
    "daily",
    "weekly",
    "monthly",
    "yearly",
)


def _validate_goal_ids_by_period(
    raw: object, *, path: str, scope: str
) -> dict[str, list[str]]:
    if not isinstance(raw, dict):
        raise schema_error(path, f"{scope} must be an object")
    raw_map = cast(dict[str, object], raw)

    validated: dict[str, list[str]] = {}
    for period_key, goal_ids in raw_map.items():
        if not period_key:
            raise schema_error(path, f"{scope} has non-string period key")
        if not isinstance(goal_ids, list):
            raise schema_error(path, f"{scope}.{period_key} must be a list")
        goal_id_list = cast(list[object], goal_ids)
        if any(not isinstance(goal_id, str) or not goal_id for goal_id in goal_id_list):
            raise schema_error(path, f"{scope}.{period_key} contains invalid goal IDs")
        validated[period_key] = cast(list[str], goal_id_list[:])

    return validated


def _validate_deleted_bucket(raw: object, *, path: str) -> CarryForwardDeletedBuckets:
    if not isinstance(raw, dict):
        raise schema_error(path, "_deleted must be an object")
    raw_map = cast(dict[str, object], raw)

    unknown = set(raw_map) - set(_HORIZONS)
    if unknown:
        raise schema_error(path, f"_deleted has unknown horizons: {sorted(unknown)}")

    validated: CarryForwardDeletedBuckets = {}
    validated_map = cast(dict[str, object], validated)
    for horizon in _HORIZONS:
        if horizon not in raw_map:
            continue
        bucket = raw_map[horizon]
        if not isinstance(bucket, dict):
            raise schema_error(path, f"_deleted.{horizon} must be an object")

        typed_bucket: dict[str, str] = {}
        for goal_id, period_key in cast(dict[str, object], bucket).items():
            if not goal_id:
                raise schema_error(path, f"_deleted.{horizon} has invalid goal ID")
            if not isinstance(period_key, str) or not period_key:
                raise schema_error(
                    path, f"_deleted.{horizon}.{goal_id} must be a non-empty string"
                )
            typed_bucket[goal_id] = period_key

        if typed_bucket:
            validated_map[horizon] = typed_bucket

    return validated


def _validate_carry_forward_state(raw: object, *, path: str) -> CarryForwardCacheState:
    if not isinstance(raw, dict):
        raise schema_error(path, "root payload must be an object")
    raw_map = cast(dict[str, object], raw)

    allowed_root_keys = set(_HORIZONS) | {"_deleted"}
    unknown = set(raw_map) - allowed_root_keys
    if unknown:
        raise schema_error(path, f"root has unknown keys: {sorted(unknown)}")

    validated: CarryForwardCacheState = {}
    validated_map = cast(dict[str, object], validated)
    for horizon in _HORIZONS:
        if horizon not in raw_map:
            continue
        bucket = _validate_goal_ids_by_period(
            raw_map[horizon],
            path=path,
            scope=horizon,
        )
        if bucket:
            validated_map[horizon] = bucket

    if "_deleted" in raw_map:
        deleted = _validate_deleted_bucket(raw_map["_deleted"], path=path)
        if deleted:
            validated["_deleted"] = deleted

    return validated


def _validate_reconcile_note_state(
    raw: object, *, path: str, scope: str
) -> GoalReconcileNoteState:
    if not isinstance(raw, dict):
        raise schema_error(path, f"{scope} must be an object")
    payload = cast(dict[str, object], raw)
    if set(payload) != {"done"}:
        raise schema_error(path, f"{scope} must contain only 'done'")
    done = payload.get("done")
    if not isinstance(done, bool):
        raise schema_error(path, f"{scope}.done must be a bool")
    return {"done": done}


def _validate_reconcile_goal_state(
    raw: object, *, path: str, goal_id: str
) -> GoalReconcileGoalState:
    if not isinstance(raw, dict):
        raise schema_error(path, f"goals.{goal_id} must be an object")
    payload = cast(dict[str, object], raw)

    required = {"last_value", "last_updated_at", "last_updated_by", "notes"}
    if set(payload) != required:
        raise schema_error(
            path,
            f"goals.{goal_id} must contain exactly {sorted(required)}",
        )

    last_value = payload.get("last_value")
    if not isinstance(last_value, bool):
        raise schema_error(path, f"goals.{goal_id}.last_value must be a bool")

    last_updated_at = payload.get("last_updated_at")
    if not isinstance(last_updated_at, str):
        raise schema_error(path, f"goals.{goal_id}.last_updated_at must be a string")

    last_updated_by = payload.get("last_updated_by")
    if not isinstance(last_updated_by, str):
        raise schema_error(path, f"goals.{goal_id}.last_updated_by must be a string")

    notes_raw = payload.get("notes")
    if not isinstance(notes_raw, dict):
        raise schema_error(path, f"goals.{goal_id}.notes must be an object")

    notes: dict[str, GoalReconcileNoteState] = {}
    for note_path, note_entry in cast(dict[str, object], notes_raw).items():
        if not note_path:
            raise schema_error(path, f"goals.{goal_id}.notes has invalid note path")
        notes[note_path] = _validate_reconcile_note_state(
            note_entry,
            path=path,
            scope=f"goals.{goal_id}.notes.{note_path}",
        )

    return {
        "last_value": last_value,
        "last_updated_at": last_updated_at,
        "last_updated_by": last_updated_by,
        "notes": notes,
    }


def _validate_reconcile_state(raw: object, *, path: str) -> GoalReconcileCacheState:
    if not isinstance(raw, dict):
        raise schema_error(path, "root payload must be an object")
    payload = cast(dict[str, object], raw)

    required = {"goals"}
    if set(payload) != required:
        raise schema_error(path, f"root must contain exactly {sorted(required)}")

    goals_raw = payload.get("goals")
    if not isinstance(goals_raw, dict):
        raise schema_error(path, "goals must be an object")

    goals: dict[str, GoalReconcileGoalState] = {}
    for goal_id, entry in cast(dict[str, object], goals_raw).items():
        if not goal_id:
            raise schema_error(path, "goals has invalid goal ID key")
        goals[goal_id] = _validate_reconcile_goal_state(
            entry,
            path=path,
            goal_id=goal_id,
        )

    return {"goals": goals}


class JsonGoalCarryForwardCacheStore(
    JsonValidatedStateStore[CarryForwardCacheState],
    GoalCarryForwardCacheStore,
):
    """Filesystem-backed carried-goals/tombstones cache store."""

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        self.cache_dir = cache_dir or GOAL_CACHE_DIR
        super().__init__(
            path=os.path.join(self.cache_dir, "carry_forward.json"),
            lock_root=lock_root or STATE_LOCK_DIR,
            empty_state=lambda: {},
            validator=_validate_carry_forward_state,
        )


class JsonGoalReconcileCacheStore(
    JsonValidatedStateStore[GoalReconcileCacheState],
    GoalReconcileCacheStore,
):
    """Filesystem-backed goal-reconcile cache store."""

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        self.cache_dir = cache_dir or GOAL_CACHE_DIR
        super().__init__(
            path=os.path.join(self.cache_dir, "reconcile_state.json"),
            lock_root=lock_root or STATE_LOCK_DIR,
            empty_state=lambda: {"goals": {}},
            validator=_validate_reconcile_state,
        )
