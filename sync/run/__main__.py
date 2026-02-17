"""Unified runtime CLI for journal sync and session utilities."""

from __future__ import annotations

import argparse
import datetime
import os
import re
import sqlite3
import subprocess
import sys
from datetime import date, timedelta
from typing import TypedDict

from sync.adapters import (
    FlowStudySessionSource,
    ICloudDailyStatusSource,
    JsonDailyScreenTimeCacheStore,
    JsonDailyTrainingCacheStore,
    JsonGoalCarryForwardCacheStore,
    JsonGoalReconcileCacheStore,
    JsonMediaDateCacheStore,
    MarkdownDailyAggregateSource,
    MarkdownGoalStore,
    MarkdownNoteStore,
    MarkdownReminderRuleStore,
    MarkdownScheduleSource,
    ObsidianMediaSource,
    VaultContextSource,
    bootstrap_cache_layout,
)
from sync.application.daily_sync_service import DailySyncService
from sync.application.goal_sync_service import GoalSyncService
from sync.application.period_sync_service import PeriodSyncService
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord
from sync.dates import quarter_of_date
from sync.log import (
    add_logging_cli_args,
    configure_logging,
    get_logger,
    resolve_logging_settings,
)
from sync.ports.schedule import ScheduleSource
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import (
    build_month_window,
    build_quarter_window,
    build_week_window,
    build_year_window,
)
from sync.study.constants import CORE_DATA_EPOCH_OFFSET, DB_PATH

SKIP_LAUNCHD_LABEL = "com.edo.skip"
SKIP_LAUNCHD_DOMAIN = f"gui/{os.geteuid()}"
SKIP_LAUNCHD_TARGET = f"{SKIP_LAUNCHD_DOMAIN}/{SKIP_LAUNCHD_LABEL}"

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


def _build_goal_sync_service(note_store: MarkdownNoteStore) -> GoalSyncService:
    goal_store = MarkdownGoalStore()
    carry_cache_store = JsonGoalCarryForwardCacheStore()
    reconcile_cache_store = JsonGoalReconcileCacheStore()
    return GoalSyncService(
        note_store=note_store,
        goal_store=goal_store,
        carry_cache_store=carry_cache_store,
        reconcile_cache_store=reconcile_cache_store,
    )


def _build_period_sync_service() -> PeriodSyncService:
    note_store = MarkdownNoteStore()
    media_cache_store = JsonMediaDateCacheStore()
    return PeriodSyncService(
        note_store=note_store,
        aggregate_source=MarkdownDailyAggregateSource(),
        media_source=ObsidianMediaSource(media_cache_store=media_cache_store),
        goal_sync_service=_build_goal_sync_service(note_store),
    )


def _run_daily_sync() -> None:
    bootstrap_cache_layout()
    day = datetime.date.today()
    schedule_source = MarkdownScheduleSource()
    session_source = FlowStudySessionSource()
    note_store = MarkdownNoteStore()
    training_cache_store = JsonDailyTrainingCacheStore()
    screen_time_cache_store = JsonDailyScreenTimeCacheStore()
    status_source = ICloudDailyStatusSource(
        screen_time_cache_store=screen_time_cache_store
    )
    service = DailySyncService(
        note_store=note_store,
        status_source=status_source,
        context_source=VaultContextSource(),
        reminder_store=MarkdownReminderRuleStore(),
        goal_sync_service=_build_goal_sync_service(note_store),
        training_cache_store=training_cache_store,
    )

    target_days = status_source.target_days(day)
    run_days = sorted(d for d in target_days if d != day)
    run_days.append(day)

    for run_day in run_days:
        day_schedule = schedule_source.resolve_day(run_day)
        sessions = session_source.load_sessions(run_day, day_schedule)
        changed = service.sync_day(run_day, sessions, day_schedule)
        if changed is False:
            continue


def _run_weekly_sync(*, date_arg: str | None, no_cleanup: bool) -> None:
    bootstrap_cache_layout()

    if date_arg:
        target_date = datetime.datetime.strptime(date_arg, "%Y-%m-%d").date()
    else:
        target_date = datetime.date.today()

    window = build_week_window(target_date)
    note_path = resolve_note_path(window.filename)

    service = _build_period_sync_service()
    cleanup_runner = None
    if not no_cleanup:
        previous_date = window.previous_start.isoformat()

        def cleanup_runner() -> None:
            _run_weekly_sync(date_arg=previous_date, no_cleanup=True)

    service.sync_week(
        window,
        note_path,
        cleanup_previous=not no_cleanup,
        cleanup_previous_runner=cleanup_runner,
    )


def _run_monthly_sync(*, month_arg: str | None, no_cleanup: bool) -> None:
    bootstrap_cache_layout()

    if month_arg:
        year, month = map(int, month_arg.split("-"))
        target_date = datetime.date(year, month, 1)
    else:
        today = datetime.date.today()
        target_date = datetime.date(today.year, today.month, 1)

    window = build_month_window(target_date)
    note_path = resolve_note_path(window.filename)

    service = _build_period_sync_service()
    cleanup_runner = None
    if not no_cleanup:
        previous_month = f"{window.previous_year}-{window.previous_month:02d}"

        def cleanup_runner() -> None:
            _run_monthly_sync(month_arg=previous_month, no_cleanup=True)

    service.sync_month(
        window,
        note_path,
        cleanup_previous=not no_cleanup,
        cleanup_previous_runner=cleanup_runner,
    )


def _run_quarterly_sync(*, quarter_arg: str | None) -> None:
    bootstrap_cache_layout()

    if quarter_arg:
        parts = quarter_arg.upper().split("-Q")
        if len(parts) != 2:
            raise ValueError("Quarter must be in format YYYY-Qn")
        year = int(parts[0])
        quarter_num = int(parts[1])
    else:
        today = datetime.date.today()
        year, quarter_num = quarter_of_date(today)

    window = build_quarter_window(year, quarter_num)
    note_path = resolve_note_path(window.filename)

    _build_period_sync_service().sync_quarter(window, note_path)


def _run_yearly_sync(*, year_arg: str | None) -> None:
    bootstrap_cache_layout()

    if year_arg:
        year = int(year_arg)
    else:
        year = datetime.date.today().year

    window = build_year_window(year)
    note_path = resolve_note_path(window.filename)

    _build_period_sync_service().sync_year(window, note_path)


def cmd_period_all(_args: argparse.Namespace) -> int:
    _run_daily_sync()
    _run_weekly_sync(date_arg=None, no_cleanup=False)
    _run_monthly_sync(month_arg=None, no_cleanup=False)
    _run_quarterly_sync(quarter_arg=None)
    _run_yearly_sync(year_arg=None)
    return 0


def cmd_period_daily(_args: argparse.Namespace) -> int:
    _run_daily_sync()
    return 0


def cmd_period_weekly(args: argparse.Namespace) -> int:
    _run_weekly_sync(date_arg=args.date, no_cleanup=args.no_cleanup)
    return 0


def cmd_period_monthly(args: argparse.Namespace) -> int:
    _run_monthly_sync(month_arg=args.month, no_cleanup=args.no_cleanup)
    return 0


def cmd_period_quarterly(args: argparse.Namespace) -> int:
    _run_quarterly_sync(quarter_arg=args.quarter)
    return 0


def cmd_period_yearly(args: argparse.Namespace) -> int:
    _run_yearly_sync(year_arg=args.year)
    return 0


def core_data_to_datetime(timestamp: float | None) -> datetime.datetime | None:
    if timestamp is None:
        return None
    return datetime.datetime.fromtimestamp(timestamp + CORE_DATA_EPOCH_OFFSET)


def datetime_to_core_data(value: datetime.datetime | None) -> float | None:
    if value is None:
        return None
    return value.timestamp() - CORE_DATA_EPOCH_OFFSET


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


def _now() -> datetime.datetime:
    return datetime.datetime.now()


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


def _find_associated_break_session(
    conn: sqlite3.Connection,
    focus_session: CliSession,
) -> CliSession | None:
    focus_start = focus_session.get("start")
    if not isinstance(focus_start, datetime.datetime):
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


def _is_within_study_window(
    now: datetime.datetime,
    day_schedule: DayScheduleProfile,
) -> bool:
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
    parser = argparse.ArgumentParser()
    add_logging_cli_args(parser)
    domain = parser.add_subparsers(dest="domain", required=True)

    period = domain.add_parser("period", help="Run daily/period journal sync")
    period_sub = period.add_subparsers(dest="period_command", required=True)

    period_all = period_sub.add_parser(
        "all", help="Run daily + all period sync commands"
    )
    period_all.set_defaults(func=cmd_period_all)

    period_daily = period_sub.add_parser("daily", help="Run daily sync")
    period_daily.set_defaults(func=cmd_period_daily)

    period_weekly = period_sub.add_parser("weekly", help="Run weekly sync")
    period_weekly.add_argument("--date", help="Date within week (YYYY-MM-DD)")
    period_weekly.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Skip cleanup of previous period",
    )
    period_weekly.set_defaults(func=cmd_period_weekly)

    period_monthly = period_sub.add_parser("monthly", help="Run monthly sync")
    period_monthly.add_argument("--month", help="Month (YYYY-MM)")
    period_monthly.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Skip cleanup of previous period",
    )
    period_monthly.set_defaults(func=cmd_period_monthly)

    period_quarterly = period_sub.add_parser("quarterly", help="Run quarterly sync")
    period_quarterly.add_argument("--quarter", help="Quarter (YYYY-Qn)")
    period_quarterly.set_defaults(func=cmd_period_quarterly)

    period_yearly = period_sub.add_parser("yearly", help="Run yearly sync")
    period_yearly.add_argument("--year", help="Year (YYYY)")
    period_yearly.set_defaults(func=cmd_period_yearly)

    session = domain.add_parser("session", help="Run Flow session operations")
    session_sub = session.add_subparsers(dest="session_command", required=True)

    session_rename = session_sub.add_parser(
        "rename", help="Rename most recent focus session"
    )
    session_rename.add_argument("title")
    session_rename.add_argument("--confirm", action="store_true")
    session_rename.set_defaults(func=cmd_session_rename)

    session_undo = session_sub.add_parser(
        "undo", help="Delete most recent focus session"
    )
    session_undo.add_argument("--confirm", action="store_true")
    session_undo.set_defaults(func=cmd_session_undo)

    session_skip = session_sub.add_parser(
        "skip", help="Execute or manage skip automation"
    )
    session_skip.add_argument(
        "--state",
        choices=["toggle", "status"],
        help="Manage launchd skip automation state",
    )
    session_skip.set_defaults(func=cmd_session_skip)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    level, log_format = resolve_logging_settings(args)
    configure_logging(level=level, log_format=log_format)

    try:
        return int(args.func(args))
    except Exception:
        logger.exception("sync.run command failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
