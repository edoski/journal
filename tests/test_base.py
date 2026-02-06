"""
Tests for shared base helpers used by period sync modules.
"""

from __future__ import annotations

import datetime
import os

from sync.goals.reconcile import merge_mirror_goals
from sync.goals.state import (
    load_goal_sync_state,
    record_note_state,
    save_goal_sync_state,
)
from sync.models.goals import Goal


def _goal(
    goal_id: str,
    body: str,
    *,
    done: bool = False,
    date_str: str | None = None,
    deadline: datetime.date | None = None,
    reminder_offset: int = 0,
) -> Goal:
    return Goal(
        id=goal_id,
        body=body,
        done=done,
        date_str=date_str,
        deadline=deadline,
        reminder_offset=reminder_offset,
    )


def test_merge_mirror_goals_restores_source_deadline_and_appends_new():
    today = datetime.date(2025, 1, 1)
    existing_mirror = [
        _goal("gid-1", "Task A", done=False),
    ]
    source_tasks = [
        _goal(
            "gid-1",
            "Task A",
            done=True,
            date_str="2025-01-05",
            deadline=datetime.date(2025, 1, 5),
            reminder_offset=2,
        ),
        _goal(
            "gid-2",
            "Task B",
            done=False,
            date_str="2025-01-07",
            deadline=datetime.date(2025, 1, 7),
        ),
    ]

    merged = merge_mirror_goals(
        existing_mirror, source_tasks, proximity_days=30, today=today
    )

    assert [g.id for g in merged] == ["gid-1", "gid-2"]
    assert merged[0].done is True
    assert merged[0].deadline == datetime.date(2025, 1, 5)
    assert merged[0].date_str == "2025-01-05"
    assert merged[0].reminder_offset == 2


def test_merge_mirror_goals_skips_far_future_source_goals():
    today = datetime.date(2025, 1, 1)
    existing_mirror = [
        _goal("gid-1", "Task A", done=False),
    ]
    source_tasks = [
        _goal(
            "gid-2",
            "Task B",
            done=False,
            date_str="2025-12-31",
            deadline=datetime.date(2025, 12, 31),
        )
    ]

    merged = merge_mirror_goals(
        existing_mirror, source_tasks, proximity_days=30, today=today
    )

    assert [g.id for g in merged] == ["gid-1"]


def test_merge_mirror_goals_source_reopen_clears_mirror_when_source_changes(
    monkeypatch, tmp_path
):
    today = datetime.date(2025, 1, 1)
    source_path = tmp_path / "2025-01.md"
    mirror_path = tmp_path / "2025-W01.md"
    source_path.write_text("source", encoding="utf-8")
    mirror_path.write_text("mirror", encoding="utf-8")

    cache_path = tmp_path / "goal_sync_state.json"
    lock_dir = tmp_path / "locks"
    monkeypatch.setattr("sync.goals.state.GOAL_SYNC_STATE_PATH", str(cache_path))
    monkeypatch.setattr("sync.notes.locking.LOCK_DIR", str(lock_dir))

    # Snapshot says both were previously completed.
    state = load_goal_sync_state()
    record_note_state(state, "gid-1", str(source_path), True)
    record_note_state(state, "gid-1", str(mirror_path), True)
    save_goal_sync_state(state)

    # User reopens in source only.
    existing_mirror = [
        _goal("gid-1", "Task A", done=True, date_str="2025-01-05"),
    ]
    source_tasks = [
        _goal(
            "gid-1",
            "Task A",
            done=False,
            date_str="2025-01-05",
            deadline=datetime.date(2025, 1, 5),
        ),
    ]

    now = datetime.datetime.now().timestamp()
    os.utime(source_path, (now + 10, now + 10))
    os.utime(mirror_path, (now, now))

    merged = merge_mirror_goals(
        existing_mirror,
        source_tasks,
        proximity_days=30,
        today=today,
        source_path=str(source_path),
        mirror_path=str(mirror_path),
    )

    assert merged[0].done is False
