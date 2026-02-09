"""Pure parsers for shortcut status payload normalization."""

from __future__ import annotations

import datetime
from typing import Any

from sync.models.status import (
    CanonicalActivityPayload,
    CanonicalSleepPayload,
    CanonicalTrainingEntry,
)

_SLEEP_REQUIRED_KEYS = (
    "date",
    "start",
    "end",
    "sleep_min",
    "awake_min",
    "awake_count",
)

_TRAINING_DEFAULT_TYPE = {
    "workout": "Workout",
    "stretching": "Stretching",
    "meditation": "Meditation",
}


def _required_non_empty_str(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Invalid payload: {key} must be a non-empty string")
    return value.strip()


def _optional_str(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key, "")
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError(f"Invalid payload: {key} must be a string")
    return value.strip()


def _optional_float(payload: dict[str, Any], key: str, default: float = 0.0) -> float:
    value = payload.get(key, default)
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid payload: {key} must be numeric") from exc


def _required_float(payload: dict[str, Any], key: str) -> float:
    value = payload.get(key)
    if value is None:
        raise ValueError(f"Invalid payload: {key} must be numeric")
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid payload: {key} must be numeric") from exc


def _required_int(payload: dict[str, Any], key: str) -> int:
    value = payload.get(key)
    if value is None:
        raise ValueError(f"Invalid payload: {key} must be an integer")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid payload: {key} must be an integer") from exc
    if not parsed.is_integer():
        raise ValueError(f"Invalid payload: {key} must be an integer")
    return int(parsed)


def parse_sleep_payload(
    raw_payload: Any,
    day: datetime.date,
) -> CanonicalSleepPayload | None:
    """Parse and validate sleep payload for one day."""
    if not isinstance(raw_payload, dict):
        raise ValueError("Invalid sleep payload: expected JSON object")

    missing = [key for key in _SLEEP_REQUIRED_KEYS if key not in raw_payload]
    if missing:
        raise ValueError("Invalid sleep payload: missing keys " + ", ".join(missing))

    payload = dict(raw_payload)
    date_str = _required_non_empty_str(payload, "date")
    if date_str != day.isoformat():
        return None

    return CanonicalSleepPayload(
        date=date_str,
        start=_required_non_empty_str(payload, "start"),
        end=_required_non_empty_str(payload, "end"),
        sleep_min=_required_float(payload, "sleep_min"),
        awake_min=_required_float(payload, "awake_min"),
        awake_count=_required_int(payload, "awake_count"),
    )


def parse_training_payload(
    raw_payload: Any,
    source_kind: str,
    day: datetime.date,
) -> list[CanonicalTrainingEntry]:
    """Parse workout/stretching/meditation payload into canonical entries."""
    if raw_payload is None:
        return []
    if isinstance(raw_payload, dict):
        entries = [raw_payload]
    elif isinstance(raw_payload, list):
        entries = raw_payload
    else:
        raise ValueError("Invalid training payload: expected JSON object or array")

    source_label = _TRAINING_DEFAULT_TYPE.get(source_kind, "Workout")
    target_date = day.isoformat()
    parsed_entries: list[CanonicalTrainingEntry] = []

    for item in entries:
        if not isinstance(item, dict):
            raise ValueError("Invalid training payload: array entries must be objects")
        payload = dict(item)
        date_str = _required_non_empty_str(payload, "date")
        if date_str != target_date:
            continue

        activity = _optional_str(payload, "type") or source_label
        parsed_entries.append(
            CanonicalTrainingEntry(
                date=date_str,
                start=_optional_str(payload, "start"),
                end=_optional_str(payload, "end"),
                duration=_optional_float(payload, "duration", default=0.0),
                type=activity,
            )
        )

    return parsed_entries


def parse_activity_payload(
    raw_payload: Any,
    day: datetime.date,
) -> CanonicalActivityPayload | None:
    """Parse and validate screen-time payload for one day."""
    if not isinstance(raw_payload, dict):
        raise ValueError("Invalid activity payload: expected JSON object")

    payload = dict(raw_payload)
    raw_date = payload.get("date", "")
    if raw_date is None:
        raw_date = ""
    if not isinstance(raw_date, str):
        raise ValueError("Invalid activity payload: date must be a string")
    date_str = raw_date.strip()
    if date_str and date_str != day.isoformat():
        return None

    return CanonicalActivityPayload(
        date=date_str,
        activity_ipad=_optional_str(payload, "activity_ipad"),
        activity_iphone=_optional_str(payload, "activity_iphone"),
    )
