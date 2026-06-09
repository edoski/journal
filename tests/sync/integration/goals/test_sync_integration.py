"""Integration-style tests for goal sync reconciliation across source/mirror paths."""

from __future__ import annotations

import datetime
import os

from sync.adapters.json_goal_cache import JsonGoalReconcileCacheStore
from sync.goals.reconcile import process_pierced_goals, reconcile_goal_lists
from sync.goals.state import record_note_state
from sync.contracts.goals import Goal


def _store(tmp_path) -> JsonGoalReconcileCacheStore:
    return JsonGoalReconcileCacheStore(
        cache_dir=str(tmp_path / "cache" / "goals"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )


def _goal(
    gid: str,
    done: bool,
    *,
    body: str = "Task",
    date_str: str | None = "2026-02-16",
    deadline: datetime.date | None = None,
) -> Goal:
    return Goal(
        id=gid,
        body=body,
        done=done,
        date_str=date_str,
        deadline=deadline or datetime.date(2026, 2, 16),
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


def test_monthly_source_unchecked_clears_weekly_mirror(tmp_path):
    store = _store(tmp_path)
    source_path = tmp_path / "2026-02.md"
    mirror_path = tmp_path / "2026-W06.md"
    source_path.write_text("source", encoding="utf-8")
    mirror_path.write_text("mirror", encoding="utf-8")

    _seed_pair_state(store, "gid-1", str(source_path), True, str(mirror_path), True)

    source_tasks = [_goal("gid-1", False)]
    mirror_tasks = [_goal("gid-1", True)]

    updated_source, updated_mirror, _, mirror_changed = reconcile_goal_lists(
        source_tasks,
        mirror_tasks,
        str(source_path),
        str(mirror_path),
        reconcile_cache_store=store,
    )

    assert updated_source[0].done is False
    assert updated_mirror[0].done is False
    assert mirror_changed is True


def test_weekly_mirror_checked_sets_monthly_source_checked(tmp_path):
    store = _store(tmp_path)
    source_path = tmp_path / "2026-02.md"
    mirror_path = tmp_path / "2026-W06.md"
    source_path.write_text("source", encoding="utf-8")
    mirror_path.write_text("mirror", encoding="utf-8")

    _seed_pair_state(store, "gid-2", str(source_path), False, str(mirror_path), False)

    source_tasks = [_goal("gid-2", False)]
    mirror_tasks = [_goal("gid-2", True)]

    updated_source, updated_mirror, source_changed, _ = reconcile_goal_lists(
        source_tasks,
        mirror_tasks,
        str(source_path),
        str(mirror_path),
        reconcile_cache_store=store,
    )

    assert updated_source[0].done is True
    assert updated_mirror[0].done is True
    assert source_changed is True


def test_quarterly_yearly_bidirectional_reconcile(tmp_path):
    store = _store(tmp_path)
    source_path = tmp_path / "2026.md"
    mirror_path = tmp_path / "2026-Q1.md"
    source_path.write_text("source", encoding="utf-8")
    mirror_path.write_text("mirror", encoding="utf-8")

    _seed_pair_state(store, "gid-3", str(source_path), False, str(mirror_path), False)

    # Child checks goal -> should propagate up.
    source_tasks = [_goal("gid-3", False)]
    mirror_tasks = [_goal("gid-3", True)]
    updated_source, updated_mirror, _, _ = reconcile_goal_lists(
        source_tasks,
        mirror_tasks,
        str(source_path),
        str(mirror_path),
        reconcile_cache_store=store,
    )
    assert updated_source[0].done is True
    assert updated_mirror[0].done is True

    # Then source reopens -> should propagate down.
    source_tasks = [_goal("gid-3", False)]
    mirror_tasks = [_goal("gid-3", True)]
    updated_source, updated_mirror, _, _ = reconcile_goal_lists(
        source_tasks,
        mirror_tasks,
        str(source_path),
        str(mirror_path),
        reconcile_cache_store=store,
    )
    assert updated_source[0].done is False
    assert updated_mirror[0].done is False


def test_daily_pierced_checked_updates_source(tmp_path):
    store = _store(tmp_path)
    source_path = tmp_path / "2026-02.md"
    note_path = tmp_path / "2026-02-06.md"
    source_path.write_text("source", encoding="utf-8")
    note_path.write_text("daily", encoding="utf-8")

    now = datetime.datetime.now().timestamp()
    os.utime(source_path, (now, now))
    os.utime(note_path, (now + 10, now + 10))

    source_goal = _goal("gid-4", False)
    existing_daily = [_goal("gid-4", True)]

    _, _, updated_sources = process_pierced_goals(
        existing_tasks=existing_daily,
        source_goal_lists=[[source_goal]],
        proximity_days=7,
        today=datetime.date(2026, 2, 6),
        note_path=str(note_path),
        source_paths=[str(source_path)],
        reconcile_cache_store=store,
    )

    assert updated_sources[0][0].done is True


def test_daily_pierced_source_reopen_clears_child(tmp_path):
    store = _store(tmp_path)
    source_path = tmp_path / "2026-02.md"
    note_path = tmp_path / "2026-02-06.md"
    source_path.write_text("source", encoding="utf-8")
    note_path.write_text("daily", encoding="utf-8")

    _seed_pair_state(store, "gid-5", str(source_path), True, str(note_path), True)

    source_goal = _goal("gid-5", False)
    existing_daily = [_goal("gid-5", True)]

    _, final_pierced, updated_sources = process_pierced_goals(
        existing_tasks=existing_daily,
        source_goal_lists=[[source_goal]],
        proximity_days=7,
        today=datetime.date(2026, 2, 6),
        note_path=str(note_path),
        source_paths=[str(source_path)],
        reconcile_cache_store=store,
    )

    assert updated_sources[0][0].done is False
    assert final_pierced[0].done is False


def test_deleted_pierced_source_goal_is_dropped_from_child(tmp_path):
    store = _store(tmp_path)
    source_path = tmp_path / "2026-02.md"
    note_path = tmp_path / "2026-02-06.md"
    source_path.write_text("source", encoding="utf-8")
    note_path.write_text("daily", encoding="utf-8")

    _seed_pair_state(store, "gid-6", str(source_path), False, str(note_path), False)

    existing_daily = [_goal("gid-6", False)]

    original_tasks, final_pierced, updated_sources = process_pierced_goals(
        existing_tasks=existing_daily,
        source_goal_lists=[[]],
        proximity_days=7,
        today=datetime.date(2026, 2, 6),
        note_path=str(note_path),
        source_paths=[str(source_path)],
        reconcile_cache_store=store,
    )

    assert original_tasks == []
    assert final_pierced == []
    assert updated_sources == [[]]
