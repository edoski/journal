from __future__ import annotations

import json

import pytest

from sync.adapters.json_daily_state import (
    JsonDailyTrainingStateStore,
)
from sync.adapters.json_media_cache import JsonMediaDateCacheStore


def test_media_cache_load_raises_on_missing_required_bucket(tmp_path):
    store = JsonMediaDateCacheStore(
        cache_dir=str(tmp_path / "cache" / "media"),
        lock_root=str(tmp_path / "locks"),
    )
    path = tmp_path / "cache" / "media" / "dates.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"books": {}}), encoding="utf-8")

    with pytest.raises(ValueError, match="Fix command: rm"):
        store.load()


def test_daily_training_state_load_raises_on_date_mismatch(tmp_path):
    store = JsonDailyTrainingStateStore(
        state_dir=str(tmp_path / "state" / "daily" / "training"),
        lock_root=str(tmp_path / "locks"),
    )
    path = tmp_path / "state" / "daily" / "training" / "2026-02-10.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"date": "2026-02-09", "entries": []}),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Fix command: rm"):
        store.load_for_date("2026-02-10")
