from __future__ import annotations

import json

import pytest

from sync.adapters.json_daily_cache import (
    JsonDailyScreenTimeCacheStore,
    JsonDailyTrainingCacheStore,
)
from sync.adapters.json_goal_cache import (
    JsonGoalCarryForwardCacheStore,
    JsonGoalReconcileCacheStore,
)
from sync.adapters.json_media_cache import JsonMediaDateCacheStore


def test_goal_carry_load_raises_on_invalid_json(tmp_path):
    store = JsonGoalCarryForwardCacheStore(
        cache_dir=str(tmp_path / "cache" / "goals"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )
    path = tmp_path / "cache" / "goals" / "carry_forward.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{bad", encoding="utf-8")

    with pytest.raises(ValueError, match="Fix command: rm"):
        store.load()


def test_goal_reconcile_load_raises_on_invalid_note_shape(tmp_path):
    store = JsonGoalReconcileCacheStore(
        cache_dir=str(tmp_path / "cache" / "goals"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )
    path = tmp_path / "cache" / "goals" / "reconcile_state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "goals": {
                    "gid-1": {
                        "last_value": False,
                        "last_updated_at": "",
                        "last_updated_by": "",
                        "notes": {"/tmp/a.md": True},
                    }
                },
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Fix command: rm"):
        store.load()


def test_media_cache_load_raises_on_missing_required_bucket(tmp_path):
    store = JsonMediaDateCacheStore(
        cache_dir=str(tmp_path / "cache" / "media"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )
    path = tmp_path / "cache" / "media" / "dates.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"books": {}}), encoding="utf-8")

    with pytest.raises(ValueError, match="Fix command: rm"):
        store.load()


def test_daily_training_cache_load_raises_on_date_mismatch(tmp_path):
    store = JsonDailyTrainingCacheStore(
        cache_dir=str(tmp_path / "cache" / "daily" / "training"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )
    path = tmp_path / "cache" / "daily" / "training" / "2026-02-10.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"date": "2026-02-09", "entries": []}),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Fix command: rm"):
        store.load_for_date("2026-02-10")


def test_daily_screen_time_cache_load_raises_on_non_numeric_minutes(tmp_path):
    store = JsonDailyScreenTimeCacheStore(
        cache_dir=str(tmp_path / "cache" / "daily" / "screen_time"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )
    path = tmp_path / "cache" / "daily" / "screen_time" / "2026-02-10.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"date": "2026-02-10", "entries": {"X": "a lot"}}),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Fix command: rm"):
        store.load_for_date("2026-02-10")
