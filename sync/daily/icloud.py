"""
iCloud status file handling for daily sync.

Treats iCloud as a drop-file inbox: claim stable files into local cache,
parse locally, then delete or archive the claimed copy.
"""

from __future__ import annotations

import datetime
import errno
import glob
import json
import os
import tempfile
import time

from sync.config import PATHS
from sync.log import get_logger

from .constants import ICLOUD_JOURNALSYNC_DIR

logger = get_logger(__name__)

STATUS_STAGING_DIR = os.path.join(PATHS.daily_cache_dir, "status", "pending")
STATUS_INVALID_DIR = os.path.join(PATHS.daily_cache_dir, "status", "invalid")
_READ_RETRY_SECONDS = 0.25
StatusPayloadFile = tuple[object, str]
_TRANSIENT_ERRNOS = {
    errno.EAGAIN,
    errno.EBUSY,
    errno.EDEADLK,
    errno.ESTALE,
    errno.ETIMEDOUT,
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
            finalize_status_file(filename, claimed_path)
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


def read_status_file(filename: str) -> tuple[bool, object | None, str | None]:
    """
    Read and JSON-parse a status file dropped in iCloud by Shortcuts.

    Primary iCloud files are moved into local cache before parsing. Pending
    local files from interrupted runs are retried first.

    Args:
        filename: Name of the status file (e.g., "workout_status.json")

    Returns:
        Tuple of (success, data, parsed_path) where parsed_path is the file that
        was successfully parsed and can later be finalized or quarantined.
    """
    payloads = read_status_files(filename)
    if not payloads:
        return False, None, None
    payload, parsed_path = payloads[0]
    return True, payload, parsed_path


def read_status_files(filename: str) -> list[StatusPayloadFile]:
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
        quarantine_status_file(filename, cand)
    return payloads


def finalize_status_file(filename: str, parsed_path: str | None) -> None:
    """Delete one consumed status file."""
    if parsed_path and os.path.exists(parsed_path):
        try:
            os.remove(parsed_path)
        except (PermissionError, OSError):
            pass


def quarantine_status_file(filename: str, parsed_path: str | None) -> None:
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
