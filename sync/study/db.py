"""Study-session database access facade for daily sync."""

from __future__ import annotations

import datetime

from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord
from sync.study.core_data_time import core_data_to_datetime
from sync.study.enrichment import dedupe_sessions, enrich_sessions
from sync.study.repository import (
    fetch_sessions_for_day,
    get_db_connection,
    read_break_defaults,
)

BREAK_DEFAULTS = read_break_defaults()


def get_sessions_for_day(
    day: datetime.date,
    day_schedule: DayScheduleProfile,
) -> list[StudySessionRecord]:
    """Fetch and enrich study sessions from the Flow database for one day."""
    conn = get_db_connection()
    try:
        all_sessions = fetch_sessions_for_day(
            conn,
            day,
            now=datetime.datetime.now(),
        )
        return enrich_sessions(
            all_sessions,
            day=day,
            day_schedule=day_schedule,
            cursor=conn.cursor(),
            now=datetime.datetime.now(),
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
