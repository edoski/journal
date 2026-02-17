"""JSON-backed goal cache adapters."""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any, Final, cast

from sync.constants import GOAL_CACHE_DIR, STATE_LOCK_DIR
from sync.contracts.cache import (
    CarryForwardCacheState,
    CarryForwardDeletedBuckets,
    GoalReconcileCacheState,
    GoalReconcileGoalState,
    GoalReconcileNoteState,
)
from sync.notes.locking import locked_path
from sync.ports.cache import GoalCarryForwardCacheStore, GoalReconcileCacheStore

_HORIZONS: Final[tuple[str, ...]] = (
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "yearly",
)


def _schema_error(path: str, detail: str) -> ValueError:
    return ValueError(
        f"Invalid cache schema in {path}: {detail}. Fix command: rm '{path}'"
    )


def _load_json_or_none(path: str) -> Any | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as exc:
        raise _schema_error(path, f"invalid JSON ({exc})") from exc


def _atomic_write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
    os.replace(tmp_path, path)


def _validate_goal_ids_by_period(
    raw: Any, *, path: str, scope: str
) -> dict[str, list[str]]:
    if not isinstance(raw, dict):
        raise _schema_error(path, f"{scope} must be an object")

    validated: dict[str, list[str]] = {}
    for period_key, goal_ids in raw.items():
        if not isinstance(period_key, str) or not period_key:
            raise _schema_error(path, f"{scope} has non-string period key")
        if not isinstance(goal_ids, list):
            raise _schema_error(path, f"{scope}.{period_key} must be a list")
        if any(not isinstance(goal_id, str) or not goal_id for goal_id in goal_ids):
            raise _schema_error(path, f"{scope}.{period_key} contains invalid goal IDs")
        validated[period_key] = goal_ids[:]

    return validated


def _validate_deleted_bucket(raw: Any, *, path: str) -> CarryForwardDeletedBuckets:
    if not isinstance(raw, dict):
        raise _schema_error(path, "_deleted must be an object")

    unknown = set(raw) - set(_HORIZONS)
    if unknown:
        raise _schema_error(path, f"_deleted has unknown horizons: {sorted(unknown)}")

    validated: CarryForwardDeletedBuckets = {}
    validated_map = cast(dict[str, object], validated)
    for horizon in _HORIZONS:
        if horizon not in raw:
            continue
        bucket = raw[horizon]
        if not isinstance(bucket, dict):
            raise _schema_error(path, f"_deleted.{horizon} must be an object")

        typed_bucket: dict[str, str] = {}
        for goal_id, period_key in bucket.items():
            if not isinstance(goal_id, str) or not goal_id:
                raise _schema_error(path, f"_deleted.{horizon} has invalid goal ID")
            if not isinstance(period_key, str) or not period_key:
                raise _schema_error(
                    path, f"_deleted.{horizon}.{goal_id} must be a non-empty string"
                )
            typed_bucket[goal_id] = period_key

        if typed_bucket:
            validated_map[horizon] = typed_bucket

    return validated


def _validate_carry_forward_state(raw: Any, *, path: str) -> CarryForwardCacheState:
    if not isinstance(raw, dict):
        raise _schema_error(path, "root payload must be an object")

    allowed_root_keys = set(_HORIZONS) | {"_deleted"}
    unknown = set(raw) - allowed_root_keys
    if unknown:
        raise _schema_error(path, f"root has unknown keys: {sorted(unknown)}")

    validated: CarryForwardCacheState = {}
    validated_map = cast(dict[str, object], validated)
    for horizon in _HORIZONS:
        if horizon not in raw:
            continue
        bucket = _validate_goal_ids_by_period(
            raw[horizon],
            path=path,
            scope=horizon,
        )
        if bucket:
            validated_map[horizon] = bucket

    if "_deleted" in raw:
        deleted = _validate_deleted_bucket(raw["_deleted"], path=path)
        if deleted:
            validated["_deleted"] = deleted

    return validated


def _validate_reconcile_note_state(
    raw: Any, *, path: str, scope: str
) -> GoalReconcileNoteState:
    if not isinstance(raw, dict):
        raise _schema_error(path, f"{scope} must be an object")
    if set(raw) != {"done"}:
        raise _schema_error(path, f"{scope} must contain only 'done'")
    done = raw.get("done")
    if not isinstance(done, bool):
        raise _schema_error(path, f"{scope}.done must be a bool")
    return {"done": done}


def _validate_reconcile_goal_state(
    raw: Any, *, path: str, goal_id: str
) -> GoalReconcileGoalState:
    if not isinstance(raw, dict):
        raise _schema_error(path, f"goals.{goal_id} must be an object")

    required = {"last_value", "last_updated_at", "last_updated_by", "notes"}
    if set(raw) != required:
        raise _schema_error(
            path,
            f"goals.{goal_id} must contain exactly {sorted(required)}",
        )

    last_value = raw.get("last_value")
    if not isinstance(last_value, bool):
        raise _schema_error(path, f"goals.{goal_id}.last_value must be a bool")

    last_updated_at = raw.get("last_updated_at")
    if not isinstance(last_updated_at, str):
        raise _schema_error(path, f"goals.{goal_id}.last_updated_at must be a string")

    last_updated_by = raw.get("last_updated_by")
    if not isinstance(last_updated_by, str):
        raise _schema_error(path, f"goals.{goal_id}.last_updated_by must be a string")

    notes_raw = raw.get("notes")
    if not isinstance(notes_raw, dict):
        raise _schema_error(path, f"goals.{goal_id}.notes must be an object")

    notes: dict[str, GoalReconcileNoteState] = {}
    for note_path, note_entry in notes_raw.items():
        if not isinstance(note_path, str) or not note_path:
            raise _schema_error(path, f"goals.{goal_id}.notes has invalid note path")
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


def _validate_reconcile_state(raw: Any, *, path: str) -> GoalReconcileCacheState:
    if not isinstance(raw, dict):
        raise _schema_error(path, "root payload must be an object")

    required = {"goals"}
    if set(raw) != required:
        raise _schema_error(path, f"root must contain exactly {sorted(required)}")

    goals_raw = raw.get("goals")
    if not isinstance(goals_raw, dict):
        raise _schema_error(path, "goals must be an object")

    goals: dict[str, GoalReconcileGoalState] = {}
    for goal_id, entry in goals_raw.items():
        if not isinstance(goal_id, str) or not goal_id:
            raise _schema_error(path, "goals has invalid goal ID key")
        goals[goal_id] = _validate_reconcile_goal_state(
            entry,
            path=path,
            goal_id=goal_id,
        )

    return {"goals": goals}


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
        raw = _load_json_or_none(self.path)
        if raw is None:
            return {}
        return _validate_carry_forward_state(raw, path=self.path)

    def save(self, state: CarryForwardCacheState) -> None:
        validated = _validate_carry_forward_state(state, path=self.path)
        _atomic_write_json(self.path, validated)

    @contextmanager
    def locked_state(self) -> Iterator[CarryForwardCacheState]:
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
        raw = _load_json_or_none(self.path)
        if raw is None:
            return {"goals": {}}
        return _validate_reconcile_state(raw, path=self.path)

    def save(self, state: GoalReconcileCacheState) -> None:
        validated = _validate_reconcile_state(state, path=self.path)
        _atomic_write_json(self.path, validated)

    @contextmanager
    def locked_state(self) -> Iterator[GoalReconcileCacheState]:
        with locked_path(self.path, lock_root=self.lock_root):
            state = self.load()
            try:
                yield state
            finally:
                self.save(state)
