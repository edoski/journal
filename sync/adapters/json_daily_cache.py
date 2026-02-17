"""JSON-backed per-day cache adapters."""

from __future__ import annotations

import datetime
import json
import os
from collections.abc import Iterator
from typing import Any

from sync.constants import SCREEN_TIME_CACHE_DIR, STATE_LOCK_DIR, TRAINING_CACHE_DIR
from sync.notes.locking import locked_path
from sync.ports.cache import DailyScreenTimeCacheStore, DailyTrainingCacheStore


def _schema_error(path: str, detail: str) -> ValueError:
    return ValueError(
        f"Invalid cache schema in {path}: {detail}. Fix command: rm '{path}'"
    )


def _load_json_or_none(path: str) -> Any | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as exc:
        raise _schema_error(path, f"invalid JSON ({exc})") from exc


def _atomic_write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
    os.replace(tmp_path, path)


def _path_for_date(cache_dir: str, date_str: str) -> str:
    return os.path.join(cache_dir, f"{date_str}.json")


def _iter_cache_files(cache_dir: str) -> Iterator[tuple[str, str]]:
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


def _validate_training_payload(
    raw: Any, *, path: str, date_str: str
) -> list[dict[str, Any]]:
    if not isinstance(raw, dict):
        raise _schema_error(path, "root payload must be an object")
    if set(raw) != {"date", "entries"}:
        raise _schema_error(path, "root must contain exactly ['date', 'entries']")

    if raw.get("date") != date_str:
        raise _schema_error(path, f"date must equal '{date_str}'")

    entries = raw.get("entries")
    if not isinstance(entries, list):
        raise _schema_error(path, "entries must be a list")

    typed_entries: list[dict[str, Any]] = []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise _schema_error(path, f"entries[{index}] must be an object")
        typed_entries.append(entry)

    return typed_entries


def _validate_screen_time_payload(
    raw: Any,
    *,
    path: str,
    date_str: str,
) -> dict[str, float]:
    if not isinstance(raw, dict):
        raise _schema_error(path, "root payload must be an object")
    if set(raw) != {"date", "entries"}:
        raise _schema_error(path, "root must contain exactly ['date', 'entries']")

    if raw.get("date") != date_str:
        raise _schema_error(path, f"date must equal '{date_str}'")

    entries = raw.get("entries")
    if not isinstance(entries, dict):
        raise _schema_error(path, "entries must be an object")

    normalized: dict[str, float] = {}
    for app, minutes in entries.items():
        if not isinstance(app, str) or not app:
            raise _schema_error(path, "entries contains invalid app key")
        if not isinstance(minutes, (int, float)):
            raise _schema_error(path, f"entries.{app} must be numeric")
        normalized[app] = float(minutes)

    return normalized


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
            raw = _load_json_or_none(path)
        if raw is None:
            return []
        return _validate_training_payload(raw, path=path, date_str=date_str)

    def save_for_date(self, date_str: str, entries: list[dict[str, Any]]) -> None:
        path = _path_for_date(self.cache_dir, date_str)
        payload = {"date": date_str, "entries": entries}
        _validate_training_payload(payload, path=path, date_str=date_str)
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
            raw = _load_json_or_none(path)
        if raw is None:
            return {}
        return _validate_screen_time_payload(raw, path=path, date_str=date_str)

    def save_for_date(self, date_str: str, entries: dict[str, float]) -> None:
        path = _path_for_date(self.cache_dir, date_str)
        payload = {"date": date_str, "entries": entries}
        validated_entries = _validate_screen_time_payload(
            payload,
            path=path,
            date_str=date_str,
        )
        with locked_path(path, lock_root=self.lock_root):
            _atomic_write_json(path, {"date": date_str, "entries": validated_entries})

    def prune(self, *, keep_days: int) -> None:
        _prune_old_files(self.cache_dir, keep_days)
