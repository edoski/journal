"""Non-interactive CLI utilities for journal operations."""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import TypedDict

from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.markdown_schedule import MarkdownScheduleSource
from sync.config import LOGGING
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord
from sync.log import (
    add_logging_cli_args,
    configure_logging,
    get_logger,
    resolve_logging_settings,
)
from sync.ports.schedule import ScheduleSource
from sync.study.constants import CORE_DATA_EPOCH_OFFSET, DB_PATH

SKIP_LAUNCHD_LABEL = "com.edo.skip"
SKIP_LAUNCHD_DOMAIN = f"gui/{os.geteuid()}"
SKIP_LAUNCHD_TARGET = f"{SKIP_LAUNCHD_DOMAIN}/{SKIP_LAUNCHD_LABEL}"
SKIP_LOG_PATH = Path("/tmp/com.edo.skip.log")

logger = get_logger(__name__)


class CliSession(TypedDict):
    pk: int
    phase: str
    duration: float
    start: datetime | None
    completed: datetime | None
    title: str
    interruptions_count: int
    interruptions_duration: float


def _log_cap_bytes() -> int:
    raw = os.environ.get("JOURNAL_LOG_CAP_BYTES")
    if raw is None:
        return LOGGING.cap_bytes
    try:
        parsed = int(raw)
    except ValueError:
        return LOGGING.cap_bytes
    return parsed if parsed > 0 else LOGGING.cap_bytes


def _cap_log_file(path: Path, max_bytes: int) -> None:
    """Trim a log file in-place to the newest max_bytes bytes."""
    if max_bytes <= 0:
        return

    try:
        size = path.stat().st_size
    except OSError:
        return

    if size <= max_bytes:
        return

    try:
        with open(path, "rb") as handle:
            handle.seek(-max_bytes, os.SEEK_END)
            tail = handle.read(max_bytes)
        newline = tail.find(b"\n")
        if newline != -1 and newline + 1 < len(tail):
            tail = tail[newline + 1 :]
        with open(path, "wb") as handle:
            handle.write(tail)
    except OSError:
        return


def core_data_to_datetime(timestamp: float | None) -> datetime | None:
    """Convert CoreData timestamp to datetime."""
    if timestamp is None:
        return None
    return datetime.fromtimestamp(timestamp + CORE_DATA_EPOCH_OFFSET)


def datetime_to_core_data(value: datetime | None) -> float | None:
    """Convert datetime to CoreData timestamp."""
    if value is None:
        return None
    return value.timestamp() - CORE_DATA_EPOCH_OFFSET


def get_connection(readonly: bool = True) -> sqlite3.Connection:
    """Open SQLite connection to Study/Flow DB."""
    if readonly:
        uri = f"file:{DB_PATH}?mode=ro"
        return sqlite3.connect(uri, uri=True)
    return sqlite3.connect(str(DB_PATH))


def format_session(session: CliSession, include_pk: bool = False) -> str:
    """Format session payload for display."""
    lines = []
    if include_pk:
        lines.append(f"  PK:       {session['pk']}")
    lines.append(f"  Phase:    {session['phase']}")
    lines.append(f"  Title:    {session['title'] or '(no title)'}")
    if session["start"]:
        lines.append(f"  Started:  {session['start'].strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"  Duration: {session['duration']} min (planned)")
    lines.append(
        f"  Status:   {'✓ completed' if session['completed'] else '⏳ in-progress'}"
    )
    return "\n".join(lines)


def _now() -> datetime:
    """Current local datetime, wrapped for deterministic tests."""
    return datetime.now()


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
        key=lambda item: item.get("start") or datetime.min,
        reverse=True,
    )
    return sessions[:limit]


def _find_associated_break_session(
    conn: sqlite3.Connection,
    focus_session: CliSession,
) -> CliSession | None:
    focus_start = focus_session.get("start")
    if not isinstance(focus_start, datetime):
        return None

    focus_core = datetime_to_core_data(focus_start)
    if focus_core is None:
        return None

    cur = conn.cursor()
    cur.execute(
        """
        SELECT Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE
        FROM ZSESSION
        WHERE ZPHASE IN ('shortBreak', 'longBreak')
          AND ZSTARTEDAT >= ?
          AND ZSTARTEDAT <= ?
        ORDER BY ZSTARTEDAT ASC
        LIMIT 1
        """,
        (focus_core, focus_core + 120),
    )
    row = cur.fetchone()
    if not row:
        return None

    pk, phase, duration, started_at, completed_at, title = row
    return {
        "pk": int(pk),
        "phase": str(phase),
        "duration": float(duration or 0.0),
        "start": core_data_to_datetime(started_at),
        "completed": core_data_to_datetime(completed_at),
        "title": str(title or ""),
        "interruptions_count": 0,
        "interruptions_duration": 0.0,
    }


def cmd_session_rename(args: argparse.Namespace) -> int:
    """Rename most recent focus session."""
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
    """Delete most recent focus session and adjacent break."""
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

    brk = _find_associated_break_session(conn, focus)

    print("=" * 60)
    print("SESSIONS TO DELETE")
    print("=" * 60)
    print("\nFOCUS:")
    print(format_session(focus, include_pk=True))
    if brk:
        print("\nASSOCIATED BREAK:")
        print(format_session(brk, include_pk=True))

    if not args.confirm:
        print("\nPreview only. Re-run with --confirm to apply deletion.")
        conn.close()
        return 0

    total_interruptions = 0
    if brk:
        total_interruptions += _delete_session(conn, brk["pk"])
    total_interruptions += _delete_session(conn, focus["pk"])

    conn.commit()
    conn.close()
    print(f"Deleted session(s). Interruptions deleted: {total_interruptions}")
    return 0


def _run_launchctl(args: list[str]) -> tuple[int, str, str]:
    result = subprocess.run(
        ["launchctl", *args],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def _skip_enabled_state() -> bool | None:
    code, stdout, stderr = _run_launchctl(["print-disabled", SKIP_LAUNCHD_DOMAIN])
    if code != 0:
        detail = stderr or stdout or f"exit {code}"
        logger.warning("Unable to read launchd skip state: %s", detail)
        return None

    match = re.search(
        rf'"{re.escape(SKIP_LAUNCHD_LABEL)}"\s*=>\s*(true|false)',
        stdout,
    )
    if match is None:
        # Missing entries default to enabled in launchd print-disabled output.
        return True
    return match.group(1) == "false"


def _set_skip_enabled(enabled: bool) -> bool:
    command = "enable" if enabled else "disable"
    code, stdout, stderr = _run_launchctl([command, SKIP_LAUNCHD_TARGET])
    if code != 0:
        detail = stderr or stdout or f"exit {code}"
        logger.error("Failed to %s %s: %s", command, SKIP_LAUNCHD_TARGET, detail)
        return False
    return True


def _print_skip_status(enabled: bool) -> None:
    status = "ENABLED" if enabled else "DISABLED"
    print(f"Skip automation: {status}")


def _apply_skip_state(state: str) -> int:
    current = _skip_enabled_state()
    if current is None:
        print("Skip automation: UNKNOWN (launchd state unavailable)")
        return 1

    if state == "status":
        _print_skip_status(current)
        return 0

    if state != "toggle":
        raise ValueError(f"Unsupported skip state action: {state}")
    target = not current

    if not _set_skip_enabled(target):
        return 1

    updated = _skip_enabled_state()
    _print_skip_status(target if updated is None else updated)
    return 0


def _resolve_day_schedule(day: date) -> DayScheduleProfile:
    return MarkdownScheduleSource().resolve_day(day)


def _is_within_study_window(now: datetime, day_schedule: DayScheduleProfile) -> bool:
    """Return True when `now` falls within the schedule window by minute bucket.

    Launchd triggers are minute-based and can fire a few seconds after the minute,
    so this gate compares only hour+minute and includes the end minute.
    """
    current_minutes = now.hour * 60 + now.minute
    start_minutes = day_schedule.study_start.hour * 60 + day_schedule.study_start.minute
    end_minutes = day_schedule.study_end.hour * 60 + day_schedule.study_end.minute
    return start_minutes <= current_minutes <= end_minutes


def _run_applescript(script: str) -> str | None:
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() if exc.stderr else str(exc)
        logger.error("AppleScript error: %s", detail)
        return None


def _latest_row_is_open_flow(conn: sqlite3.Connection) -> bool:
    """Return True when latest session row is an open focus session."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT ZPHASE, ZCOMPLETEDAT
        FROM ZSESSION
        ORDER BY ZSTARTEDAT DESC
        LIMIT 1
        """
    )
    row = cur.fetchone()
    if not row:
        return False
    phase, completed_at = row
    return phase == "flow" and completed_at is None


def cmd_session_skip(args: argparse.Namespace) -> int:
    """Skip active focus session and start break within configured schedule windows."""
    if args.state is not None:
        return _apply_skip_state(args.state)

    enabled = _skip_enabled_state()
    if enabled is None:
        logger.warning("Skip no-op: unable to resolve launchd skip state")
        return 0
    if not enabled:
        logger.info("Skip no-op: automation disabled")
        return 0
    now = _now()
    try:
        day_schedule = _resolve_day_schedule(now.date())
    except Exception as exc:
        logger.warning(
            "Skip no-op: failed to resolve schedule for %s: %s", now.date(), exc
        )
        return 0

    if not _is_within_study_window(now, day_schedule):
        logger.info(
            "Skip no-op: outside scheduled study window (%s-%s)",
            day_schedule.study_start.strftime("%H:%M"),
            day_schedule.study_end.strftime("%H:%M"),
        )
        return 0

    phase = _run_applescript('tell application "Flow" to getPhase')
    logger.info("Current phase: %s", phase)
    if phase != "Flow":
        logger.info("Skip no-op: current phase is not Flow")
        return 0

    try:
        conn = get_connection(readonly=True)
    except Exception as exc:
        logger.warning("Skip no-op: failed to read Flow DB state: %s", exc)
        return 0

    try:
        if not _latest_row_is_open_flow(conn):
            logger.info("Skip no-op: latest session is not an open flow row")
            return 0
    except Exception as exc:
        logger.warning("Skip no-op: failed to evaluate latest session row: %s", exc)
        return 0
    finally:
        conn.close()

    if _run_applescript('tell application "Flow" to skip') is None:
        logger.warning("Skip no-op: Flow skip command failed")
        return 0
    if _run_applescript('tell application "Flow" to start') is None:
        logger.warning("Skip no-op: Flow start command failed after skip")
        return 0
    if _run_applescript('tell application "Flow" to show') is None:
        logger.warning("Skip no-op: Flow show command failed after skip/start")
        return 0

    logger.info("Skip executed")
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Construct CLI parser and subcommands."""
    parser = argparse.ArgumentParser(description="Study session CLI utilities")
    add_logging_cli_args(parser)
    sub = parser.add_subparsers(dest="command", required=True)

    rename = sub.add_parser("session-rename", help="Rename most recent focus session")
    rename.add_argument("title")
    rename.add_argument("--confirm", action="store_true")
    rename.set_defaults(func=cmd_session_rename)

    undo = sub.add_parser("session-undo", help="Delete most recent focus session")
    undo.add_argument("--confirm", action="store_true")
    undo.set_defaults(func=cmd_session_undo)

    skip = sub.add_parser("session-skip", help="Execute or manage skip automation")
    skip.add_argument(
        "--state",
        choices=["toggle", "status"],
        help="Manage launchd skip automation state",
    )
    skip.set_defaults(func=cmd_session_skip)

    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    parser = build_parser()
    args = parser.parse_args(argv)

    _cap_log_file(SKIP_LOG_PATH, _log_cap_bytes())
    level, log_format = resolve_logging_settings(args)
    configure_logging(level=level, log_format=log_format)

    try:
        return int(args.func(args))
    except Exception:
        logger.exception("CLI command failed: %s", args.command)
        return 1


if __name__ == "__main__":
    sys.exit(main())
