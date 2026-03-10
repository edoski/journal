"""Flow session mutation command handlers."""

from __future__ import annotations

import argparse
import datetime
import sqlite3
from datetime import date, timedelta
from typing import TypedDict

from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.markdown_schedule import MarkdownScheduleSource
from sync.contracts.study import StudySessionRecord
from sync.log import get_logger
from sync.ports.schedule import ScheduleSource
from sync.study.constants import BREAK_LINK_MAX_GAP_SECONDS, DB_PATH
from sync.study.core_data_time import core_data_to_datetime, datetime_to_core_data

logger = get_logger(__name__)


class CliSession(TypedDict):
    pk: int
    phase: str
    duration: float
    start: datetime.datetime | None
    completed: datetime.datetime | None
    title: str
    interruptions_count: int
    interruptions_duration: float


def get_connection(readonly: bool = True) -> sqlite3.Connection:
    if readonly:
        uri = f"file:{DB_PATH}?mode=ro"
        return sqlite3.connect(uri, uri=True)
    return sqlite3.connect(str(DB_PATH))


def format_session(session: CliSession, include_pk: bool = False) -> str:
    lines = []
    if include_pk:
        lines.append(f"  PK:       {session['pk']}")
    lines.append(f"  Phase:    {session['phase']}")
    lines.append(f"  Title:    {session['title'] or '(no title)'}")
    if session["start"]:
        lines.append(f"  Started:  {session['start'].strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"  Duration: {session['duration']} min (planned)")
    status = "completed" if session["completed"] else "in-progress"
    lines.append(f"  Status:   {status}")
    return "\n".join(lines)


def _find_most_recent_focus(sessions: list[CliSession]) -> CliSession | None:
    for session in sessions:
        if session["phase"] == "flow":
            return session
    return None


def _delete_session(conn: sqlite3.Connection, pk: int) -> int:
    cur = conn.cursor()
    cur.execute("DELETE FROM ZINTERRUPTION WHERE ZSESSION = ?", (pk,))
    deleted_interruptions = cur.rowcount
    cur.execute("DELETE FROM ZSESSION WHERE Z_PK = ?", (pk,))
    return deleted_interruptions


def _record_to_cli_session(record: StudySessionRecord) -> CliSession:
    planned = record.get("planned_duration") or record.get("duration") or 0.0
    return {
        "pk": int(record.get("pk", 0) or 0),
        "phase": "flow",
        "duration": float(planned),
        "start": record.get("start"),
        "completed": record.get("completed_at"),
        "title": record.get("title") or "",
        "interruptions_count": int(record.get("interruptions_count", 0) or 0),
        "interruptions_duration": float(record.get("interruptions_duration", 0) or 0),
    }


def _load_recent_focus_sessions(
    source: FlowStudySessionSource,
    schedule_source: ScheduleSource,
    *,
    limit: int,
    lookback_days: int = 14,
) -> list[CliSession]:
    sessions: list[CliSession] = []
    today = date.today()

    for delta_days in range(lookback_days + 1):
        day = today - timedelta(days=delta_days)
        try:
            day_schedule = schedule_source.resolve_day(day)
            day_sessions = source.load_sessions(day, day_schedule)
        except Exception as exc:
            logger.debug("Failed to load sessions for %s: %s", day, exc)
            continue
        sessions.extend(_record_to_cli_session(item) for item in day_sessions)
        if len(sessions) >= limit:
            break

    sessions.sort(
        key=lambda item: item.get("start") or datetime.datetime.min,
        reverse=True,
    )
    return sessions[:limit]


def _session_end_for_break_lookup(
    focus_session: CliSession,
) -> datetime.datetime | None:
    """Return the best end timestamp to use when locating linked breaks."""
    completed = focus_session.get("completed")
    if isinstance(completed, datetime.datetime):
        return completed

    start = focus_session.get("start")
    if not isinstance(start, datetime.datetime):
        return None
    planned_minutes = max(0.0, float(focus_session.get("duration", 0) or 0))
    return start + datetime.timedelta(minutes=planned_minutes)


def _find_associated_break_sessions(
    conn: sqlite3.Connection,
    focus_session: CliSession,
) -> list[CliSession]:
    focus_end = _session_end_for_break_lookup(focus_session)
    if not isinstance(focus_end, datetime.datetime):
        return []

    focus_core = datetime_to_core_data(focus_end)
    if focus_core is None:
        return []

    cur = conn.cursor()
    cur.execute(
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
    rows = cur.fetchall()
    breaks: list[CliSession] = []
    for pk, phase, duration, started_at, completed_at, title in rows:
        breaks.append(
            {
                "pk": int(pk),
                "phase": str(phase),
                "duration": float(duration or 0.0),
                "start": core_data_to_datetime(started_at),
                "completed": core_data_to_datetime(completed_at),
                "title": str(title or ""),
                "interruptions_count": 0,
                "interruptions_duration": 0.0,
            }
        )
    return breaks


def cmd_session_rename(args: argparse.Namespace) -> int:
    session_source = FlowStudySessionSource()
    schedule_source = MarkdownScheduleSource()
    sessions = _load_recent_focus_sessions(
        session_source,
        schedule_source,
        limit=10,
    )
    focus = _find_most_recent_focus(sessions)
    if not focus:
        print("No focus session found to rename.")
        return 0

    try:
        conn = get_connection(readonly=not args.confirm)
    except Exception as exc:
        print(f"Error: could not open database: {exc}")
        return 1

    print("=" * 60)
    print("SESSION TO BE RENAMED")
    print("=" * 60)
    print("\nCURRENT:")
    print(format_session(focus, include_pk=True))
    print(f'\nNEW TITLE: "{args.title}"')

    if not args.confirm:
        print("\nPreview only. Re-run with --confirm to apply.")
        conn.close()
        return 0

    cur = conn.cursor()
    cur.execute(
        "UPDATE ZSESSION SET ZTITLE = ? WHERE Z_PK = ?", (args.title, focus["pk"])
    )
    conn.commit()
    conn.close()
    print(f'\nUpdated session title to "{args.title}"')
    return 0


def cmd_session_undo(args: argparse.Namespace) -> int:
    session_source = FlowStudySessionSource()
    schedule_source = MarkdownScheduleSource()
    sessions = _load_recent_focus_sessions(
        session_source,
        schedule_source,
        limit=10,
    )
    focus = _find_most_recent_focus(sessions)
    if not focus:
        print("No focus session found to delete.")
        return 0

    try:
        conn = get_connection(readonly=not args.confirm)
    except Exception as exc:
        print(f"Error: could not open database: {exc}")
        return 1

    breaks = _find_associated_break_sessions(conn, focus)

    print("=" * 60)
    print("SESSIONS TO DELETE")
    print("=" * 60)
    print("\nFOCUS:")
    print(format_session(focus, include_pk=True))
    for brk in breaks:
        print("\nASSOCIATED BREAK:")
        print(format_session(brk, include_pk=True))

    if not args.confirm:
        print("\nPreview only. Re-run with --confirm to apply deletion.")
        conn.close()
        return 0

    total_interruptions = 0
    for brk in breaks:
        total_interruptions += _delete_session(conn, brk["pk"])
    total_interruptions += _delete_session(conn, focus["pk"])

    conn.commit()
    conn.close()
    print(f"Deleted session(s). Interruptions deleted: {total_interruptions}")
    return 0
