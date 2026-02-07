"""JSON-backed per-day cache adapters."""

from __future__ import annotations

import datetime
import json
import os
from typing import Any

from sync.constants import SCREEN_TIME_CACHE_DIR, STATE_LOCK_DIR, TRAINING_CACHE_DIR
from sync.notes.locking import locked_path
from sync.ports.cache import DailyScreenTimeCacheStore, DailyTrainingCacheStore


def _safe_load_json(path: str, default: Any) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _atomic_write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
    os.replace(tmp_path, path)


def _path_for_date(cache_dir: str, date_str: str) -> str:
    return os.path.join(cache_dir, f"{date_str}.json")


def _iter_cache_files(cache_dir: str):
    if not os.path.isdir(cache_dir):
        return
    for name in os.listdir(cache_dir):
        if not name.endswith(".json"):
            continue
        yield name, os.path.join(cache_dir, name)


def _prune_old_files(cache_dir: str, keep_days: int) -> None:
    if keep_days <= 0:
        return
    cutoff = datetime.date.today() - datetime.timedelta(days=keep_days - 1)
    for name, path in _iter_cache_files(cache_dir):
        date_part = name[:-5]
        try:
            file_date = datetime.datetime.strptime(date_part, "%Y-%m-%d").date()
        except ValueError:
            continue
        if file_date < cutoff:
            try:
                os.remove(path)
            except OSError:
                pass


class JsonDailyTrainingCacheStore(DailyTrainingCacheStore):
    """Filesystem-backed per-day training cache store."""

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        self.cache_dir = cache_dir or TRAINING_CACHE_DIR
        self.lock_root = lock_root or STATE_LOCK_DIR

    def load_for_date(self, date_str: str) -> list[dict[str, Any]]:
        path = _path_for_date(self.cache_dir, date_str)
        with locked_path(path, lock_root=self.lock_root):
            data = _safe_load_json(path, None)
        if not isinstance(data, dict) or data.get("date") != date_str:
            return []
        entries = data.get("entries")
        if not isinstance(entries, list):
            return []
        return [entry for entry in entries if isinstance(entry, dict)]

    def save_for_date(self, date_str: str, entries: list[dict[str, Any]]) -> None:
        path = _path_for_date(self.cache_dir, date_str)
        payload = {
            "date": date_str,
            "entries": [entry for entry in entries if isinstance(entry, dict)],
        }
        with locked_path(path, lock_root=self.lock_root):
            _atomic_write_json(path, payload)

    def prune(self, *, keep_days: int) -> None:
        _prune_old_files(self.cache_dir, keep_days)


class JsonDailyScreenTimeCacheStore(DailyScreenTimeCacheStore):
    """Filesystem-backed per-day screen-time cache store."""

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        self.cache_dir = cache_dir or SCREEN_TIME_CACHE_DIR
        self.lock_root = lock_root or STATE_LOCK_DIR

    def load_for_date(self, date_str: str) -> dict[str, float]:
        path = _path_for_date(self.cache_dir, date_str)
        with locked_path(path, lock_root=self.lock_root):
            data = _safe_load_json(path, None)
        if not isinstance(data, dict) or data.get("date") != date_str:
            return {}
        entries = data.get("entries")
        if not isinstance(entries, dict):
            return {}

        normalized: dict[str, float] = {}
        for app, minutes in entries.items():
            if not isinstance(app, str) or not app:
                continue
            try:
                normalized[app] = float(minutes)
            except (TypeError, ValueError):
                continue
        return normalized

    def save_for_date(self, date_str: str, entries: dict[str, float]) -> None:
        path = _path_for_date(self.cache_dir, date_str)
        normalized: dict[str, float] = {}
        for app, minutes in entries.items():
            if not isinstance(app, str) or not app:
                continue
            try:
                normalized[app] = float(minutes)
            except (TypeError, ValueError):
                continue

        payload = {"date": date_str, "entries": normalized}
        with locked_path(path, lock_root=self.lock_root):
            _atomic_write_json(path, payload)

    def prune(self, *, keep_days: int) -> None:
        _prune_old_files(self.cache_dir, keep_days)
