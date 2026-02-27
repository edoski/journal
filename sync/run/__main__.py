"""Unified runtime CLI for journal sync and session utilities."""

from __future__ import annotations

import argparse
import datetime
import sqlite3
import sys

from sync.adapters.cache_bootstrap import bootstrap_cache_layout
from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.adapters.json_daily_cache import (
    JsonDailyScreenTimeCacheStore,
    JsonDailyTrainingCacheStore,
)
from sync.adapters.json_goal_cache import (
    JsonGoalCarryForwardCacheStore,
    JsonGoalReconcileCacheStore,
)
from sync.adapters.json_media_cache import JsonMediaDateCacheStore
from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource
from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.adapters.markdown_reminders import MarkdownReminderRuleStore
from sync.adapters.markdown_schedule import MarkdownScheduleSource
from sync.adapters.obsidian_media import ObsidianMediaSource
from sync.adapters.vault_context import VaultContextSource
from sync.application.daily_sync_service import DailySyncService
from sync.application.goal_sync_service import GoalSyncService
from sync.application.period_sync_service import PeriodSyncService
from sync.config import PATHS
from sync.constants import GRADES_PATH
from sync.log import configure_logging, get_logger, resolve_logging_settings
from sync.run import parser as parser_mod
from sync.run import wiring
from sync.run.commands import grades as grades_cmd
from sync.run.commands import media as media_cmd
from sync.run.commands import reminders as reminders_cmd
from sync.run.commands import session as session_cmd

SKIP_LAUNCHD_LABEL = reminders_cmd.SKIP_LAUNCHD_LABEL
SKIP_LAUNCHD_DOMAIN = reminders_cmd.SKIP_LAUNCHD_DOMAIN
SKIP_LAUNCHD_TARGET = reminders_cmd.SKIP_LAUNCHD_TARGET
REMIND_LAUNCHD_LABEL = reminders_cmd.REMIND_LAUNCHD_LABEL
REMIND_LAUNCHD_DOMAIN = reminders_cmd.REMIND_LAUNCHD_DOMAIN
REMIND_LAUNCHD_TARGET = reminders_cmd.REMIND_LAUNCHD_TARGET
FLOW_REMINDER_STATE_FILENAME = reminders_cmd.FLOW_REMINDER_STATE_FILENAME

logger = get_logger(__name__)

_REMINDERS_RUN_LAUNCHCTL_IMPL = reminders_cmd._run_launchctl
_REMINDERS_SKIP_ENABLED_IMPL = reminders_cmd._skip_enabled_state
_REMINDERS_SET_SKIP_ENABLED_IMPL = reminders_cmd._set_skip_enabled
_REMINDERS_PRINT_SKIP_STATUS_IMPL = reminders_cmd._print_skip_status
_REMINDERS_APPLY_SKIP_STATE_IMPL = reminders_cmd._apply_skip_state
_REMINDERS_FLOW_STATE_PATH_IMPL = reminders_cmd._flow_reminder_state_path
_REMINDERS_LOAD_STATE_IMPL = reminders_cmd._load_flow_reminder_state
_REMINDERS_SAVE_STATE_IMPL = reminders_cmd._save_flow_reminder_state
_REMINDERS_CLEAR_STATE_IMPL = reminders_cmd._clear_flow_reminder_state
_REMINDERS_REMIND_ENABLED_IMPL = reminders_cmd._remind_enabled_state
_REMINDERS_SET_REMIND_ENABLED_IMPL = reminders_cmd._set_remind_enabled
_REMINDERS_PRINT_REMIND_STATUS_IMPL = reminders_cmd._print_remind_status
_REMINDERS_APPLY_REMIND_STATE_IMPL = reminders_cmd._apply_remind_state
_REMINDERS_RUN_APPLESCRIPT_IMPL = reminders_cmd._run_applescript
_REMINDERS_LATEST_ROW_OPEN_FLOW_IMPL = reminders_cmd._latest_row_is_open_flow
_REMINDERS_LATEST_OPEN_FLOW_STARTED_IMPL = reminders_cmd._latest_open_flow_started_at
_REMINDERS_NOW_IMPL = reminders_cmd._now


def _set_module_attr(module: object, name: str, value: object) -> None:
    setattr(module, name, value)


def _sync_wiring_patch_points() -> None:
    _set_module_attr(wiring, "bootstrap_cache_layout", bootstrap_cache_layout)
    _set_module_attr(wiring, "FlowStudySessionSource", FlowStudySessionSource)
    _set_module_attr(wiring, "ICloudDailyStatusSource", ICloudDailyStatusSource)
    _set_module_attr(
        wiring, "JsonDailyScreenTimeCacheStore", JsonDailyScreenTimeCacheStore
    )
    _set_module_attr(wiring, "JsonDailyTrainingCacheStore", JsonDailyTrainingCacheStore)
    _set_module_attr(
        wiring, "JsonGoalCarryForwardCacheStore", JsonGoalCarryForwardCacheStore
    )
    _set_module_attr(wiring, "JsonGoalReconcileCacheStore", JsonGoalReconcileCacheStore)
    _set_module_attr(wiring, "JsonMediaDateCacheStore", JsonMediaDateCacheStore)
    _set_module_attr(
        wiring, "MarkdownDailyAggregateSource", MarkdownDailyAggregateSource
    )
    _set_module_attr(wiring, "MarkdownGoalStore", MarkdownGoalStore)
    _set_module_attr(wiring, "MarkdownNoteStore", MarkdownNoteStore)
    _set_module_attr(wiring, "MarkdownReminderRuleStore", MarkdownReminderRuleStore)
    _set_module_attr(wiring, "MarkdownScheduleSource", MarkdownScheduleSource)
    _set_module_attr(wiring, "ObsidianMediaSource", ObsidianMediaSource)
    _set_module_attr(wiring, "VaultContextSource", VaultContextSource)
    _set_module_attr(wiring, "DailySyncService", DailySyncService)
    _set_module_attr(wiring, "GoalSyncService", GoalSyncService)
    _set_module_attr(wiring, "PeriodSyncService", PeriodSyncService)


def _sync_session_patch_points() -> None:
    _set_module_attr(session_cmd, "FlowStudySessionSource", FlowStudySessionSource)
    _set_module_attr(session_cmd, "MarkdownScheduleSource", MarkdownScheduleSource)


def _sync_reminders_patch_points() -> None:
    _set_module_attr(reminders_cmd, "PATHS", PATHS)
    _set_module_attr(
        reminders_cmd, "FLOW_REMINDER_STATE_FILENAME", FLOW_REMINDER_STATE_FILENAME
    )
    _set_module_attr(reminders_cmd, "SKIP_LAUNCHD_LABEL", SKIP_LAUNCHD_LABEL)
    _set_module_attr(reminders_cmd, "SKIP_LAUNCHD_DOMAIN", SKIP_LAUNCHD_DOMAIN)
    _set_module_attr(reminders_cmd, "SKIP_LAUNCHD_TARGET", SKIP_LAUNCHD_TARGET)
    _set_module_attr(reminders_cmd, "REMIND_LAUNCHD_LABEL", REMIND_LAUNCHD_LABEL)
    _set_module_attr(reminders_cmd, "REMIND_LAUNCHD_DOMAIN", REMIND_LAUNCHD_DOMAIN)
    _set_module_attr(reminders_cmd, "REMIND_LAUNCHD_TARGET", REMIND_LAUNCHD_TARGET)
    _set_module_attr(reminders_cmd, "get_connection", get_connection)
    _set_module_attr(reminders_cmd, "_run_launchctl", _run_launchctl)
    _set_module_attr(reminders_cmd, "_skip_enabled_state", _skip_enabled_state)
    _set_module_attr(reminders_cmd, "_remind_enabled_state", _remind_enabled_state)
    _set_module_attr(reminders_cmd, "_run_applescript", _run_applescript)
    _set_module_attr(reminders_cmd, "_now", _now)


def _sync_media_patch_points() -> None:
    _set_module_attr(media_cmd, "PATHS", PATHS)
    _set_module_attr(media_cmd, "JsonMediaDateCacheStore", JsonMediaDateCacheStore)


def _sync_grades_patch_points() -> None:
    _set_module_attr(grades_cmd, "GRADES_PATH", GRADES_PATH)


def _build_goal_sync_service(note_store: MarkdownNoteStore) -> GoalSyncService:
    _sync_wiring_patch_points()
    return wiring._build_goal_sync_service(note_store)


def _build_period_sync_service() -> PeriodSyncService:
    _sync_wiring_patch_points()
    return wiring._build_period_sync_service()


def _run_daily_sync() -> None:
    _sync_wiring_patch_points()
    wiring.run_daily_sync()


def _run_weekly_sync(*, date_arg: str | None, no_cleanup: bool) -> None:
    _sync_wiring_patch_points()
    wiring.run_weekly_sync(date_arg=date_arg, no_cleanup=no_cleanup)


def _run_monthly_sync(*, month_arg: str | None, no_cleanup: bool) -> None:
    _sync_wiring_patch_points()
    wiring.run_monthly_sync(month_arg=month_arg, no_cleanup=no_cleanup)


def _run_quarterly_sync(*, quarter_arg: str | None) -> None:
    _sync_wiring_patch_points()
    wiring.run_quarterly_sync(quarter_arg=quarter_arg)


def _run_yearly_sync(*, year_arg: str | None) -> None:
    _sync_wiring_patch_points()
    wiring.run_yearly_sync(year_arg=year_arg)


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
    _sync_grades_patch_points()
    return grades_cmd.cmd_grades_sync(args)


def get_connection(readonly: bool = True) -> sqlite3.Connection:
    _sync_session_patch_points()
    return session_cmd.get_connection(readonly=readonly)


def format_session(
    session: session_cmd.CliSession,
    include_pk: bool = False,
) -> str:
    return session_cmd.format_session(session, include_pk=include_pk)


def cmd_session_rename(args: argparse.Namespace) -> int:
    _sync_session_patch_points()
    return session_cmd.cmd_session_rename(args)


def cmd_session_undo(args: argparse.Namespace) -> int:
    _sync_session_patch_points()
    return session_cmd.cmd_session_undo(args)


def _run_launchctl(args: list[str]) -> tuple[int, str, str]:
    return _REMINDERS_RUN_LAUNCHCTL_IMPL(args)


def _skip_enabled_state() -> bool | None:
    return _REMINDERS_SKIP_ENABLED_IMPL()


def _set_skip_enabled(enabled: bool) -> bool:
    return _REMINDERS_SET_SKIP_ENABLED_IMPL(enabled)


def _print_skip_status(enabled: bool) -> None:
    _REMINDERS_PRINT_SKIP_STATUS_IMPL(enabled)


def _apply_skip_state(state: str) -> int:
    return _REMINDERS_APPLY_SKIP_STATE_IMPL(state)


def _flow_reminder_state_path() -> str:
    _sync_reminders_patch_points()
    return _REMINDERS_FLOW_STATE_PATH_IMPL()


def _load_flow_reminder_state() -> reminders_cmd.FlowReminderState:
    _sync_reminders_patch_points()
    return _REMINDERS_LOAD_STATE_IMPL()


def _save_flow_reminder_state(state: reminders_cmd.FlowReminderState) -> None:
    _sync_reminders_patch_points()
    _REMINDERS_SAVE_STATE_IMPL(state)


def _clear_flow_reminder_state() -> None:
    _sync_reminders_patch_points()
    _REMINDERS_CLEAR_STATE_IMPL()


def _remind_enabled_state() -> bool | None:
    return _REMINDERS_REMIND_ENABLED_IMPL()


def _set_remind_enabled(enabled: bool) -> bool:
    return _REMINDERS_SET_REMIND_ENABLED_IMPL(enabled)


def _print_remind_status(enabled: bool) -> None:
    _REMINDERS_PRINT_REMIND_STATUS_IMPL(enabled)


def _apply_remind_state(state: str) -> int:
    return _REMINDERS_APPLY_REMIND_STATE_IMPL(state)


def _run_applescript(script: str) -> str | None:
    return _REMINDERS_RUN_APPLESCRIPT_IMPL(script)


def _latest_row_is_open_flow(conn: sqlite3.Connection) -> bool:
    return _REMINDERS_LATEST_ROW_OPEN_FLOW_IMPL(conn)


def _latest_open_flow_started_at(conn: sqlite3.Connection) -> float | None:
    return _REMINDERS_LATEST_OPEN_FLOW_STARTED_IMPL(conn)


def _now() -> datetime.datetime:
    return _REMINDERS_NOW_IMPL()


def cmd_session_skip(args: argparse.Namespace) -> int:
    _sync_reminders_patch_points()
    return reminders_cmd.cmd_session_skip(args)


def cmd_session_remind(args: argparse.Namespace) -> int:
    _sync_reminders_patch_points()
    return reminders_cmd.cmd_session_remind(args)


def _parse_iso_day(value: str) -> datetime.date:
    return media_cmd._parse_iso_day(value)


def _fetch_youtube_oembed_metadata(url: str) -> tuple[str | None, str | None]:
    return media_cmd._fetch_youtube_oembed_metadata(url)


def _sanitize_podcast_title(raw_title: str) -> str:
    return media_cmd._sanitize_podcast_title(raw_title)


def _podcast_template_path() -> str:
    _sync_media_patch_points()
    return media_cmd._podcast_template_path()


def _apply_frontmatter_value(lines: list[str], key: str, value: str) -> list[str]:
    return media_cmd._apply_frontmatter_value(lines, key, value)


def _render_podcast_note_lines(
    template_lines: list[str],
    *,
    host: str,
    note_date: datetime.date,
    link: str,
) -> list[str]:
    return media_cmd._render_podcast_note_lines(
        template_lines,
        host=host,
        note_date=note_date,
        link=link,
    )


def _update_media_cache_for_podcast(title: str, note_date: datetime.date) -> None:
    _sync_media_patch_points()
    media_cmd._update_media_cache_for_podcast(title, note_date)


def cmd_media_podcast_add(args: argparse.Namespace) -> int:
    _sync_media_patch_points()
    return media_cmd.cmd_media_podcast_add(args)


def build_parser() -> argparse.ArgumentParser:
    return parser_mod.build_parser(
        handlers={
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
    )


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
