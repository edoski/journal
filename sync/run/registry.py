"""Runtime command registry for sync.run."""

from __future__ import annotations

import argparse
from collections.abc import Callable

from sync.run import wiring
from sync.run.commands import grades as grades_cmd
from sync.run.commands import goals as goals_cmd
from sync.run.commands import media_books as media_books_cmd
from sync.run.commands import media_podcast as media_podcast_cmd
from sync.run.commands import reminders as reminders_cmd
from sync.run.commands import session as session_cmd
from sync.run.runtime_deps import RuntimeDeps

CommandHandler = Callable[[argparse.Namespace], int]


def build_command_handlers(deps: RuntimeDeps) -> dict[str, CommandHandler]:
    """Bind parser command keys to injected runtime implementations."""
    return {
        "period_all": lambda _args: _run_period_all(deps),
        "period_daily": lambda _args: _run_period_daily(deps),
        "period_weekly": lambda args: _run_period_weekly(args, deps),
        "period_monthly": lambda args: _run_period_monthly(args, deps),
        "period_yearly": lambda args: _run_period_yearly(args, deps),
        "session_rename": lambda args: session_cmd.cmd_session_rename(
            args,
            deps=deps.session,
        ),
        "session_undo": lambda args: session_cmd.cmd_session_undo(
            args,
            deps=deps.session,
        ),
        "session_skip": lambda args: reminders_cmd.cmd_session_skip(
            args,
            deps=deps.reminders,
        ),
        "session_remind": lambda args: reminders_cmd.cmd_session_remind(
            args,
            deps=deps.reminders,
        ),
        "grades_sync": lambda args: grades_cmd.cmd_grades_sync(
            args,
            config=deps.grades,
        ),
        "goals_add": lambda args: goals_cmd.cmd_goals_add(args, config=deps.goals),
        "media_podcast_add": lambda args: media_podcast_cmd.cmd_media_podcast_add(
            args,
            deps=deps.media,
        ),
        "media_book_annotations_import": lambda args: (
            media_books_cmd.cmd_media_book_annotations_import(args, deps=deps.media)
        ),
    }


def _run_period_all(deps: RuntimeDeps) -> int:
    wiring.run_daily_sync(deps=deps.wiring)
    wiring.run_weekly_sync(date_arg=None, no_cleanup=False, deps=deps.wiring)
    wiring.run_monthly_sync(month_arg=None, no_cleanup=False, deps=deps.wiring)
    wiring.run_yearly_sync(year_arg=None, deps=deps.wiring)
    return 0


def _run_period_daily(deps: RuntimeDeps) -> int:
    wiring.run_daily_sync(deps=deps.wiring)
    return 0


def _run_period_weekly(args: argparse.Namespace, deps: RuntimeDeps) -> int:
    wiring.run_weekly_sync(
        date_arg=args.date,
        no_cleanup=args.no_cleanup,
        deps=deps.wiring,
    )
    return 0


def _run_period_monthly(args: argparse.Namespace, deps: RuntimeDeps) -> int:
    wiring.run_monthly_sync(
        month_arg=args.month,
        no_cleanup=args.no_cleanup,
        deps=deps.wiring,
    )
    return 0


def _run_period_yearly(args: argparse.Namespace, deps: RuntimeDeps) -> int:
    wiring.run_yearly_sync(year_arg=args.year, deps=deps.wiring)
    return 0
