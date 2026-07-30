"""Flow DB-backed session source adapter."""

from __future__ import annotations

import datetime
import sqlite3
from collections.abc import Callable

from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord
from sync.ports.sessions import StudySessionSource
from sync.study.enrichment import enrich_sessions
from sync.study.repository import (
    apply_superseded_open_repairs,
    fetch_sessions_for_day,
    get_db_connection,
    load_interruption_totals,
    read_break_defaults,
)

ConnectionFactory = Callable[[bool], sqlite3.Connection]
Clock = Callable[[], datetime.datetime]


class FlowStudySessionSource(StudySessionSource):
    """Own Flow session reads, stale-row repair, and domain enrichment."""

    def __init__(
        self,
        *,
        connection_factory: ConnectionFactory = get_db_connection,
        break_defaults: dict[str, int | None] | None = None,
        clock: Clock = datetime.datetime.now,
    ) -> None:
        self._connection_factory = connection_factory
        self._break_defaults = (
            read_break_defaults() if break_defaults is None else break_defaults
        )
        self._clock = clock

    @staticmethod
    def _superseded_open_repairs(
        sessions: list[StudySessionRecord],
    ) -> list[tuple[int, datetime.datetime]]:
        repairs: list[tuple[int, datetime.datetime]] = []
        for index, session in enumerate(sessions[:-1]):
            if session.get("completed_at") is not None:
                continue
            pk = session.get("pk")
            start = session.get("start")
            next_start = sessions[index + 1].get("start")
            if not isinstance(pk, int):
                continue
            if not isinstance(start, datetime.datetime):
                continue
            if not isinstance(next_start, datetime.datetime):
                continue
            if next_start.date() != start.date() or next_start <= start:
                continue
            repairs.append((pk, next_start))
        return repairs

    def load_sessions(
        self,
        day: datetime.date,
        day_schedule: DayScheduleProfile,
    ) -> list[StudySessionRecord]:
        """Return canonical sessions, repairing superseded open Flow rows."""
        now = self._clock()
        connection = self._connection_factory(True)
        try:
            sessions = fetch_sessions_for_day(connection, day, now=now)
            repairs = self._superseded_open_repairs(sessions)
            if repairs:
                connection.close()
                write_connection = self._connection_factory(False)
                try:
                    apply_superseded_open_repairs(write_connection, repairs)
                finally:
                    write_connection.close()
                connection = self._connection_factory(True)
                sessions = fetch_sessions_for_day(connection, day, now=now)
            session_pks = [
                pk for session in sessions if isinstance((pk := session.get("pk")), int)
            ]
            return enrich_sessions(
                sessions,
                day=day,
                day_schedule=day_schedule,
                interruption_totals=load_interruption_totals(
                    connection.cursor(),
                    session_pks,
                ),
                now=now,
                break_defaults=self._break_defaults,
            )
        finally:
            connection.close()
