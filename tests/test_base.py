"""
Tests for shared base helpers used by period sync modules.
"""

from __future__ import annotations

import datetime

from sync.base import merge_mirror_goals
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
        _goal("gid-1", "Task A", done=True),
    ]
    source_tasks = [
        _goal(
            "gid-1",
            "Task A",
            done=False,
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
