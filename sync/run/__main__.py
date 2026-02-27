"""Unified runtime CLI for journal sync and session utilities."""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sqlite3
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
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
from sync.constants import GRADES_PATH
from sync.config import PATHS
from sync.contracts.study import StudySessionRecord
from sync.dates import quarter_of_date
from sync.grades.engine import compute_grades
from sync.io import atomic_write_note, safe_read_file
from sync.log import (
    add_logging_cli_args,
    configure_logging,
    get_logger,
    resolve_logging_settings,
)
from sync.notes.locking import locked_note
from sync.ports.schedule import ScheduleSource
from sync.periods.runtime import resolve_note_path
from sync.periods.windows import (
    build_month_window,
    build_quarter_window,
    build_week_window,
    build_year_window,
)
from sync.readers.grades import load_grades
from sync.study.constants import DB_PATH
from sync.study.core_data_time import core_data_to_datetime, datetime_to_core_data
from sync.writers.grades import render_grades_note

SKIP_LAUNCHD_LABEL = "com.edo.skip"
SKIP_LAUNCHD_DOMAIN = f"gui/{os.geteuid()}"
SKIP_LAUNCHD_TARGET = f"{SKIP_LAUNCHD_DOMAIN}/{SKIP_LAUNCHD_LABEL}"
YOUTUBE_OEMBED_ENDPOINT = "https://www.youtube.com/oembed"
PODCAST_TEMPLATE_FILENAME = "podcast.md"

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
        schedule_source=MarkdownScheduleSource(),
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


def cmd_grades_sync(args: argparse.Namespace) -> int:
    path = args.path or GRADES_PATH
    try:
        document = load_grades(path)
    except FileNotFoundError as exc:
        print(f"Error: {exc}")
        return 1
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1

    computed = compute_grades(document, status_bonus=0)
    rendered = render_grades_note(document, computed)

    try:
        with locked_note(path):
            atomic_write_note(path, rendered)
    except TimeoutError as exc:
        print(f"Error: could not lock note for write: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to write grades note: {exc}")
        return 1

    print("Updated grades note:")
    print(f"  Path: {path}")
    if computed.final_grade is not None:
        print(f"  Final: {computed.final_grade}")
    return 0


def _parse_iso_day(value: str) -> datetime.date:
    try:
        return datetime.datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("Date must be in format YYYY-MM-DD") from exc


def _fetch_youtube_oembed_metadata(url: str) -> tuple[str | None, str | None]:
    query = urllib.parse.urlencode({"url": url, "format": "json"})
    endpoint = f"{YOUTUBE_OEMBED_ENDPOINT}?{query}"
    request = urllib.request.Request(endpoint)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.load(response)
    except (
        urllib.error.URLError,
        TimeoutError,
        OSError,
        ValueError,
        json.JSONDecodeError,
    ) as exc:
        logger.warning("Failed to fetch YouTube metadata: %s", exc)
        return None, None

    if not isinstance(payload, dict):
        logger.warning("Failed to fetch YouTube metadata: invalid payload type")
        return None, None

    title_value = payload.get("title")
    host_value = payload.get("author_name")
    title = title_value.strip() if isinstance(title_value, str) else None
    host = host_value.strip() if isinstance(host_value, str) else None
    return title or None, host or None


def _sanitize_podcast_title(raw_title: str) -> str:
    value = raw_title.strip()
    value = value.replace(":", " - ")
    value = value.replace("/", "-")
    value = value.replace("\\", "-")
    value = re.sub(r'[<>"|?*\x00-\x1f]', "", value)
    value = re.sub(r"\s+", " ", value)
    value = value.strip().rstrip(".").strip()
    if not value:
        raise ValueError("Could not derive a valid filename from title")
    return value


def _podcast_template_path() -> str:
    return os.path.join(
        PATHS.vault_dir, "notes", "templates", PODCAST_TEMPLATE_FILENAME
    )


def _apply_frontmatter_value(lines: list[str], key: str, value: str) -> list[str]:
    if not lines or lines[0].strip() != "---":
        frontmatter = ["---", f"{key}: {value}", "---"]
        if lines and lines[0].strip():
            frontmatter.append("")
        return frontmatter + lines

    closing_idx = -1
    for idx in range(1, len(lines)):
        if lines[idx].strip() == "---":
            closing_idx = idx
            break

    if closing_idx == -1:
        frontmatter = ["---", f"{key}: {value}", "---"]
        if lines and lines[0].strip():
            frontmatter.append("")
        return frontmatter + lines

    target_prefix = f"{key}:"
    frontmatter_lines = list(lines[1:closing_idx])
    for idx, line in enumerate(frontmatter_lines):
        if line.strip().startswith(target_prefix):
            frontmatter_lines[idx] = f"{key}: {value}"
            return lines[:1] + frontmatter_lines + lines[closing_idx:]

    frontmatter_lines.append(f"{key}: {value}")
    return lines[:1] + frontmatter_lines + lines[closing_idx:]


def _render_podcast_note_lines(
    template_lines: list[str],
    *,
    host: str,
    note_date: datetime.date,
    link: str,
) -> list[str]:
    rendered = list(template_lines)
    rendered = _apply_frontmatter_value(rendered, "host", host)
    rendered = _apply_frontmatter_value(rendered, "date", note_date.isoformat())
    rendered = _apply_frontmatter_value(rendered, "link", link)
    return rendered


def _update_media_cache_for_podcast(title: str, note_date: datetime.date) -> None:
    try:
        cache_store = JsonMediaDateCacheStore()
        cache = cache_store.load()
        books = dict(cache.get("books", {}))
        podcasts = dict(cache.get("podcasts", {}))
        podcasts[title] = note_date.isoformat()
        cache_store.save({"books": books, "podcasts": podcasts})
    except Exception as exc:
        logger.warning("Failed to update media cache for %s: %s", title, exc)


def cmd_media_podcast_add(args: argparse.Namespace) -> int:
    note_date = datetime.date.today()
    if args.date:
        try:
            note_date = _parse_iso_day(args.date)
        except ValueError as exc:
            print(f"Error: {exc}")
            return 1

    fetched_title, fetched_host = _fetch_youtube_oembed_metadata(args.url)
    raw_title = (args.title or fetched_title or "").strip()
    raw_host = (args.host or fetched_host or "").strip()

    if not raw_title:
        print("Error: could not resolve title from URL. Provide --title.")
        return 1
    if not raw_host:
        print("Error: could not resolve host from URL. Provide --host.")
        return 1

    try:
        title = _sanitize_podcast_title(raw_title)
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1

    template_path = _podcast_template_path()
    template_lines = safe_read_file(template_path)
    if template_lines is None:
        print(f"Error: required podcast template not found: {template_path}")
        return 1

    note_lines = _render_podcast_note_lines(
        template_lines,
        host=raw_host,
        note_date=note_date,
        link=args.url,
    )

    os.makedirs(PATHS.podcasts_dir, exist_ok=True)
    note_path = os.path.join(PATHS.podcasts_dir, f"{title}.md")

    try:
        with locked_note(note_path):
            if os.path.exists(note_path):
                print(f"Error: podcast note already exists: {note_path}")
                return 1
            atomic_write_note(note_path, note_lines)
    except TimeoutError as exc:
        print(f"Error: could not lock note for write: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to write podcast note: {exc}")
        return 1

    _update_media_cache_for_podcast(title, note_date)
    print("Created podcast note:")
    print(f"  Path: {note_path}")
    print(f"  Title: {title}")
    print(f"  Host: {raw_host}")
    print(f"  Date: {note_date.isoformat()}")
    return 0


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

    grades = domain.add_parser("grades", help="Run grades note operations")
    grades_sub = grades.add_subparsers(dest="grades_command", required=True)

    grades_sync = grades_sub.add_parser(
        "sync", help="Recompute OVERALL summary values in GRADES.md"
    )
    grades_sync.add_argument(
        "--path",
        help="Override grades note path",
    )
    grades_sync.set_defaults(func=cmd_grades_sync)

    media = domain.add_parser("media", help="Run media note operations")
    media_sub = media.add_subparsers(dest="media_command", required=True)

    media_podcast = media_sub.add_parser("podcast", help="Run podcast note operations")
    media_podcast_sub = media_podcast.add_subparsers(
        dest="podcast_command", required=True
    )

    media_podcast_add = media_podcast_sub.add_parser(
        "add", help="Create podcast note from a YouTube URL"
    )
    media_podcast_add.add_argument("url")
    media_podcast_add.add_argument("--date", help="Override date (YYYY-MM-DD)")
    media_podcast_add.add_argument(
        "--title",
        help="Override fetched title when metadata lookup fails",
    )
    media_podcast_add.add_argument(
        "--host",
        help="Override fetched host when metadata lookup fails",
    )
    media_podcast_add.set_defaults(func=cmd_media_podcast_add)

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
