"""
Shared utilities for interacting with the Flow app's CoreData SQLite database.

IMPORTANT: Make sure Flow is NOT running when executing scripts that modify
the database, or changes may not persist.
"""

from __future__ import annotations

import datetime
import sqlite3

from sync.study.constants import CORE_DATA_EPOCH_OFFSET, DB_PATH


def core_data_to_datetime(timestamp: float | None) -> datetime.datetime | None:
    """Convert a CoreData timestamp to a Python datetime."""
    if timestamp is None:
        return None
    return datetime.datetime.fromtimestamp(timestamp + CORE_DATA_EPOCH_OFFSET)


def datetime_to_core_data(dt: datetime.datetime) -> float:
    """Convert a Python datetime to a CoreData timestamp."""
    return dt.timestamp() - CORE_DATA_EPOCH_OFFSET


def get_connection(readonly: bool = True) -> sqlite3.Connection:
    """
    Open a connection to the Flow database.

    Args:
        readonly: If True, opens in read-only mode (safer for previews).
                  If False, opens in read-write mode (for modifications).

    Returns:
        sqlite3.Connection to the Flow database.

    Raises:
        sqlite3.Error: If the database cannot be opened.
    """
    if readonly:
        uri = f"file:{DB_PATH}?mode=ro"
        return sqlite3.connect(uri, uri=True)
    return sqlite3.connect(str(DB_PATH))


def get_recent_sessions(conn: sqlite3.Connection, limit: int = 10) -> list[dict]:
    """
    Get the N most recent sessions from the database.

    Returns a list of dicts with keys:
        pk, phase, duration, start, completed, title
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE
        FROM ZSESSION
        ORDER BY ZSTARTEDAT DESC
        LIMIT ?
    """,
        (limit,),
    )

    sessions = []
    for row in cursor.fetchall():
        pk, phase, duration, started_at, completed_at, title = row
        sessions.append(
            {
                "pk": pk,
                "phase": phase,
                "duration": duration,
                "start": core_data_to_datetime(started_at),
                "completed": core_data_to_datetime(completed_at),
                "title": title,
            }
        )
    return sessions


def get_session_by_pk(conn: sqlite3.Connection, pk: int) -> dict | None:
    """Get a single session by its primary key."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE
        FROM ZSESSION
        WHERE Z_PK = ?
    """,
        (pk,),
    )
    row = cursor.fetchone()
    if not row:
        return None

    pk, phase, duration, started_at, completed_at, title = row
    return {
        "pk": pk,
        "phase": phase,
        "duration": duration,
        "start": core_data_to_datetime(started_at),
        "completed": core_data_to_datetime(completed_at),
        "title": title,
    }


def get_interruptions_for_session(
    conn: sqlite3.Connection, session_pk: int
) -> list[dict]:
    """Get all interruptions for a given session."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT Z_PK, ZSTARTEDAT, ZFINISHEDAT, ZPHASE
        FROM ZINTERRUPTION
        WHERE ZSESSION = ?
        ORDER BY ZSTARTEDAT
    """,
        (session_pk,),
    )

    results = []
    for row in cursor.fetchall():
        pk, started_at, finished_at, phase = row
        start = core_data_to_datetime(started_at)
        end = core_data_to_datetime(finished_at)

        # Calculate duration in minutes
        duration = None
        if start and end:
            duration = (end - start).total_seconds() / 60

        results.append(
            {
                "pk": pk,
                "start": start,
                "end": end,
                "duration": duration,
                "phase": phase,
            }
        )
    return results


def format_session(session: dict, include_pk: bool = False) -> str:
    """Format a session dict as a human-readable string."""
    lines = []

    if include_pk:
        lines.append(f"  PK:       {session['pk']}")

    lines.append(f"  Phase:    {session['phase']}")
    lines.append(f"  Title:    {session['title'] or '(no title)'}")

    if session["start"]:
        lines.append(f"  Started:  {session['start'].strftime('%Y-%m-%d %H:%M:%S')}")

    lines.append(f"  Duration: {session['duration']} min (planned)")

    status = "✓ completed" if session["completed"] else "⏳ in-progress"
    lines.append(f"  Status:   {status}")

    return "\n".join(lines)
