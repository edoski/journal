"""JSON-backed per-day cache adapters."""

from __future__ import annotations

from typing import cast

from sync.constants import LOCK_DIR, TRAINING_STATE_DIR
from sync.contracts.state import DailyTrainingStateRow
from sync.ports.state import DailyTrainingStateStore

from .json_cache_common import (
    JsonValidatedPerDateStore,
    schema_error,
)


def _validate_training_entry(
    raw: object,
    *,
    path: str,
    index: int,
) -> DailyTrainingStateRow:
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
) -> list[DailyTrainingStateRow]:
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

    typed_entries: list[DailyTrainingStateRow] = []
    for index, entry in enumerate(cast(list[object], entries)):
        typed_entries.append(_validate_training_entry(entry, path=path, index=index))

    return typed_entries


class JsonDailyTrainingStateStore(
    JsonValidatedPerDateStore[list[DailyTrainingStateRow]],
    DailyTrainingStateStore,
):
    """Filesystem-backed per-day training state store."""

    def __init__(
        self,
        *,
        state_dir: str | None = None,
        lock_root: str | None = None,
    ) -> None:
        super().__init__(
            cache_dir=state_dir or TRAINING_STATE_DIR,
            lock_root=lock_root or LOCK_DIR,
            empty_entries=list,
            validator=_validate_training_payload,
        )
