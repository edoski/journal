"""iCloud shortcut status source adapter."""

from __future__ import annotations

import datetime
from typing import Any

from sync.contracts.daily import SleepStatusPayload, TrainingStatusBundle
from sync.contracts.study import StudySessionRecord
from sync.daily.icloud import load_status_file, write_study_times_to_icloud
from sync.logging import get_logger
from sync.daily.screen_time import load_screen_time_data
from sync.models.screen_time import DailyScreenTimeData
from sync.ports.status import DailyStatusSource

logger = get_logger()

_REQUIRED_SLEEP_KEYS = (
    "date",
    "start",
    "end",
    "sleep_min",
    "awake_min",
    "awake_count",
)
_LEGACY_SLEEP_KEYS = {
    "SleepBegin",
    "SleepStart",
    "SleepEnd",
    "SleepMinutes",
    "AwakeMinutes",
    "AwakeCount",
}


def _coerce_sleep_float(key: str, value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        msg = f"Invalid sleep payload: {key} must be numeric"
        logger.error(msg)
        raise ValueError(msg) from exc


def _coerce_sleep_int(key: str, value: Any) -> int:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        msg = f"Invalid sleep payload: {key} must be an integer"
        logger.error(msg)
        raise ValueError(msg) from exc
    if not parsed.is_integer():
        msg = f"Invalid sleep payload: {key} must be an integer"
        logger.error(msg)
        raise ValueError(msg)
    return int(parsed)


def _validate_sleep_payload(payload: dict[str, Any]) -> SleepStatusPayload:
    legacy = sorted(key for key in _LEGACY_SLEEP_KEYS if key in payload)
    if legacy:
        msg = "Legacy sleep payload keys are not supported: " + ", ".join(legacy)
        logger.error(msg)
        raise ValueError(msg)

    missing = [key for key in _REQUIRED_SLEEP_KEYS if key not in payload]
    if missing:
        msg = "Invalid sleep payload: missing keys " + ", ".join(missing)
        logger.error(msg)
        raise ValueError(msg)

    date_str = payload["date"]
    start_str = payload["start"]
    end_str = payload["end"]
    if not isinstance(date_str, str) or not date_str.strip():
        msg = "Invalid sleep payload: date must be a non-empty string"
        logger.error(msg)
        raise ValueError(msg)
    if not isinstance(start_str, str) or not start_str.strip():
        msg = "Invalid sleep payload: start must be a non-empty string"
        logger.error(msg)
        raise ValueError(msg)
    if not isinstance(end_str, str) or not end_str.strip():
        msg = "Invalid sleep payload: end must be a non-empty string"
        logger.error(msg)
        raise ValueError(msg)

    return SleepStatusPayload(
        date=date_str,
        start=start_str,
        end=end_str,
        sleep_min=_coerce_sleep_float("sleep_min", payload["sleep_min"]),
        awake_min=_coerce_sleep_float("awake_min", payload["awake_min"]),
        awake_count=_coerce_sleep_int("awake_count", payload["awake_count"]),
    )


class ICloudDailyStatusSource(DailyStatusSource):
    """Load daily shortcut payloads from iCloud drop files."""

    def load_training(self, day: datetime.date) -> TrainingStatusBundle:
        """Load workout/stretch/meditation payloads for the day."""
        workout_done, workout_payload = load_status_file("workout_status.json")
        stretch_done, stretch_payload = load_status_file("stretching_status.json")
        meditate_done, meditate_payload = load_status_file("meditation_status.json")
        return TrainingStatusBundle(
            workout_done=workout_done,
            stretch_done=stretch_done,
            meditate_done=meditate_done,
            workout_payload=workout_payload,
            stretch_payload=stretch_payload,
            meditate_payload=meditate_payload,
        )

    def load_sleep(self, day: datetime.date) -> SleepStatusPayload | None:
        """Load sleep payload for the day if available."""
        _success, sleep_payload = load_status_file("sleep_status.json")
        _ = day
        if sleep_payload is None:
            return None
        if not isinstance(sleep_payload, dict):
            msg = "Invalid sleep payload: expected JSON object"
            logger.error(msg)
            raise ValueError(msg)
        validated = _validate_sleep_payload(sleep_payload)
        return validated

    def load_screen_time(self, day: datetime.date) -> DailyScreenTimeData | None:
        """Load grouped screen-time payload for the day."""
        return load_screen_time_data(day.isoformat())

    def write_study_times(
        self,
        day: datetime.date,
        sessions: list[StudySessionRecord],
    ) -> None:
        """Persist study times for iPad shortcut consumption."""
        write_study_times_to_icloud(sessions, day.isoformat())
