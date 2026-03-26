"""Repository helpers for reading Flow sessions and interruptions."""

from __future__ import annotations

import datetime
import os
import sqlite3
import subprocess

from sync.contracts.study import StudySessionRecord
from sync.log import get_logger
from sync.study.constants import (
    DB_PATH,
    FLOW_APP_DEFAULTS_DOMAIN,
    FLOW_BREAK_DEFAULT_KEYS,
    FLOW_PHASE_LONG_BREAK,
    FLOW_PHASE_SHORT_BREAK,
)
from sync.study.core_data_time import core_data_to_datetime, datetime_to_core_data

logger = get_logger(__name__)


def read_break_defaults() -> dict[str, int | None]:
    """Read Flow's configured short/long break lengths."""
    result: dict[str, int | None] = {
        FLOW_PHASE_SHORT_BREAK: None,
        FLOW_PHASE_LONG_BREAK: None,
    }
    for key in FLOW_BREAK_DEFAULT_KEYS:
        try:
            output = subprocess.check_output(
                [
                    "defaults",
                    "read",
                    FLOW_APP_DEFAULTS_DOMAIN,
                    f"{key}.durationInMinutes",
                ],
                text=True,
            )
            value = int(output.strip())
            if value > 0:
                result[key] = value
        except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
            continue
        except (PermissionError, OSError) as exc:
            logger.warning("Failed to read Flow defaults for %s: %s", key, exc)
    return result


def get_db_connection(readonly: bool = True) -> sqlite3.Connection:
    """Open the Flow database in read-only or writable mode."""
    if not os.path.exists(DB_PATH):
        logger.error("Database not found at %s", DB_PATH)
        raise FileNotFoundError(f"Flow database not found at {DB_PATH}")
    if readonly:
        return sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    return sqlite3.connect(str(DB_PATH))


def fetch_sessions_for_day(
    conn: sqlite3.Connection,
    day: datetime.date,
    *,
    now: datetime.datetime,
) -> list[StudySessionRecord]:
    """Fetch raw session rows for one day and normalize their timestamps."""
    cursor = conn.cursor()
    start_of_day = datetime.datetime(day.year, day.month, day.day, 0, 0, 0)
    end_of_day = datetime.datetime(day.year, day.month, day.day, 23, 59, 59)
    cd_start = datetime_to_core_data(start_of_day)
    cd_end = datetime_to_core_data(end_of_day)
    if cd_start is None or cd_end is None:
        return []

    cursor.execute(
        """
        SELECT Z_PK, ZSTARTEDAT, ZDURATION, ZPHASE, ZTITLE, ZCOMPLETEDAT
        FROM ZSESSION
        WHERE ZSTARTEDAT >= ? AND ZSTARTEDAT <= ?
        ORDER BY ZSTARTEDAT ASC
        """,
        (cd_start, cd_end),
    )

    sessions: list[StudySessionRecord] = []
    for (
        pk,
        started_at,
        duration_planned,
        phase,
        title,
        completed_at,
    ) in cursor.fetchall():
        start_dt = core_data_to_datetime(started_at)
        if start_dt is None:
            continue

        completed_dt = core_data_to_datetime(completed_at) if completed_at else None
        end_dt = completed_dt or max(now, start_dt)
        actual_duration_min = max(0.0, (end_dt - start_dt).total_seconds() / 60)
        sessions.append(
            {
                "pk": pk,
                "pks": [pk],
                "start": start_dt,
                "end": end_dt,
                "duration": duration_planned,
                "planned_duration": duration_planned,
                "actual_elapsed": actual_duration_min,
                "completed_at": completed_dt,
                "phase": phase,
                "title": title,
                "interruptions_count": 0,
                "interruptions_duration": 0,
                "break_duration": 0,
            }
        )
    return sessions


def load_interruptions(
    cursor: sqlite3.Cursor,
    session_pks: list[int],
) -> tuple[int, float]:
    """Load interruption count/duration totals for a set of source session PKs."""
    total_count = 0
    total_duration = 0.0
    for pk in session_pks:
        cursor.execute(
            """
            SELECT count(*), sum(ZFINISHEDAT - ZSTARTEDAT)
            FROM ZINTERRUPTION
            WHERE ZSESSION = ?
            """,
            (pk,),
        )
        row = cursor.fetchone()
        if not row:
            continue
        total_count += int(row[0] or 0)
        total_duration += float(row[1] or 0)
    return total_count, total_duration
