"""Repository helpers for reading Flow sessions and interruptions."""

from __future__ import annotations

import datetime
import os
import sqlite3
import subprocess
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from sync.contracts.study import StudySessionRecord
from sync.log import get_logger
from sync.study.constants import (
    BREAK_LINK_MAX_GAP_SECONDS,
    DB_PATH,
    FLOW_APP_DEFAULTS_DOMAIN,
    FLOW_BREAK_DEFAULT_KEYS,
    FLOW_PHASE_LONG_BREAK,
    FLOW_PHASE_SHORT_BREAK,
)
from sync.study.core_data_time import core_data_to_datetime, datetime_to_core_data

logger = get_logger(__name__)

ConnectionFactory = Callable[[bool], sqlite3.Connection]


@dataclass(frozen=True)
class FlowDaySessions:
    """Raw Flow rows and interruption totals loaded in one repository read."""

    sessions: list[StudySessionRecord]
    interruption_totals: dict[int, tuple[int, float]]


@dataclass(frozen=True)
class FlowUndoResult:
    """Rows affected by one atomic session undo."""

    breaks: tuple[StudySessionRecord, ...]
    deleted_interruptions: int


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


def _fetch_sessions_for_day(
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


def _apply_superseded_open_repairs(
    connection: sqlite3.Connection,
    repairs: list[tuple[int, datetime.datetime]],
) -> None:
    """Close stale open rows at the next same-day session start."""
    cursor = connection.cursor()
    for pk, completed_at in repairs:
        cursor.execute(
            """
            UPDATE ZSESSION
            SET ZCOMPLETEDAT = ?
            WHERE Z_PK = ? AND ZCOMPLETEDAT IS NULL
            """,
            (datetime_to_core_data(completed_at), pk),
        )


def _load_interruption_totals(
    cursor: sqlite3.Cursor,
    session_pks: list[int],
) -> dict[int, tuple[int, float]]:
    """Load interruption count/duration totals keyed by source session PK."""
    totals: dict[int, tuple[int, float]] = {}
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
        if row:
            totals[pk] = (int(row[0] or 0), float(row[1] or 0))
    return totals


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


def _associated_break_sessions(
    connection: sqlite3.Connection,
    focus_end: datetime.datetime,
) -> list[StudySessionRecord]:
    focus_core = datetime_to_core_data(focus_end)
    if focus_core is None:
        return []

    cursor = connection.cursor()
    cursor.execute(
        """
        SELECT Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE
        FROM ZSESSION
        WHERE ZPHASE IN ('shortBreak', 'longBreak')
          AND ZSTARTEDAT >= ?
          AND ZSTARTEDAT <= ?
        ORDER BY ZSTARTEDAT ASC
        """,
        (focus_core, focus_core + BREAK_LINK_MAX_GAP_SECONDS),
    )
    sessions: list[StudySessionRecord] = []
    for pk, phase, duration, started_at, completed_at, title in cursor.fetchall():
        start = core_data_to_datetime(started_at)
        if start is None:
            continue
        sessions.append(
            {
                "pk": int(pk),
                "pks": [int(pk)],
                "phase": str(phase),
                "duration": float(duration or 0.0),
                "planned_duration": float(duration or 0.0),
                "start": start,
                "end": core_data_to_datetime(completed_at) or start,
                "completed_at": core_data_to_datetime(completed_at),
                "title": str(title or ""),
                "interruptions_count": 0,
                "interruptions_duration": 0.0,
            }
        )
    return sessions


def _unique_pks(pks: list[int]) -> tuple[int, ...]:
    return tuple(dict.fromkeys(pks))


def _require_session_pks(
    connection: sqlite3.Connection,
    pks: tuple[int, ...],
) -> None:
    if not pks:
        return
    placeholders = ", ".join("?" for _pk in pks)
    rows = connection.execute(
        f"SELECT Z_PK FROM ZSESSION WHERE Z_PK IN ({placeholders})",
        pks,
    ).fetchall()
    found = {int(row[0]) for row in rows}
    missing = [pk for pk in pks if pk not in found]
    if missing:
        detail = ", ".join(str(pk) for pk in missing)
        raise LookupError(f"Flow session rows not found: {detail}")


class FlowSessionRepository:
    """Own all SQLite lifecycle and persistence operations for Flow sessions."""

    def __init__(
        self,
        *,
        connection_factory: ConnectionFactory = get_db_connection,
    ) -> None:
        self._connection_factory = connection_factory

    @contextmanager
    def _connection(self, readonly: bool) -> Iterator[sqlite3.Connection]:
        connection = self._connection_factory(readonly)
        try:
            yield connection
        finally:
            connection.close()

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        with self._connection(False) as connection:
            try:
                connection.execute("BEGIN IMMEDIATE")
                yield connection
            except Exception:
                connection.rollback()
                raise
            else:
                connection.commit()

    def ensure_readable(self) -> None:
        """Open and close the configured database in read-only mode."""
        with self._connection(True):
            pass

    def load_day_sessions(
        self,
        day: datetime.date,
        *,
        now: datetime.datetime,
    ) -> FlowDaySessions:
        """Load one day's rows, repairing stale open sessions when needed."""
        with self._connection(True) as connection:
            sessions = _fetch_sessions_for_day(connection, day, now=now)
            repairs = _superseded_open_repairs(sessions)
            if not repairs:
                session_pks = [
                    pk
                    for session in sessions
                    if isinstance((pk := session.get("pk")), int)
                ]
                return FlowDaySessions(
                    sessions=sessions,
                    interruption_totals=_load_interruption_totals(
                        connection.cursor(), session_pks
                    ),
                )

        with self._transaction() as connection:
            _apply_superseded_open_repairs(connection, repairs)

        with self._connection(True) as connection:
            sessions = _fetch_sessions_for_day(connection, day, now=now)
            session_pks = [
                pk for session in sessions if isinstance((pk := session.get("pk")), int)
            ]
            interruption_totals = _load_interruption_totals(
                connection.cursor(), session_pks
            )
        return FlowDaySessions(
            sessions=sessions,
            interruption_totals=interruption_totals,
        )

    def rename_sessions(self, pks: list[int], title: str) -> None:
        """Rename every source row represented by one logical session."""
        unique_pks = _unique_pks(pks)
        if not unique_pks:
            return
        placeholders = ", ".join("?" for _pk in unique_pks)
        with self._transaction() as connection:
            _require_session_pks(connection, unique_pks)
            connection.execute(
                f"UPDATE ZSESSION SET ZTITLE = ? WHERE Z_PK IN ({placeholders})",
                (title, *unique_pks),
            )

    def find_associated_break_sessions(
        self,
        focus_end: datetime.datetime,
    ) -> tuple[StudySessionRecord, ...]:
        """Return break rows linked to a focus session's end."""
        with self._connection(True) as connection:
            return tuple(_associated_break_sessions(connection, focus_end))

    def undo_session(
        self,
        pks: list[int],
        focus_end: datetime.datetime | None,
    ) -> FlowUndoResult:
        """Delete a logical focus session and its linked breaks atomically."""
        focus_pks = _unique_pks(pks)
        with self._transaction() as connection:
            _require_session_pks(connection, focus_pks)
            breaks = (
                tuple(_associated_break_sessions(connection, focus_end))
                if focus_end is not None
                else ()
            )
            break_pks = tuple(item["pk"] for item in breaks)
            target_pks = _unique_pks([*focus_pks, *break_pks])
            if not target_pks:
                return FlowUndoResult(breaks=breaks, deleted_interruptions=0)
            placeholders = ", ".join("?" for _pk in target_pks)
            cursor = connection.execute(
                f"DELETE FROM ZINTERRUPTION WHERE ZSESSION IN ({placeholders})",
                target_pks,
            )
            deleted_interruptions = cursor.rowcount
            connection.execute(
                f"DELETE FROM ZSESSION WHERE Z_PK IN ({placeholders})",
                target_pks,
            )
        return FlowUndoResult(
            breaks=breaks,
            deleted_interruptions=deleted_interruptions,
        )

    def latest_open_flow_started_at(self) -> float | None:
        """Return the latest row's start marker only when it is an open focus."""
        with self._connection(True) as connection:
            cursor = connection.cursor()
            cursor.execute(
                """
                SELECT ZPHASE, ZCOMPLETEDAT, ZSTARTEDAT
                FROM ZSESSION
                ORDER BY ZSTARTEDAT DESC
                LIMIT 1
                """
            )
            row = cursor.fetchone()
        if not row:
            return None
        phase, completed_at, started_at = row
        if phase != "flow" or completed_at is not None or started_at is None:
            return None
        try:
            return float(started_at)
        except (TypeError, ValueError):
            return None
