"""Non-interactive CLI utilities for journal operations."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.config import LOGGING
from sync.contracts.study import StudySessionRecord
from sync.log import (
    add_logging_cli_args,
    configure_logging,
    get_logger,
    resolve_logging_settings,
)
from sync.study.constants import CORE_DATA_EPOCH_OFFSET, DB_PATH

SKIP_CONFIG_PATH = Path.home() / ".config" / "journal" / "skip_schedule.json"
FLOW_SKIP_LOG_PATH = Path("/tmp/flow-skip.log")

logger = get_logger(__name__)


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


def get_recent_sessions(conn: sqlite3.Connection, limit: int = 10) -> list[dict]:
    """Fetch recent sessions sorted by descending start time."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT Z_PK, ZPHASE, ZDURATION, ZSTARTEDAT, ZCOMPLETEDAT, ZTITLE
        FROM ZSESSION
        ORDER BY ZSTARTEDAT DESC
        LIMIT ?
        """,
        (limit,),
    )

    sessions: list[dict] = []
    for row in cur.fetchall():
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


def get_interruptions_for_session(
    conn: sqlite3.Connection, session_pk: int
) -> list[dict]:
    """Fetch interruption rows for a session."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT Z_PK, ZSTARTEDAT, ZFINISHEDAT, ZPHASE
        FROM ZINTERRUPTION
        WHERE ZSESSION = ?
        ORDER BY ZSTARTEDAT
        """,
        (session_pk,),
    )

    items: list[dict] = []
    for row in cur.fetchall():
        pk, started_at, finished_at, phase = row
        start = core_data_to_datetime(started_at)
        end = core_data_to_datetime(finished_at)
        duration = None
        if start and end:
            duration = (end - start).total_seconds() / 60
        items.append(
            {
                "pk": pk,
                "start": start,
                "end": end,
                "duration": duration,
                "phase": phase,
            }
        )
    return items


def format_session(session: dict, include_pk: bool = False) -> str:
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


def calculate_actual_duration(session: dict) -> float | None:
    """Compute actual session elapsed minutes."""
    if not session["start"]:
        return None
    end = session["completed"] or datetime.now()
    return (end - session["start"]).total_seconds() / 60


def _find_most_recent_focus(sessions: list[dict]) -> dict | None:
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


def _record_to_cli_session(record: StudySessionRecord) -> dict:
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
    *,
    limit: int,
    lookback_days: int = 14,
) -> list[dict]:
    sessions: list[dict] = []
    today = date.today()

    for delta_days in range(lookback_days + 1):
        day = today - timedelta(days=delta_days)
        try:
            day_sessions = source.load_sessions(day)
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
    focus_session: dict,
) -> dict | None:
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
        "pk": pk,
        "phase": phase,
        "duration": duration,
        "start": core_data_to_datetime(started_at),
        "completed": core_data_to_datetime(completed_at),
        "title": title,
    }


def cmd_session_preview(args: argparse.Namespace) -> int:
    """Show detailed preview of recent sessions."""
    sessions: list[dict]
    conn: sqlite3.Connection | None = None
    session_source = FlowStudySessionSource()

    if args.all_phases:
        try:
            conn = get_connection(readonly=True)
        except Exception as exc:
            print(f"Error: could not open database: {exc}")
            return 1
        sessions = get_recent_sessions(conn, limit=50)
    else:
        sessions = _load_recent_focus_sessions(
            session_source, limit=max(50, args.count)
        )

    if not sessions:
        print("No sessions found.")
        if conn is not None:
            conn.close()
        return 0

    sessions = sessions[: args.count]

    print("=" * 60)
    print(f"SESSION PREVIEW ({len(sessions)})")
    print("=" * 60)

    for idx, session in enumerate(sessions):
        if idx:
            print("\n" + "=" * 60 + "\n")

        title = session["title"] or "(no title)"
        print(title)
        print("-" * 60)
        print(format_session(session, include_pk=True))

        actual = calculate_actual_duration(session)
        if actual is not None:
            print(f"  Actual:   {actual:.1f} min")
            if session["duration"]:
                diff = actual - session["duration"]
                print(f"  Δ:        {diff:+.1f} min")

        if args.all_phases and conn is not None:
            interruptions = get_interruptions_for_session(conn, session["pk"])
            if interruptions:
                total = sum(i["duration"] or 0 for i in interruptions)
                print(f"  Interruptions: {len(interruptions)} ({total:.1f} min)")
        else:
            count = session.get("interruptions_count", 0) or 0
            duration = (session.get("interruptions_duration", 0) or 0) / 60
            if count:
                print(f"  Interruptions: {count} ({duration:.1f} min)")

    if conn is not None:
        conn.close()
    return 0


def cmd_rename_session(args: argparse.Namespace) -> int:
    """Rename most recent focus session."""
    session_source = FlowStudySessionSource()
    sessions = _load_recent_focus_sessions(session_source, limit=10)
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


def cmd_undo_last_session(args: argparse.Namespace) -> int:
    """Delete most recent focus session and adjacent break."""
    session_source = FlowStudySessionSource()
    sessions = _load_recent_focus_sessions(session_source, limit=10)
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


def _load_skip_config() -> dict:
    if not SKIP_CONFIG_PATH.exists():
        return {"enabled": False, "skip_times": []}
    with open(SKIP_CONFIG_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_skip_config(config: dict) -> None:
    SKIP_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SKIP_CONFIG_PATH, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)
        handle.write("\n")


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


def cmd_skip_now(_args: argparse.Namespace) -> int:
    """Skip active focus session and start break, honoring skip config."""
    config = _load_skip_config()
    if not config.get("enabled", False):
        logger.info("Skip no-op: automation disabled")
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


def cmd_skip_toggle(args: argparse.Namespace) -> int:
    """Toggle or set skip automation enabled state."""
    config = _load_skip_config()
    current = bool(config.get("enabled", False))

    if args.state is None:
        new_state = not current
    elif args.state == "on":
        new_state = True
    else:
        new_state = False

    config["enabled"] = new_state
    _save_skip_config(config)
    status = "ENABLED" if new_state else "DISABLED"
    print(f"Skip automation: {status}")
    if config.get("skip_times"):
        print("Skip times:", ", ".join(config.get("skip_times", [])))
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Construct CLI parser and subcommands."""
    parser = argparse.ArgumentParser(description="Journal TUI CLI utilities")
    add_logging_cli_args(parser)
    sub = parser.add_subparsers(dest="command", required=True)

    preview = sub.add_parser("session-preview", help="Preview recent sessions")
    preview.add_argument("-n", "--count", type=int, default=1)
    preview.add_argument("--all-phases", action="store_true")
    preview.set_defaults(func=cmd_session_preview)

    rename = sub.add_parser("rename-session", help="Rename most recent focus session")
    rename.add_argument("title")
    rename.add_argument("--confirm", action="store_true")
    rename.set_defaults(func=cmd_rename_session)

    undo = sub.add_parser("undo-last-session", help="Delete most recent focus session")
    undo.add_argument("--confirm", action="store_true")
    undo.set_defaults(func=cmd_undo_last_session)

    skip_now = sub.add_parser("skip-now", help="Execute scheduled skip now")
    skip_now.set_defaults(func=cmd_skip_now)

    skip_toggle = sub.add_parser("skip-toggle", help="Toggle skip automation")
    skip_toggle.add_argument("state", nargs="?", choices=["on", "off"])
    skip_toggle.set_defaults(func=cmd_skip_toggle)

    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    parser = build_parser()
    args = parser.parse_args(argv)

    _cap_log_file(FLOW_SKIP_LOG_PATH, _log_cap_bytes())
    level, log_format = resolve_logging_settings(args)
    configure_logging(level=level, log_format=log_format)

    try:
        return int(args.func(args))
    except Exception:
        logger.exception("CLI command failed: %s", args.command)
        return 1


if __name__ == "__main__":
    sys.exit(main())
