"""Pure reconciliation cache operations for bidirectional goal sync."""

from __future__ import annotations

import datetime
import os

from sync.contracts.cache import (
    GoalReconcileCacheState,
    GoalReconcileGoalState,
)
from sync.ports.cache import GoalReconcileCacheStore


def _ensure_goal_entry(
    state: GoalReconcileCacheState,
    gid: str,
) -> GoalReconcileGoalState:
    goals = state["goals"]
    entry = goals.get(gid)
    if entry is None:
        entry = {
            "last_value": False,
            "last_updated_at": "",
            "last_updated_by": "",
            "notes": {},
        }
        goals[gid] = entry
    return entry


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _note_snapshot_done(entry: GoalReconcileGoalState, note_path: str) -> bool | None:
    note_entry = entry["notes"].get(note_path)
    if note_entry is None:
        return None
    return note_entry["done"]


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
