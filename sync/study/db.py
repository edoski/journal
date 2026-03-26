"""Study-session database access facade for daily sync."""

from __future__ import annotations

import datetime
import sqlite3

from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord
from sync.study.core_data_time import core_data_to_datetime, datetime_to_core_data
from sync.study.enrichment import dedupe_sessions, enrich_sessions
from sync.study.repository import (
    fetch_sessions_for_day,
    get_db_connection,
    read_break_defaults,
)

BREAK_DEFAULTS = read_break_defaults()


def _detect_superseded_open_repairs(
    sessions: list[StudySessionRecord],
) -> list[tuple[int, datetime.datetime]]:
    """Return stale open session PKs that should close at the next same-day row."""
    repairs: list[tuple[int, datetime.datetime]] = []
    for idx, session in enumerate(sessions[:-1]):
        if session.get("completed_at") is not None:
            continue
        pk = session.get("pk")
        start = session.get("start")
        next_start = sessions[idx + 1].get("start")
        if not isinstance(pk, int):
            continue
        if not isinstance(start, datetime.datetime):
            continue
        if not isinstance(next_start, datetime.datetime):
            continue
        if next_start.date() != start.date():
            continue
        if next_start <= start:
            continue
        repairs.append((pk, next_start))
    return repairs


def _apply_superseded_open_repairs(
    conn: sqlite3.Connection,
    repairs: list[tuple[int, datetime.datetime]],
) -> None:
    """Persist completed_at values for superseded open session rows."""
    cur = conn.cursor()
    for pk, completed_at in repairs:
        cur.execute(
            """
            UPDATE ZSESSION
            SET ZCOMPLETEDAT = ?
            WHERE Z_PK = ? AND ZCOMPLETEDAT IS NULL
            """,
            (datetime_to_core_data(completed_at), pk),
        )
    conn.commit()


def get_sessions_for_day(
    day: datetime.date,
    day_schedule: DayScheduleProfile,
) -> list[StudySessionRecord]:
    """Fetch and enrich study sessions from the Flow database for one day."""
    now = datetime.datetime.now()
    conn = get_db_connection(readonly=True)
    try:
        all_sessions = fetch_sessions_for_day(
            conn,
            day,
            now=now,
        )
        repairs = _detect_superseded_open_repairs(all_sessions)
        if repairs:
            conn.close()
            write_conn = get_db_connection(readonly=False)
            try:
                _apply_superseded_open_repairs(write_conn, repairs)
            finally:
                write_conn.close()
            conn = get_db_connection(readonly=True)
            all_sessions = fetch_sessions_for_day(
                conn,
                day,
                now=now,
            )
        return enrich_sessions(
            all_sessions,
            day=day,
            day_schedule=day_schedule,
            cursor=conn.cursor(),
            now=now,
            break_defaults=BREAK_DEFAULTS,
        )
    finally:
        conn.close()


def get_todays_sessions(day_schedule: DayScheduleProfile) -> list[StudySessionRecord]:
    """Fetch and process study sessions for today."""
    return get_sessions_for_day(datetime.date.today(), day_schedule)


__all__ = [
    "BREAK_DEFAULTS",
    "core_data_to_datetime",
    "dedupe_sessions",
    "get_db_connection",
    "get_sessions_for_day",
    "get_todays_sessions",
]
