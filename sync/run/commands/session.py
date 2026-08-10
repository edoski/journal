"""Flow session mutation command handlers."""

from __future__ import annotations

import argparse
import datetime
from dataclasses import dataclass
from datetime import date, timedelta
from collections.abc import Callable
from typing import TypedDict

from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.markdown_schedule import MarkdownScheduleSource
from sync.contracts.study import StudySessionRecord
from sync.log import get_logger
from sync.ports.schedule import ScheduleSource
from sync.ports.sessions import StudySessionSource
from sync.study.repository import FlowSessionRepository

logger = get_logger(__name__)


class CliSession(TypedDict):
    pk: int
    pks: list[int]
    phase: str
    duration: float
    start: datetime.datetime | None
    completed: datetime.datetime | None
    title: str
    interruptions_count: int
    interruptions_duration: float


@dataclass(frozen=True)
class SessionCommandDeps:
    """Factory dependencies for Flow session mutation commands."""

    session_source_factory: Callable[[], StudySessionSource]
    schedule_source_factory: Callable[[], ScheduleSource]
    repository: FlowSessionRepository


def default_session_command_deps() -> SessionCommandDeps:
    """Return the default runtime dependencies for session commands."""
    repository = FlowSessionRepository()
    return SessionCommandDeps(
        session_source_factory=lambda: FlowStudySessionSource(repository=repository),
        schedule_source_factory=MarkdownScheduleSource,
        repository=repository,
    )


def format_session(session: CliSession, include_pk: bool = False) -> str:
    lines: list[str] = []
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


def _record_to_cli_session(record: StudySessionRecord) -> CliSession:
    planned = record.get("planned_duration") or record.get("duration") or 0.0
    pk = int(record.get("pk", 0) or 0)
    pks = list(record.get("pks", []))
    if not pks and pk:
        pks = [pk]
    return {
        "pk": pk,
        "pks": pks,
        "phase": record.get("phase") or "flow",
        "duration": float(planned),
        "start": record.get("start"),
        "completed": record.get("completed_at"),
        "title": record.get("title") or "",
        "interruptions_count": int(record.get("interruptions_count", 0) or 0),
        "interruptions_duration": float(record.get("interruptions_duration", 0) or 0),
    }


def _load_recent_focus_sessions(
    source: StudySessionSource,
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


def cmd_session_rename(
    args: argparse.Namespace,
    *,
    deps: SessionCommandDeps | None = None,
) -> int:
    resolved = deps or default_session_command_deps()
    session_source = resolved.session_source_factory()
    schedule_source = resolved.schedule_source_factory()
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
        if args.confirm:
            resolved.repository.rename_sessions(focus["pks"], args.title)
        else:
            resolved.repository.ensure_available(readonly=True)
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
        return 0
    print(f'\nUpdated session title to "{args.title}"')
    return 0


def cmd_session_undo(
    args: argparse.Namespace,
    *,
    deps: SessionCommandDeps | None = None,
) -> int:
    resolved = deps or default_session_command_deps()
    session_source = resolved.session_source_factory()
    schedule_source = resolved.schedule_source_factory()
    sessions = _load_recent_focus_sessions(
        session_source,
        schedule_source,
        limit=10,
    )
    focus = _find_most_recent_focus(sessions)
    if not focus:
        print("No focus session found to delete.")
        return 0

    focus_end = _session_end_for_break_lookup(focus)
    try:
        if args.confirm:
            undo_result = resolved.repository.undo_session(focus["pks"], focus_end)
            break_records = undo_result.breaks
            total_interruptions = undo_result.deleted_interruptions
        elif focus_end is None:
            resolved.repository.ensure_available(readonly=True)
            break_records = ()
            total_interruptions = 0
        else:
            break_records = resolved.repository.find_associated_break_sessions(
                focus_end
            )
            total_interruptions = 0
    except Exception as exc:
        print(f"Error: could not open database: {exc}")
        return 1
    breaks = [_record_to_cli_session(record) for record in break_records]

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
        return 0
    print(f"Deleted session(s). Interruptions deleted: {total_interruptions}")
    return 0
