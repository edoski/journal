"""iCloud Shortcut inbox adapter."""

from __future__ import annotations

import datetime
import errno
import glob
import json
import os
import tempfile
import time
from collections.abc import Mapping

from sync.config import PATHS
from sync.contracts.status import (
    SleepPayload,
    TrainingEntryPayload,
    TrainingStatus,
)
from sync.daily.constants import ICLOUD_JOURNALSYNC_DIR
from sync.log import get_logger
from sync.ports.status import DailyStatusSource

logger = get_logger(__name__)

STATUS_STAGING_DIR = os.path.join(PATHS.daily_state_dir, "status", "pending")
STATUS_INVALID_DIR = os.path.join(PATHS.daily_state_dir, "status", "invalid")
_READ_RETRY_SECONDS = 0.25
_INVALID_RETENTION_DAYS = 30
StatusPayloadFile = tuple[object, str]
_TRANSIENT_ERRNOS = {
    errno.EAGAIN,
    errno.EBUSY,
    errno.EDEADLK,
    errno.ESTALE,
    errno.ETIMEDOUT,
}
_SLEEP_REQUIRED_KEYS = (
    "date",
    "start",
    "end",
    "sleep_min",
    "awake_min",
)
_TRAINING_DEFAULT_TYPE = {
    "workout": "Workout",
    "stretching": "Stretching",
}


def _is_transient_read_error(exc: Exception) -> bool:
    return isinstance(exc, PermissionError) or (
        isinstance(exc, OSError) and exc.errno in _TRANSIENT_ERRNOS
    )


def _status_file_label(filename: str) -> str:
    return os.path.basename(filename).replace(os.sep, "_")


def _pending_status_candidates(filename: str) -> list[str]:
    label = _status_file_label(filename)
    candidates = glob.glob(os.path.join(STATUS_STAGING_DIR, f"{label}.*.pending"))
    return sorted(set(candidates), key=lambda p: os.path.getmtime(p), reverse=True)


def _is_stable_drop_file(target_path: str) -> tuple[bool, Exception | None]:
    try:
        first_size = os.path.getsize(target_path)
    except FileNotFoundError:
        return False, None
    except OSError as exc:
        return False, exc

    if first_size == 0:
        return False, ValueError("empty file (likely still syncing)")

    time.sleep(_READ_RETRY_SECONDS)

    try:
        second_size = os.path.getsize(target_path)
    except FileNotFoundError:
        return False, None
    except OSError as exc:
        return False, exc

    if second_size == first_size:
        return True, None
    return False, ValueError("file size changed while syncing")


def _read_drop_file_bytes(target_path: str) -> tuple[bytes | None, Exception | None]:
    try:
        with open(target_path, "rb") as f:
            raw = f.read()
    except FileNotFoundError:
        return None, None
    except (PermissionError, OSError) as exc:
        return None, exc
    if not raw:
        return None, ValueError("empty file (likely still syncing)")
    return raw, None


def _write_claimed_bytes(claimed_path: str, raw: bytes) -> Exception | None:
    staging_dir = os.path.dirname(claimed_path)
    fd, tmp_path = tempfile.mkstemp(
        prefix=f".{os.path.basename(claimed_path)}.",
        suffix=".tmp",
        dir=staging_dir,
    )
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        os.replace(tmp_path, claimed_path)
    except (PermissionError, OSError) as exc:
        try:
            os.unlink(tmp_path)
        except (FileNotFoundError, PermissionError, OSError):
            pass
        return exc
    return None


def _claim_status_file(
    filename: str,
    target_path: str,
) -> tuple[str | None, Exception | None]:
    stable, stable_err = _is_stable_drop_file(target_path)
    if not stable:
        return None, stable_err

    raw, read_err = _read_drop_file_bytes(target_path)
    if read_err or raw is None:
        return None, read_err

    os.makedirs(STATUS_STAGING_DIR, exist_ok=True)
    label = _status_file_label(filename)
    claimed_path = os.path.join(
        STATUS_STAGING_DIR,
        f"{label}.{time.time_ns()}.{os.getpid()}.pending",
    )
    try:
        os.replace(target_path, claimed_path)
    except FileNotFoundError:
        return None, None
    except (PermissionError, OSError) as exc:
        write_err = _write_claimed_bytes(claimed_path, raw)
        if write_err:
            return None, write_err
        try:
            os.remove(target_path)
        except FileNotFoundError:
            return claimed_path, None
        except (PermissionError, OSError):
            _finalize_status_file(filename, claimed_path)
            return None, exc
        return claimed_path, None
    return claimed_path, None


def _parse_claimed_file(target_path: str) -> tuple[object | None, Exception | None]:
    try:
        with open(target_path, "r") as f:
            raw = f.read()
        return json.loads(raw), None
    except (json.JSONDecodeError, PermissionError, OSError) as exc:
        return None, exc


def _read_status_files(filename: str) -> list[StatusPayloadFile]:
    """Read all parseable status files for a shortcut output filename."""
    path = os.path.join(ICLOUD_JOURNALSYNC_DIR, filename)
    claimed_paths: list[str] = []

    if os.path.exists(path):
        claimed_path, claim_err = _claim_status_file(filename, path)
        if claim_err and _is_transient_read_error(claim_err):
            logger.warning(
                "Deferred claiming %s: %s",
                os.path.basename(path),
                claim_err,
            )
        elif claim_err and not isinstance(claim_err, ValueError):
            logger.error("Failed to claim %s: %s", os.path.basename(path), claim_err)
        if claimed_path:
            claimed_paths.append(claimed_path)

    candidates = _pending_status_candidates(filename)
    candidates.extend(claimed_paths)
    candidates = sorted(set(candidates), key=lambda p: os.path.getmtime(p))
    payloads: list[StatusPayloadFile] = []

    for cand in candidates:
        data, parse_err = _parse_claimed_file(cand)
        if parse_err is None:
            payloads.append((data, cand))
            continue
        if _is_transient_read_error(parse_err):
            logger.warning("Deferred parsing %s: %s", os.path.basename(cand), parse_err)
            continue
        logger.error("Failed to parse %s: %s", os.path.basename(cand), parse_err)
        _quarantine_status_file(filename, cand)
    return payloads


def _finalize_status_file(filename: str, parsed_path: str | None) -> None:
    """Delete one consumed status file."""
    if parsed_path and os.path.exists(parsed_path):
        try:
            os.remove(parsed_path)
        except (PermissionError, OSError):
            pass


def _quarantine_status_file(filename: str, parsed_path: str | None) -> None:
    """Move parsed payload file to .invalid for later inspection."""
    if not parsed_path or not os.path.exists(parsed_path):
        return
    os.makedirs(STATUS_INVALID_DIR, exist_ok=True)
    label = _status_file_label(filename)
    backup_path = os.path.join(STATUS_INVALID_DIR, f"{label}.invalid")
    try:
        if os.path.exists(backup_path):
            ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
            backup_path = os.path.join(STATUS_INVALID_DIR, f"{label}.{ts}.invalid")
        os.replace(parsed_path, backup_path)
    except (PermissionError, OSError):
        pass


def _prune_invalid_status_files() -> None:
    """Remove quarantined payloads older than the diagnostic retention window."""
    cutoff = time.time() - (_INVALID_RETENTION_DAYS * 86400)
    try:
        names = os.listdir(STATUS_INVALID_DIR)
    except (FileNotFoundError, OSError):
        return

    for name in names:
        path = os.path.join(STATUS_INVALID_DIR, name)
        try:
            if name.endswith(".invalid") and os.path.getmtime(path) < cutoff:
                os.remove(path)
        except OSError:
            pass


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
    payload: Mapping[str, object],
    key: str,
    default: float = 0.0,
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
    if value is None or not isinstance(value, (str, int, float)):
        raise ValueError(f"Invalid payload: {key} must be numeric")
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid payload: {key} must be numeric") from exc


def _parse_sleep_payload(raw_payload: object) -> SleepPayload:
    """Parse and validate one sleep payload."""
    if not isinstance(raw_payload, dict):
        raise ValueError("Invalid sleep payload: expected JSON object")

    missing = [key for key in _SLEEP_REQUIRED_KEYS if key not in raw_payload]
    if missing:
        raise ValueError("Invalid sleep payload: missing keys " + ", ".join(missing))

    payload = dict(raw_payload)
    return SleepPayload(
        date=_required_iso_date(payload),
        start=_required_non_empty_str(payload, "start"),
        end=_required_non_empty_str(payload, "end"),
        sleep_min=_required_float(payload, "sleep_min"),
        awake_min=_required_float(payload, "awake_min"),
    )


def _parse_training_payload(
    raw_payload: object,
    source_kind: str,
) -> list[TrainingEntryPayload]:
    """Parse workout/stretching payloads into canonical entries."""
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
        parsed_entries.append(
            TrainingEntryPayload(
                date=_required_iso_date(payload),
                start=_optional_str(payload, "start"),
                end=_optional_str(payload, "end"),
                duration=_optional_float(payload, "duration"),
                type=_optional_str(payload, "type") or source_label,
            )
        )
    return parsed_entries


class ICloudDailyStatusSource(DailyStatusSource):
    """Claim, validate, stage, and consume iCloud Shortcut payloads."""

    def __init__(self) -> None:
        self._anchor_day: datetime.date | None = None
        self._resolved_days: tuple[datetime.date, ...] = ()
        self._training_by_day: dict[
            datetime.date,
            dict[str, list[TrainingEntryPayload]],
        ] = {}
        self._sleep_by_day: dict[datetime.date, SleepPayload] = {}

    def target_days(self, anchor_day: datetime.date) -> tuple[datetime.date, ...]:
        """Resolve all Shortcut-targeted days for this run."""
        if self._anchor_day == anchor_day:
            return self._resolved_days

        _prune_invalid_status_files()
        self._reset_staging(anchor_day)
        resolved_days: set[datetime.date] = {anchor_day}
        self._ingest_training_file(
            "workout_status.json",
            "workout",
            anchor_day=anchor_day,
            resolved_days=resolved_days,
        )
        self._ingest_training_file(
            "stretching_status.json",
            "stretching",
            anchor_day=anchor_day,
            resolved_days=resolved_days,
        )
        self._ingest_sleep_file(anchor_day=anchor_day, resolved_days=resolved_days)
        self._resolved_days = tuple(sorted(resolved_days))
        return self._resolved_days

    def _reset_staging(self, anchor_day: datetime.date) -> None:
        self._anchor_day = anchor_day
        self._resolved_days = (anchor_day,)
        self._training_by_day = {}
        self._sleep_by_day = {}

    def _ensure_ingested(self, anchor_day: datetime.date) -> None:
        if self._anchor_day is None:
            self.target_days(anchor_day)

    @staticmethod
    def _validate_payload_day(
        date_str: str,
        *,
        filename: str,
        anchor_day: datetime.date,
    ) -> datetime.date:
        try:
            payload_day = datetime.date.fromisoformat(date_str)
        except ValueError as exc:
            raise ValueError(
                f"Invalid {filename} payload: date must be YYYY-MM-DD"
            ) from exc
        if payload_day > anchor_day:
            raise ValueError(
                "Invalid "
                f"{filename} payload: date '{date_str}' is in the future "
                f"relative to run day '{anchor_day.isoformat()}'"
            )
        return payload_day

    def _ingest_training_file(
        self,
        filename: str,
        source_kind: str,
        *,
        anchor_day: datetime.date,
        resolved_days: set[datetime.date],
    ) -> None:
        for payload, parsed_path in _read_status_files(filename):
            try:
                entries = _parse_training_payload(payload, source_kind)
                for entry in entries:
                    payload_day = self._validate_payload_day(
                        entry.date,
                        filename=filename,
                        anchor_day=anchor_day,
                    )
                    day_payload = self._training_by_day.setdefault(payload_day, {})
                    source_payload = day_payload.setdefault(source_kind, [])
                    source_payload.append(entry)
                    resolved_days.add(payload_day)
            except ValueError as exc:
                logger.error("%s: %s", filename, exc)
                _quarantine_status_file(filename, parsed_path)
                continue
            _finalize_status_file(filename, parsed_path)

    def _ingest_sleep_file(
        self,
        *,
        anchor_day: datetime.date,
        resolved_days: set[datetime.date],
    ) -> None:
        filename = "sleep_status.json"
        for payload, parsed_path in _read_status_files(filename):
            try:
                parsed = _parse_sleep_payload(payload)
                payload_day = self._validate_payload_day(
                    parsed.date,
                    filename=filename,
                    anchor_day=anchor_day,
                )
                self._sleep_by_day[payload_day] = parsed
                resolved_days.add(payload_day)
            except ValueError as exc:
                logger.error("%s: %s", filename, exc)
                _quarantine_status_file(filename, parsed_path)
                continue
            _finalize_status_file(filename, parsed_path)

    def load_training(self, day: datetime.date) -> TrainingStatus:
        """Return workout/stretch payloads for one day."""
        self._ensure_ingested(day)
        day_entries = self._training_by_day.get(day, {})
        return TrainingStatus(
            workout_entries=tuple(day_entries.get("workout", [])),
            stretch_entries=tuple(day_entries.get("stretching", [])),
        )

    def load_sleep(self, day: datetime.date) -> SleepPayload | None:
        """Return the staged sleep payload for one day."""
        self._ensure_ingested(day)
        return self._sleep_by_day.get(day)
