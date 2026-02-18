"""Unit tests for cache-backed bidirectional goal sync reconciliation."""

from __future__ import annotations

import datetime
import os

from sync.adapters.json_goal_cache import JsonGoalReconcileCacheStore
from sync.goals.state import reconcile_pair, record_note_state


def _store(tmp_path) -> JsonGoalReconcileCacheStore:
    return JsonGoalReconcileCacheStore(
        cache_dir=str(tmp_path / "cache" / "goals"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )


def _seed_pair_state(
    store: JsonGoalReconcileCacheStore,
    gid: str,
    source_path: str,
    source_done: bool,
    mirror_path: str,
    mirror_done: bool,
) -> None:
    state = store.load()
    record_note_state(state, gid, source_path, source_done)
    record_note_state(state, gid, mirror_path, mirror_done)
    store.save(state)


def _set_mtime(path: str, ts: float) -> None:
    os.utime(path, (ts, ts))


def test_reconcile_pair_source_only_change_wins(tmp_path):
    store = _store(tmp_path)
    source = tmp_path / "source.md"
    mirror = tmp_path / "mirror.md"
    source.write_text("source", encoding="utf-8")
    mirror.write_text("mirror", encoding="utf-8")

    _seed_pair_state(store, "gid-a", str(source), False, str(mirror), False)

    winner = reconcile_pair(store, "gid-a", True, False, str(source), str(mirror))
    assert winner is True

    state = store.load()
    entry = state["goals"]["gid-a"]
    abs_source = os.path.abspath(source)
    abs_mirror = os.path.abspath(mirror)
    assert entry["notes"][abs_source]["done"] is True
    assert entry["notes"][abs_mirror]["done"] is True
    assert entry["last_updated_by"] == abs_source


def test_reconcile_pair_mirror_only_change_wins(tmp_path):
    store = _store(tmp_path)
    source = tmp_path / "source.md"
    mirror = tmp_path / "mirror.md"
    source.write_text("source", encoding="utf-8")
    mirror.write_text("mirror", encoding="utf-8")

    _seed_pair_state(store, "gid-b", str(source), False, str(mirror), False)

    winner = reconcile_pair(store, "gid-b", False, True, str(source), str(mirror))
    assert winner is True

    state = store.load()
    entry = state["goals"]["gid-b"]
    abs_source = os.path.abspath(source)
    abs_mirror = os.path.abspath(mirror)
    assert entry["notes"][abs_source]["done"] is True
    assert entry["notes"][abs_mirror]["done"] is True
    assert entry["last_updated_by"] == abs_mirror


def test_reconcile_pair_dual_edit_conflict_uses_newer_mtime(tmp_path):
    store = _store(tmp_path)
    source = tmp_path / "source.md"
    mirror = tmp_path / "mirror.md"
    source.write_text("source", encoding="utf-8")
    mirror.write_text("mirror", encoding="utf-8")

    _seed_pair_state(store, "gid-c", str(source), False, str(mirror), False)

    now = datetime.datetime.now().timestamp()
    _set_mtime(str(source), now + 10)
    _set_mtime(str(mirror), now)

    winner = reconcile_pair(store, "gid-c", True, False, str(source), str(mirror))
    assert winner is True


def test_reconcile_pair_mtime_tie_resolves_to_source(tmp_path):
    store = _store(tmp_path)
    source = tmp_path / "source.md"
    mirror = tmp_path / "mirror.md"
    source.write_text("source", encoding="utf-8")
    mirror.write_text("mirror", encoding="utf-8")

    _seed_pair_state(store, "gid-d", str(source), False, str(mirror), False)

    now = datetime.datetime.now().timestamp()
    _set_mtime(str(source), now)
    _set_mtime(str(mirror), now)

    winner = reconcile_pair(store, "gid-d", True, False, str(source), str(mirror))
    assert winner is True


def test_reconcile_pair_bootstrap_conflict_uses_mtime(tmp_path):
    store = _store(tmp_path)
    source = tmp_path / "source.md"
    mirror = tmp_path / "mirror.md"
    source.write_text("source", encoding="utf-8")
    mirror.write_text("mirror", encoding="utf-8")

    now = datetime.datetime.now().timestamp()
    _set_mtime(str(source), now)
    _set_mtime(str(mirror), now + 10)

    winner = reconcile_pair(store, "gid-e", True, False, str(source), str(mirror))
    assert winner is False
