"""Pure parsers for shortcut status payload normalization."""

from __future__ import annotations

import datetime
from collections.abc import Mapping

from sync.contracts.status import (
    ActivityPayload,
    SleepPayload,
    TrainingEntryPayload,
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


def _required_non_empty_str(payload: Mapping[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Invalid payload: {key} must be a non-empty string")
    return value.strip()


def _required_iso_date(payload: Mapping[str, object], key: str = "date") -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(
            f"Invalid payload: {key} must be a non-empty YYYY-MM-DD string"
        )
    try:
        return datetime.date.fromisoformat(value.strip()).isoformat()
    except ValueError as exc:
        raise ValueError(f"Invalid payload: {key} must be YYYY-MM-DD") from exc


def _optional_str(payload: Mapping[str, object], key: str) -> str:
    value = payload.get(key, "")
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError(f"Invalid payload: {key} must be a string")
    return value.strip()


def _optional_float(
    payload: Mapping[str, object], key: str, default: float = 0.0
) -> float:
    value = payload.get(key, default)
    if value is None:
        return default
    if not isinstance(value, (str, int, float)):
        raise ValueError(f"Invalid payload: {key} must be numeric")
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid payload: {key} must be numeric") from exc


def _required_float(payload: Mapping[str, object], key: str) -> float:
    value = payload.get(key)
    if value is None:
        raise ValueError(f"Invalid payload: {key} must be numeric")
    if not isinstance(value, (str, int, float)):
        raise ValueError(f"Invalid payload: {key} must be numeric")
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid payload: {key} must be numeric") from exc


def _required_int(payload: Mapping[str, object], key: str) -> int:
    value = payload.get(key)
    if value is None:
        raise ValueError(f"Invalid payload: {key} must be an integer")
    if not isinstance(value, (str, int, float)):
        raise ValueError(f"Invalid payload: {key} must be an integer")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid payload: {key} must be an integer") from exc
    if not parsed.is_integer():
        raise ValueError(f"Invalid payload: {key} must be an integer")
    return int(parsed)


def parse_sleep_payload(
    raw_payload: object,
) -> SleepPayload:
    """Parse and validate sleep payload for one day."""
    if not isinstance(raw_payload, dict):
        raise ValueError("Invalid sleep payload: expected JSON object")

    missing = [key for key in _SLEEP_REQUIRED_KEYS if key not in raw_payload]
    if missing:
        raise ValueError("Invalid sleep payload: missing keys " + ", ".join(missing))

    payload = dict(raw_payload)
    return SleepPayload(
        date=_required_iso_date(payload, "date"),
        start=_required_non_empty_str(payload, "start"),
        end=_required_non_empty_str(payload, "end"),
        sleep_min=_required_float(payload, "sleep_min"),
        awake_min=_required_float(payload, "awake_min"),
        awake_count=_required_int(payload, "awake_count"),
    )


def parse_training_payload(
    raw_payload: object,
    source_kind: str,
) -> list[TrainingEntryPayload]:
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
    parsed_entries: list[TrainingEntryPayload] = []

    for item in entries:
        if not isinstance(item, dict):
            raise ValueError("Invalid training payload: array entries must be objects")
        payload = dict(item)
        date_str = _required_iso_date(payload, "date")

        activity = _optional_str(payload, "type") or source_label
        parsed_entries.append(
            TrainingEntryPayload(
                date=date_str,
                start=_optional_str(payload, "start"),
                end=_optional_str(payload, "end"),
                duration=_optional_float(payload, "duration", default=0.0),
                type=activity,
            )
        )

    return parsed_entries


def parse_activity_payload(
    raw_payload: object,
) -> ActivityPayload:
    """Parse and validate screen-time payload for one day."""
    if not isinstance(raw_payload, dict):
        raise ValueError("Invalid activity payload: expected JSON object")

    payload = dict(raw_payload)
    date_str = _required_iso_date(payload, "date")

    return ActivityPayload(
        date=date_str,
        activity_ipad=_optional_str(payload, "activity_ipad"),
        activity_iphone=_optional_str(payload, "activity_iphone"),
    )
