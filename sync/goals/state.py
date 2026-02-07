"""Pure reconciliation cache operations for bidirectional goal sync."""

from __future__ import annotations

import datetime
import os
from typing import Any

from sync.contracts.cache import GoalReconcileCacheState
from sync.ports.cache import GoalReconcileCacheStore


def empty_goal_sync_state() -> GoalReconcileCacheState:
    """Return an empty goal-reconcile state payload."""
    return {"version": 1, "goals": {}}


def normalize_goal_sync_state(raw: Any) -> GoalReconcileCacheState:
    """Normalize arbitrary JSON payload into the expected reconcile schema."""
    if not isinstance(raw, dict):
        return empty_goal_sync_state()

    goals = raw.get("goals")
    if not isinstance(goals, dict):
        return empty_goal_sync_state()

    normalized_goals: dict[str, dict[str, Any]] = {}
    for gid, entry in goals.items():
        if not isinstance(gid, str) or not gid:
            continue
        if not isinstance(entry, dict):
            continue

        notes_raw = entry.get("notes")
        notes: dict[str, dict[str, bool]] = {}
        if isinstance(notes_raw, dict):
            for note_path, note_entry in notes_raw.items():
                if not isinstance(note_path, str) or not note_path:
                    continue

                done_value: bool | None = None
                if isinstance(note_entry, dict):
                    done = note_entry.get("done")
                    if isinstance(done, bool):
                        done_value = done
                elif isinstance(note_entry, bool):
                    done_value = note_entry

                if done_value is not None:
                    notes[note_path] = {"done": done_value}

        last_value = entry.get("last_value")
        if not isinstance(last_value, bool):
            if notes:
                last_value = next(iter(notes.values()))["done"]
            else:
                last_value = False

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


def _ensure_goal_entry(state: GoalReconcileCacheState, gid: str) -> dict[str, Any]:
    goals = state.setdefault("goals", {})
    if not isinstance(goals, dict):
        goals = {}
        state["goals"] = goals

    entry = goals.get(gid)
    if not isinstance(entry, dict):
        entry = {
            "last_value": False,
            "last_updated_at": "",
            "last_updated_by": "",
            "notes": {},
        }
        goals[gid] = entry

    notes = entry.get("notes")
    if not isinstance(notes, dict):
        notes = {}
        entry["notes"] = notes

    return entry


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _note_snapshot_done(entry: dict[str, Any], note_path: str) -> bool | None:
    notes = entry.get("notes")
    if not isinstance(notes, dict):
        return None

    note_entry = notes.get(note_path)
    if not isinstance(note_entry, dict):
        return None

    done = note_entry.get("done")
    return done if isinstance(done, bool) else None


def _path_mtime(path: str) -> float:
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0.0


def _pick_by_mtime(
    source_path: str,
    mirror_path: str,
    source_done: bool,
    mirror_done: bool,
) -> tuple[bool, str]:
    source_mtime = _path_mtime(source_path)
    mirror_mtime = _path_mtime(mirror_path)

    # Source wins ties.
    if source_mtime >= mirror_mtime:
        return source_done, source_path
    return mirror_done, mirror_path


def record_note_state(
    state: GoalReconcileCacheState,
    gid: str,
    note_path: str,
    done: bool,
) -> None:
    """Record the observed done-state for a single note + goal id."""
    if not gid or not note_path:
        return

    gid = str(gid)
    note_path = os.path.abspath(note_path)
    done = bool(done)

    entry = _ensure_goal_entry(state, gid)
    notes = entry["notes"]
    notes[note_path] = {"done": done}
    entry["last_value"] = done
    entry["last_updated_at"] = _now_iso()
    entry["last_updated_by"] = note_path


def reconcile_pair_with_state(
    state: GoalReconcileCacheState,
    gid: str,
    source_done: bool,
    mirror_done: bool,
    source_path: str,
    mirror_path: str,
) -> bool:
    """
    Resolve a source/mirror done-state conflict using cached snapshots and mtimes.

    Rules:
    1. Source-only change -> source wins.
    2. Mirror-only change -> mirror wins.
    3. Both changed and different -> newer file mtime wins (source on tie).
    4. No snapshot and different -> newer file mtime wins (source on tie).
    5. Equal values -> keep value.
    """
    if not gid:
        return bool(source_done)

    gid = str(gid)
    source_path = os.path.abspath(source_path)
    mirror_path = os.path.abspath(mirror_path)
    source_done = bool(source_done)
    mirror_done = bool(mirror_done)

    entry = _ensure_goal_entry(state, gid)

    source_prev = _note_snapshot_done(entry, source_path)
    mirror_prev = _note_snapshot_done(entry, mirror_path)

    source_changed = source_prev is None or source_prev != source_done
    mirror_changed = mirror_prev is None or mirror_prev != mirror_done

    winner: bool
    winner_path: str

    if source_done == mirror_done:
        winner = source_done
        if source_changed and not mirror_changed:
            winner_path = source_path
        elif mirror_changed and not source_changed:
            winner_path = mirror_path
        else:
            _, winner_path = _pick_by_mtime(
                source_path, mirror_path, source_done, mirror_done
            )
    elif source_changed and not mirror_changed:
        winner = source_done
        winner_path = source_path
    elif mirror_changed and not source_changed:
        winner = mirror_done
        winner_path = mirror_path
    else:
        winner, winner_path = _pick_by_mtime(
            source_path, mirror_path, source_done, mirror_done
        )

    notes = entry["notes"]
    notes[source_path] = {"done": winner}
    notes[mirror_path] = {"done": winner}
    entry["last_value"] = winner
    entry["last_updated_at"] = _now_iso()
    entry["last_updated_by"] = winner_path

    return winner


def reconcile_pair(
    store: GoalReconcileCacheStore,
    gid: str,
    source_done: bool,
    mirror_done: bool,
    source_path: str,
    mirror_path: str,
) -> bool:
    """Resolve one source/mirror pair and persist updated reconciliation cache."""
    with store.locked_state() as state:
        return reconcile_pair_with_state(
            state,
            gid,
            source_done,
            mirror_done,
            source_path,
            mirror_path,
        )
