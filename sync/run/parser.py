"""CLI parser construction for sync.run."""

from __future__ import annotations

import argparse
from collections.abc import Callable, Mapping

from sync.log import add_logging_cli_args
from sync.run.commands.grades import cmd_grades_sync
from sync.run.commands.media import cmd_media_podcast_add
from sync.run.commands.period import (
    cmd_period_all,
    cmd_period_daily,
    cmd_period_monthly,
    cmd_period_quarterly,
    cmd_period_weekly,
    cmd_period_yearly,
)
from sync.run.commands.reminders import cmd_session_remind, cmd_session_skip
from sync.run.commands.session import cmd_session_rename, cmd_session_undo

CommandHandler = Callable[[argparse.Namespace], int]


_DEFAULT_HANDLERS: dict[str, CommandHandler] = {
    "period_all": cmd_period_all,
    "period_daily": cmd_period_daily,
    "period_weekly": cmd_period_weekly,
    "period_monthly": cmd_period_monthly,
    "period_quarterly": cmd_period_quarterly,
    "period_yearly": cmd_period_yearly,
    "session_rename": cmd_session_rename,
    "session_undo": cmd_session_undo,
    "session_skip": cmd_session_skip,
    "session_remind": cmd_session_remind,
    "grades_sync": cmd_grades_sync,
    "media_podcast_add": cmd_media_podcast_add,
}


def _resolve_handler(
    handlers: Mapping[str, CommandHandler] | None,
    key: str,
) -> CommandHandler:
    if handlers is not None and key in handlers:
        return handlers[key]
    return _DEFAULT_HANDLERS[key]


def build_parser(
    handlers: Mapping[str, CommandHandler] | None = None,
) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    add_logging_cli_args(parser)
    domain = parser.add_subparsers(dest="domain", required=True)

    period = domain.add_parser("period", help="Run daily/period journal sync")
    period_sub = period.add_subparsers(dest="period_command", required=True)

    period_all = period_sub.add_parser(
        "all", help="Run daily + all period sync commands"
    )
    period_all.set_defaults(func=_resolve_handler(handlers, "period_all"))

    period_daily = period_sub.add_parser("daily", help="Run daily sync")
    period_daily.set_defaults(func=_resolve_handler(handlers, "period_daily"))

    period_weekly = period_sub.add_parser("weekly", help="Run weekly sync")
    period_weekly.add_argument("--date", help="Date within week (YYYY-MM-DD)")
    period_weekly.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Skip cleanup of previous period",
    )
    period_weekly.set_defaults(func=_resolve_handler(handlers, "period_weekly"))

    period_monthly = period_sub.add_parser("monthly", help="Run monthly sync")
    period_monthly.add_argument("--month", help="Month (YYYY-MM)")
    period_monthly.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Skip cleanup of previous period",
    )
    period_monthly.set_defaults(func=_resolve_handler(handlers, "period_monthly"))

    period_quarterly = period_sub.add_parser("quarterly", help="Run quarterly sync")
    period_quarterly.add_argument("--quarter", help="Quarter (YYYY-Qn)")
    period_quarterly.set_defaults(func=_resolve_handler(handlers, "period_quarterly"))

    period_yearly = period_sub.add_parser("yearly", help="Run yearly sync")
    period_yearly.add_argument("--year", help="Year (YYYY)")
    period_yearly.set_defaults(func=_resolve_handler(handlers, "period_yearly"))

    session = domain.add_parser("session", help="Run Flow session operations")
    session_sub = session.add_subparsers(dest="session_command", required=True)

    session_rename = session_sub.add_parser(
        "rename", help="Rename most recent focus session"
    )
    session_rename.add_argument("title")
    session_rename.add_argument("--confirm", action="store_true")
    session_rename.set_defaults(func=_resolve_handler(handlers, "session_rename"))

    session_undo = session_sub.add_parser(
        "undo", help="Delete most recent focus session"
    )
    session_undo.add_argument("--confirm", action="store_true")
    session_undo.set_defaults(func=_resolve_handler(handlers, "session_undo"))

    session_skip = session_sub.add_parser(
        "skip", help="Execute or manage skip automation"
    )
    session_skip.add_argument(
        "--state",
        choices=["toggle", "status"],
        help="Manage launchd skip automation state",
    )
    session_skip.set_defaults(func=_resolve_handler(handlers, "session_skip"))

    session_remind = session_sub.add_parser(
        "remind", help="Execute or manage resume reminder automation"
    )
    session_remind.add_argument(
        "--state",
        choices=["toggle", "status"],
        help="Manage launchd remind automation state",
    )
    session_remind.set_defaults(func=_resolve_handler(handlers, "session_remind"))

    grades = domain.add_parser("grades", help="Run grades note operations")
    grades_sub = grades.add_subparsers(dest="grades_command", required=True)

    grades_sync = grades_sub.add_parser(
        "sync", help="Recompute OVERALL summary values in GRADES.md"
    )
    grades_sync.add_argument(
        "--path",
        help="Override grades note path",
    )
    grades_sync.set_defaults(func=_resolve_handler(handlers, "grades_sync"))

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
    media_podcast_add.set_defaults(func=_resolve_handler(handlers, "media_podcast_add"))

    return parser
