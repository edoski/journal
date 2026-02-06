"""Unit tests for cache-backed bidirectional goal sync reconciliation."""

from __future__ import annotations

import datetime
import os

from sync.goals.state import (
    load_goal_sync_state,
    reconcile_pair,
    record_note_state,
    save_goal_sync_state,
)


def _seed_pair_state(
    gid: str,
    source_path: str,
    source_done: bool,
    mirror_path: str,
    mirror_done: bool,
) -> None:
    state = load_goal_sync_state()
    record_note_state(state, gid, source_path, source_done)
    record_note_state(state, gid, mirror_path, mirror_done)
    save_goal_sync_state(state)


def _set_mtime(path: str, ts: float) -> None:
    os.utime(path, (ts, ts))


def test_reconcile_pair_source_only_change_wins(monkeypatch, tmp_path):
    cache_path = tmp_path / "goal_sync_state.json"
    lock_dir = tmp_path / "locks"
    source = tmp_path / "source.md"
    mirror = tmp_path / "mirror.md"
    source.write_text("source", encoding="utf-8")
    mirror.write_text("mirror", encoding="utf-8")

    monkeypatch.setattr("sync.goals.state.GOAL_SYNC_STATE_PATH", str(cache_path))
    monkeypatch.setattr("sync.notes.locking.LOCK_DIR", str(lock_dir))

    _seed_pair_state("gid-a", str(source), False, str(mirror), False)

    winner = reconcile_pair("gid-a", True, False, str(source), str(mirror))
    assert winner is True

    state = load_goal_sync_state()
    entry = state["goals"]["gid-a"]
    abs_source = os.path.abspath(source)
    abs_mirror = os.path.abspath(mirror)
    assert entry["notes"][abs_source]["done"] is True
    assert entry["notes"][abs_mirror]["done"] is True
    assert entry["last_updated_by"] == abs_source


def test_reconcile_pair_mirror_only_change_wins(monkeypatch, tmp_path):
    cache_path = tmp_path / "goal_sync_state.json"
    lock_dir = tmp_path / "locks"
    source = tmp_path / "source.md"
    mirror = tmp_path / "mirror.md"
    source.write_text("source", encoding="utf-8")
    mirror.write_text("mirror", encoding="utf-8")

    monkeypatch.setattr("sync.goals.state.GOAL_SYNC_STATE_PATH", str(cache_path))
    monkeypatch.setattr("sync.notes.locking.LOCK_DIR", str(lock_dir))

    _seed_pair_state("gid-b", str(source), False, str(mirror), False)

    winner = reconcile_pair("gid-b", False, True, str(source), str(mirror))
    assert winner is True

    state = load_goal_sync_state()
    entry = state["goals"]["gid-b"]
    abs_source = os.path.abspath(source)
    abs_mirror = os.path.abspath(mirror)
    assert entry["notes"][abs_source]["done"] is True
    assert entry["notes"][abs_mirror]["done"] is True
    assert entry["last_updated_by"] == abs_mirror


def test_reconcile_pair_dual_edit_conflict_uses_newer_mtime(monkeypatch, tmp_path):
    cache_path = tmp_path / "goal_sync_state.json"
    lock_dir = tmp_path / "locks"
    source = tmp_path / "source.md"
    mirror = tmp_path / "mirror.md"
    source.write_text("source", encoding="utf-8")
    mirror.write_text("mirror", encoding="utf-8")

    monkeypatch.setattr("sync.goals.state.GOAL_SYNC_STATE_PATH", str(cache_path))
    monkeypatch.setattr("sync.notes.locking.LOCK_DIR", str(lock_dir))

    _seed_pair_state("gid-c", str(source), False, str(mirror), False)

    now = datetime.datetime.now().timestamp()
    _set_mtime(str(source), now + 10)
    _set_mtime(str(mirror), now)

    winner = reconcile_pair("gid-c", True, False, str(source), str(mirror))
    assert winner is True


def test_reconcile_pair_mtime_tie_resolves_to_source(monkeypatch, tmp_path):
    cache_path = tmp_path / "goal_sync_state.json"
    lock_dir = tmp_path / "locks"
    source = tmp_path / "source.md"
    mirror = tmp_path / "mirror.md"
    source.write_text("source", encoding="utf-8")
    mirror.write_text("mirror", encoding="utf-8")

    monkeypatch.setattr("sync.goals.state.GOAL_SYNC_STATE_PATH", str(cache_path))
    monkeypatch.setattr("sync.notes.locking.LOCK_DIR", str(lock_dir))

    _seed_pair_state("gid-d", str(source), False, str(mirror), False)

    now = datetime.datetime.now().timestamp()
    _set_mtime(str(source), now)
    _set_mtime(str(mirror), now)

    winner = reconcile_pair("gid-d", True, False, str(source), str(mirror))
    assert winner is True


def test_reconcile_pair_bootstrap_conflict_uses_mtime(monkeypatch, tmp_path):
    cache_path = tmp_path / "goal_sync_state.json"
    lock_dir = tmp_path / "locks"
    source = tmp_path / "source.md"
    mirror = tmp_path / "mirror.md"
    source.write_text("source", encoding="utf-8")
    mirror.write_text("mirror", encoding="utf-8")

    monkeypatch.setattr("sync.goals.state.GOAL_SYNC_STATE_PATH", str(cache_path))
    monkeypatch.setattr("sync.notes.locking.LOCK_DIR", str(lock_dir))

    now = datetime.datetime.now().timestamp()
    _set_mtime(str(source), now)
    _set_mtime(str(mirror), now + 10)

    # No pre-existing snapshot for gid-e; mirror newer so mirror value should win.
    winner = reconcile_pair("gid-e", True, False, str(source), str(mirror))
    assert winner is False
