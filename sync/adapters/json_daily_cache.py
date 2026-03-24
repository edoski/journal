"""JSON-backed per-day cache adapters."""

from __future__ import annotations

from typing import cast

from sync.constants import SCREEN_TIME_CACHE_DIR, STATE_LOCK_DIR, TRAINING_CACHE_DIR
from sync.contracts.cache import DailyTrainingCacheRow
from sync.ports.cache import DailyScreenTimeCacheStore, DailyTrainingCacheStore

from .json_cache_common import (
    JsonValidatedPerDateStore,
    schema_error,
)


def _validate_training_entry(
    raw: object,
    *,
    path: str,
    index: int,
) -> DailyTrainingCacheRow:
    if not isinstance(raw, dict):
        raise schema_error(path, f"entries[{index}] must be an object")
    entry = cast(dict[str, object], raw)

    required_keys = {"start", "end", "time_raw", "activity", "duration", "interrupt"}
    if set(entry) != required_keys:
        raise schema_error(
            path, f"entries[{index}] must contain {sorted(required_keys)}"
        )

    start = entry.get("start")
    if start is not None and not isinstance(start, str):
        raise schema_error(path, f"entries[{index}].start must be a string or null")

    end = entry.get("end")
    if end is not None and not isinstance(end, str):
        raise schema_error(path, f"entries[{index}].end must be a string or null")

    time_raw = entry.get("time_raw")
    if not isinstance(time_raw, str):
        raise schema_error(path, f"entries[{index}].time_raw must be a string")

    activity = entry.get("activity")
    if not isinstance(activity, str):
        raise schema_error(path, f"entries[{index}].activity must be a string")

    duration = entry.get("duration")
    if not isinstance(duration, str):
        raise schema_error(path, f"entries[{index}].duration must be a string")

    interrupt_raw = entry.get("interrupt")
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
    payload = cast(dict[str, object], raw)
    if set(payload) != {"date", "entries"}:
        raise schema_error(path, "root must contain exactly ['date', 'entries']")

    if payload.get("date") != date_str:
        raise schema_error(path, f"date must equal '{date_str}'")

    entries = payload.get("entries")
    if not isinstance(entries, list):
        raise schema_error(path, "entries must be a list")

    typed_entries: list[DailyTrainingCacheRow] = []
    for index, entry in enumerate(cast(list[object], entries)):
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
    payload = cast(dict[str, object], raw)
    if set(payload) != {"date", "entries"}:
        raise schema_error(path, "root must contain exactly ['date', 'entries']")

    if payload.get("date") != date_str:
        raise schema_error(path, f"date must equal '{date_str}'")

    entries = payload.get("entries")
    if not isinstance(entries, dict):
        raise schema_error(path, "entries must be an object")

    normalized: dict[str, float] = {}
    for app, minutes in cast(dict[str, object], entries).items():
        if not app:
            raise schema_error(path, "entries contains invalid app key")
        if not isinstance(minutes, (int, float)):
            raise schema_error(path, f"entries.{app} must be numeric")
        normalized[app] = float(minutes)

    return normalized


class JsonDailyTrainingCacheStore(
    JsonValidatedPerDateStore[list[DailyTrainingCacheRow]],
    DailyTrainingCacheStore,
):
    """Filesystem-backed per-day training cache store."""

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        super().__init__(
            cache_dir=cache_dir or TRAINING_CACHE_DIR,
            lock_root=lock_root or STATE_LOCK_DIR,
            empty_entries=list,
            validator=_validate_training_payload,
        )


class JsonDailyScreenTimeCacheStore(
    JsonValidatedPerDateStore[dict[str, float]],
    DailyScreenTimeCacheStore,
):
    """Filesystem-backed per-day screen-time cache store."""

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        super().__init__(
            cache_dir=cache_dir or SCREEN_TIME_CACHE_DIR,
            lock_root=lock_root or STATE_LOCK_DIR,
            empty_entries=dict,
            validator=_validate_screen_time_payload,
        )
