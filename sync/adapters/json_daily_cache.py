"""JSON-backed per-day cache adapters."""

from __future__ import annotations

import datetime
import os
from collections.abc import Iterator

from sync.constants import SCREEN_TIME_CACHE_DIR, STATE_LOCK_DIR, TRAINING_CACHE_DIR
from sync.contracts.cache import DailyTrainingCacheRow
from sync.notes.locking import locked_path
from sync.ports.cache import DailyScreenTimeCacheStore, DailyTrainingCacheStore

from .json_cache_common import atomic_write_json, load_json_or_none, schema_error


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


def _validate_training_entry(
    raw: object,
    *,
    path: str,
    index: int,
) -> DailyTrainingCacheRow:
    if not isinstance(raw, dict):
        raise schema_error(path, f"entries[{index}] must be an object")

    required_keys = {"start", "end", "time_raw", "activity", "duration", "interrupt"}
    if set(raw) != required_keys:
        raise schema_error(
            path, f"entries[{index}] must contain {sorted(required_keys)}"
        )

    start = raw.get("start")
    if start is not None and not isinstance(start, str):
        raise schema_error(path, f"entries[{index}].start must be a string or null")

    end = raw.get("end")
    if end is not None and not isinstance(end, str):
        raise schema_error(path, f"entries[{index}].end must be a string or null")

    time_raw = raw.get("time_raw")
    if not isinstance(time_raw, str):
        raise schema_error(path, f"entries[{index}].time_raw must be a string")

    activity = raw.get("activity")
    if not isinstance(activity, str):
        raise schema_error(path, f"entries[{index}].activity must be a string")

    duration = raw.get("duration")
    if not isinstance(duration, str):
        raise schema_error(path, f"entries[{index}].duration must be a string")

    interrupt_raw = raw.get("interrupt")
    interrupt: float | str
    if isinstance(interrupt_raw, (int, float)):
        interrupt = float(interrupt_raw)
    elif isinstance(interrupt_raw, str):
        interrupt = interrupt_raw
    else:
        raise schema_error(
            path,
            f"entries[{index}].interrupt must be numeric or a string",
        )

    return {
        "start": start,
        "end": end,
        "time_raw": time_raw,
        "activity": activity,
        "duration": duration,
        "interrupt": interrupt,
    }


def _validate_training_payload(
    raw: object,
    *,
    path: str,
    date_str: str,
) -> list[DailyTrainingCacheRow]:
    if not isinstance(raw, dict):
        raise schema_error(path, "root payload must be an object")
    if set(raw) != {"date", "entries"}:
        raise schema_error(path, "root must contain exactly ['date', 'entries']")

    if raw.get("date") != date_str:
        raise schema_error(path, f"date must equal '{date_str}'")

    entries = raw.get("entries")
    if not isinstance(entries, list):
        raise schema_error(path, "entries must be a list")

    typed_entries: list[DailyTrainingCacheRow] = []
    for index, entry in enumerate(entries):
        typed_entries.append(_validate_training_entry(entry, path=path, index=index))

    return typed_entries


def _validate_screen_time_payload(
    raw: object,
    *,
    path: str,
    date_str: str,
) -> dict[str, float]:
    if not isinstance(raw, dict):
        raise schema_error(path, "root payload must be an object")
    if set(raw) != {"date", "entries"}:
        raise schema_error(path, "root must contain exactly ['date', 'entries']")

    if raw.get("date") != date_str:
        raise schema_error(path, f"date must equal '{date_str}'")

    entries = raw.get("entries")
    if not isinstance(entries, dict):
        raise schema_error(path, "entries must be an object")

    normalized: dict[str, float] = {}
    for app, minutes in entries.items():
        if not isinstance(app, str) or not app:
            raise schema_error(path, "entries contains invalid app key")
        if not isinstance(minutes, (int, float)):
            raise schema_error(path, f"entries.{app} must be numeric")
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

    def load_for_date(self, date_str: str) -> list[DailyTrainingCacheRow]:
        path = _path_for_date(self.cache_dir, date_str)
        with locked_path(path, lock_root=self.lock_root):
            raw = load_json_or_none(path)
        if raw is None:
            return []
        return _validate_training_payload(raw, path=path, date_str=date_str)

    def save_for_date(
        self, date_str: str, entries: list[DailyTrainingCacheRow]
    ) -> None:
        path = _path_for_date(self.cache_dir, date_str)
        payload = {"date": date_str, "entries": entries}
        _validate_training_payload(payload, path=path, date_str=date_str)
        with locked_path(path, lock_root=self.lock_root):
            atomic_write_json(path, payload)

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
            raw = load_json_or_none(path)
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
            atomic_write_json(path, {"date": date_str, "entries": validated_entries})

    def prune(self, *, keep_days: int) -> None:
        _prune_old_files(self.cache_dir, keep_days)
