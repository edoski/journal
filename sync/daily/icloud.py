"""
iCloud status file handling for daily sync.

Provides resilient loading of status files from iCloud with retry logic,
file size stabilization, and fallback to .invalid copies. Also handles
writing study times for iPad shortcut consumption.
"""

from __future__ import annotations

import datetime
import glob
import json
import os
import time

from sync.logging import get_logger

from .constants import ICLOUD_JOURNALSYNC_DIR
from sync.study.db import SessionDict

logger = get_logger()

# iCloud path for study times JSON (read by iPad shortcut)
STUDY_TIMES_ICLOUD_PATH = os.path.join(ICLOUD_JOURNALSYNC_DIR, "study_times.json")


def load_status_file(filename: str) -> tuple[bool, dict | None]:
    """
    Read and JSON-parse a status file dropped in iCloud by Shortcuts.

    Resilience features:
    - Wait for the file size to stabilize (to avoid half-synced reads).
    - Retry for up to ~60 seconds before giving up.
    - Only delete the file after a successful parse.
    - If parsing never succeeds, keep a `.invalid` copy for inspection
      and return (False, None) without touching frontmatter.

    Args:
        filename: Name of the status file (e.g., "workout_status.json")

    Returns:
        Tuple of (success, data) where success is True if data was loaded
    """
    path = os.path.join(ICLOUD_JOURNALSYNC_DIR, filename)

    def try_parse(
        target_path: str, delete_after: bool
    ) -> tuple[bool, dict | None, Exception | None]:
        last_size: int | None = None
        stable_count = 0
        max_attempts = 60
        stable_needed = 2
        last_err: Exception | None = None

        for _ in range(max_attempts):
            try:
                size = os.path.getsize(target_path)
            except FileNotFoundError:
                last_err = FileNotFoundError("file disappeared while waiting")
                time.sleep(1.0)
                continue

            if size == 0:
                last_err = ValueError("empty file (likely still syncing)")
                stable_count = 0
                time.sleep(1.0)
                continue

            if last_size is not None and size == last_size:
                stable_count += 1
            else:
                stable_count = 0
                last_size = size

            if stable_count < stable_needed:
                time.sleep(1.0)
                continue

            try:
                with open(target_path, "r") as f:
                    raw = f.read()
                data = json.loads(raw)
                if delete_after:
                    try:
                        os.remove(target_path)
                    except (PermissionError, OSError):
                        pass
                return True, data, None
            except (json.JSONDecodeError, PermissionError, OSError) as e:
                last_err = e
                time.sleep(1.0)

        return False, None, last_err

    def cleanup_invalids(primary_path: str) -> None:
        invalids = glob.glob(primary_path + ".invalid") + glob.glob(
            primary_path + ".*.invalid"
        )
        for inv in invalids:
            try:
                os.remove(inv)
            except (PermissionError, OSError):
                pass

    # First try the primary path
    last_err: Exception | None = None
    if os.path.exists(path):
        success, data, last_err = try_parse(path, delete_after=True)
        if success:
            cleanup_invalids(path)
            return True, data
        # Promote the failed file to an .invalid copy for inspection/retry.
        backup_path = path + ".invalid"
        try:
            if os.path.exists(backup_path):
                ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
                backup_path = f"{path}.{ts}.invalid"
            os.replace(path, backup_path)
        except (PermissionError, OSError):
            pass
    else:
        # Missing is expected most of the time; treat as no new data.
        return False, None

    # Fallback: reprocess any existing .invalid copies (most recent first)
    candidates = glob.glob(path + ".invalid") + glob.glob(path + ".*.invalid")
    candidates = sorted(
        set(candidates), key=lambda p: os.path.getmtime(p), reverse=True
    )
    for cand in candidates:
        success, data, _ = try_parse(cand, delete_after=False)
        if success:
            cleanup_invalids(path)
            return True, data

    if last_err:
        logger.error("Failed to parse %s: %s", os.path.basename(path), last_err)
    return False, None


def write_study_times_to_icloud(sessions: list[SessionDict], today_str: str) -> None:
    """
    Write study session times to iCloud for iPad shortcut to read.

    Args:
        sessions: List of study session dicts
        today_str: Today's date string (YYYY-MM-DD)
    """
    if not sessions:
        return

    # All calculations anchor to the note date to keep fallbacks deterministic
    note_date = datetime.date.fromisoformat(today_str)

    # Default schedule used when actual times would create invalid ranges
    default_morning = datetime.datetime.combine(note_date, datetime.time(8, 0))
    default_lunch = datetime.datetime.combine(note_date, datetime.time(13, 30))
    default_afternoon = datetime.datetime.combine(note_date, datetime.time(14, 30))
    default_afternoon_end = datetime.datetime.combine(note_date, datetime.time(18, 0))

    first_start = sessions[0]["start"]
    last_end = sessions[-1]["end"]

    # Find last session ending between 12:00-15:00 (pre-lunch)
    lunch_start = None
    for session in sessions:
        end_hour = session["end"].hour
        if 12 <= end_hour < 15:
            lunch_start = session["end"]

    # Compute afternoon start (1 hour after lunch)
    afternoon_start = None
    if lunch_start:
        afternoon_start = lunch_start + datetime.timedelta(hours=1)

    # Compute afternoon start time for comparison (use actual or default 14:30)
    afternoon_start_time = (
        afternoon_start
        if afternoon_start
        else first_start.replace(hour=14, minute=30, second=0, microsecond=0)
    )

    afternoon_end = (
        last_end if last_end >= afternoon_start_time else default_afternoon_end
    )

    def _normalize_study_times(
        morning: datetime.datetime,
        lunch: datetime.datetime | None,
        afternoon: datetime.datetime | None,
        end: datetime.datetime | None,
    ) -> tuple[
        datetime.datetime, datetime.datetime, datetime.datetime, datetime.datetime
    ]:
        """Clamp times to a safe, monotonic schedule for the Shortcut.

        Ensures: morning <= lunch <= afternoon <= end, with minimal defaults when
        real data would violate ordering. Equal times are nudged forward by 1 minute
        to keep the Shortcut's "between" action happy with positive windows.
        """

        minute = datetime.timedelta(minutes=1)

        m_start = morning or default_morning
        l_start = lunch or default_lunch
        a_start = afternoon or default_afternoon
        a_end = end or default_afternoon_end

        # If the first session starts after (or exactly at) lunch, fall back to the
        # canonical schedule to avoid an inverted window.
        if m_start >= l_start:
            m_start = default_morning
            l_start = default_lunch

        # Keep lunch before/at afternoon
        if l_start > a_start:
            a_start = max(l_start, default_afternoon)

        # Keep afternoon before/at end
        if a_start > a_end:
            a_end = max(a_start, default_afternoon_end)

        # Nudge equalities to keep strictly increasing ranges
        if m_start == l_start:
            l_start = l_start + minute
        if l_start == a_start:
            a_start = a_start + minute
        if a_start == a_end:
            a_end = a_end + minute

        return m_start, l_start, a_start, a_end

    m_start, l_start, a_start, a_end = _normalize_study_times(
        first_start, lunch_start, afternoon_start, afternoon_end
    )

    data = {
        "date": today_str,
        "morning_start": m_start.strftime("%H:%M"),
        "lunch_start": l_start.strftime("%H:%M"),
        "afternoon_start": a_start.strftime("%H:%M"),
        "afternoon_end": a_end.strftime("%H:%M"),
    }

    try:
        # Skip write if content unchanged (avoids triggering file watcher)
        if os.path.exists(STUDY_TIMES_ICLOUD_PATH):
            with open(STUDY_TIMES_ICLOUD_PATH, "r") as f:
                existing = json.load(f)
            if existing == data:
                return  # No change, skip write

        os.makedirs(os.path.dirname(STUDY_TIMES_ICLOUD_PATH), exist_ok=True)
        with open(STUDY_TIMES_ICLOUD_PATH, "w") as f:
            json.dump(data, f, indent=2)
    except (PermissionError, OSError) as e:
        logger.warning("Failed to write study_times.json: %s", e)
    except json.JSONDecodeError:
        # Existing file is corrupt, overwrite it
        try:
            with open(STUDY_TIMES_ICLOUD_PATH, "w") as f:
                json.dump(data, f, indent=2)
        except (PermissionError, OSError) as e:
            logger.warning("Failed to write study_times.json: %s", e)
