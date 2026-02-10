"""Curses application for journal querying and source-data editing."""

from __future__ import annotations

import curses
import datetime
from typing import cast

from sync.adapters.markdown_daily_aggregates import MarkdownDailyAggregateSource
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.adapters.markdown_reminders import MarkdownReminderRuleStore
from sync.application.query_service import QueryService
from sync.log import configure_logging, get_logger
from sync.models import ReminderRule, ScheduleKind
from tui.data.daily_store import DailyStore
from tui.data.reminders_store import RemindersStore
from tui.data.repository import QueryRepository
from tui.keymap import is_back, is_enter, is_pivot
from tui.state import AppState
from tui.views import (
    editor_daily,
    editor_reminders,
    explorer_metric,
    explorer_period,
    main_menu,
)


def _prompt(stdscr: curses.window, prompt: str) -> str:
    """Read a single-line string input from the user."""
    height, width = stdscr.getmaxyx()
    row = max(0, height - 2)
    stdscr.move(row, 0)
    stdscr.clrtoeol()
    stdscr.addstr(row, 0, prompt[: max(0, width - 1)])
    stdscr.refresh()
    curses.echo()
    try:
        data = stdscr.getstr(
            row, min(len(prompt), width - 1), max(1, width - len(prompt) - 1)
        )
        return data.decode("utf-8").strip()
    finally:
        curses.noecho()


def _parse_schedule_input(schedule: str) -> tuple[str, str]:
    kind, sep, value = schedule.partition(":")
    if not sep:
        raise ValueError("SCHEDULE must be KIND:VALUE")
    kind = kind.strip().upper()
    value = value.strip().upper()
    allowed = {
        "WEEKLY",
        "MONTHLY",
        "YEARLY",
        "BIWEEKLY_ODD_ISO",
        "BIWEEKLY_EVEN_ISO",
    }
    if kind not in allowed:
        raise ValueError(f"Unsupported schedule kind: {kind}")
    return kind, value


def _handle_main_menu(state: AppState, ch: int) -> bool:
    if ch in {ord("j"), curses.KEY_DOWN}:
        state.selected_index = (state.selected_index + 1) % len(main_menu.MENU_ITEMS)
    elif ch in {ord("k"), curses.KEY_UP}:
        state.selected_index = (state.selected_index - 1) % len(main_menu.MENU_ITEMS)
    elif is_enter(ch):
        target, _ = main_menu.MENU_ITEMS[state.selected_index]
        if target == "quit":
            return True
        state.screen = target  # type: ignore[assignment]
        state.selected_index = 0
        state.message = ""
    return False


def _main(stdscr: curses.window) -> None:
    curses.curs_set(0)
    stdscr.keypad(True)

    state = AppState()
    query_service = QueryService(aggregate_source=MarkdownDailyAggregateSource())
    repo = QueryRepository(query_service)
    daily_store = DailyStore(note_store=MarkdownNoteStore())
    reminders_store = RemindersStore(rule_store=MarkdownReminderRuleStore())

    while True:
        stdscr.erase()

        if state.screen == "menu":
            main_menu.render(stdscr, state)

        elif state.screen == "by_period":
            snapshot = repo.query_by_period(state.period, state.anchor_date)
            explorer_period.render(stdscr, state, snapshot)
            if state.message:
                stdscr.addstr(18, 2, state.message, curses.A_BOLD)

        elif state.screen == "by_metric":
            snapshot, value = repo.query_by_metric(
                state.metric, state.period, state.anchor_date
            )
            explorer_metric.render(stdscr, state, snapshot, value)
            if state.message:
                stdscr.addstr(10, 2, state.message, curses.A_BOLD)

        elif state.screen == "edit_daily":
            editor_daily.render(stdscr, state.anchor_date, state.message)

        elif state.screen == "edit_reminders":
            try:
                rules = reminders_store.load()
                if rules:
                    state.selected_index = max(
                        0, min(state.selected_index, len(rules) - 1)
                    )
                else:
                    state.selected_index = 0
                editor_reminders.render(
                    stdscr, rules, state.selected_index, state.message
                )
            except Exception as exc:
                stdscr.addstr(1, 2, "Edit REMINDERS.md", curses.A_BOLD)
                stdscr.addstr(3, 2, f"Error loading rules: {exc}")
                stdscr.addstr(4, 2, "q: back")

        stdscr.refresh()
        ch = stdscr.getch()

        if state.screen == "menu":
            if _handle_main_menu(state, ch):
                break
            continue

        if is_back(ch):
            state.screen = "menu"
            state.message = ""
            continue

        if state.screen in {"by_period", "by_metric"} and is_pivot(ch):
            state.pivot()
            state.message = ""
            continue

        if state.screen == "by_period":
            if ch == ord("h"):
                state.cycle_period(-1)
            elif ch == ord("l"):
                state.cycle_period(1)
            elif ch == ord("n"):
                state.anchor_date = repo.shift_anchor(
                    state.period, state.anchor_date, 1
                )
            elif ch == ord("p"):
                state.anchor_date = repo.shift_anchor(
                    state.period, state.anchor_date, -1
                )
            continue

        if state.screen == "by_metric":
            if ch in {ord("j"), curses.KEY_DOWN}:
                state.cycle_metric(1)
            elif ch in {ord("k"), curses.KEY_UP}:
                state.cycle_metric(-1)
            elif ch == ord("h"):
                state.cycle_period(-1)
            elif ch == ord("l"):
                state.cycle_period(1)
            elif ch == ord("n"):
                state.anchor_date = repo.shift_anchor(
                    state.period, state.anchor_date, 1
                )
            elif ch == ord("p"):
                state.anchor_date = repo.shift_anchor(
                    state.period, state.anchor_date, -1
                )
            continue

        if state.screen == "edit_daily":
            try:
                if ch == ord("n"):
                    state.anchor_date = state.anchor_date + datetime.timedelta(days=1)
                elif ch == ord("p"):
                    state.anchor_date = state.anchor_date - datetime.timedelta(days=1)
                elif ch == ord("f"):
                    key = _prompt(stdscr, "frontmatter key: ")
                    value = _prompt(stdscr, "value: ")
                    daily_store.update_frontmatter(state.anchor_date, key, value)
                    state.message = f"Updated frontmatter {key}"
                elif ch == ord("g"):
                    raw = _prompt(stdscr, "DAILY goals (use ';;' to separate lines): ")
                    goals = [part.strip() for part in raw.split(";;") if part.strip()]
                    daily_store.replace_goals_subsection(
                        state.anchor_date, "DAILY", goals
                    )
                    state.message = "Updated DAILY goals"
                elif ch == ord("s"):
                    header = _prompt(stdscr, "Section header (e.g. ### **STUDY**): ")
                    raw = _prompt(stdscr, "Section body lines separated by ';;': ")
                    body_lines = [
                        part.strip() for part in raw.split(";;") if part.strip()
                    ]
                    daily_store.replace_section(state.anchor_date, header, body_lines)
                    state.message = f"Updated section {header}"
            except Exception as exc:
                state.message = f"Error: {exc}"
            continue

        if state.screen == "edit_reminders":
            try:
                rules = reminders_store.load()
                if ch in {ord("j"), curses.KEY_DOWN} and rules:
                    state.selected_index = (state.selected_index + 1) % len(rules)
                elif ch in {ord("k"), curses.KEY_UP} and rules:
                    state.selected_index = (state.selected_index - 1) % len(rules)
                elif ch == ord("t") and rules:
                    rule = rules[state.selected_index]
                    reminders_store.toggle(rule.id)
                    state.message = f"Toggled {rule.id}"
                elif ch == ord("d") and rules:
                    rule = rules[state.selected_index]
                    reminders_store.delete(rule.id)
                    state.selected_index = max(0, state.selected_index - 1)
                    state.message = f"Deleted {rule.id}"
                elif ch == ord("a"):
                    rule_id = _prompt(stdscr, "ID: ")
                    enabled_raw = _prompt(stdscr, "enabled (true/false): ")
                    schedule = _prompt(stdscr, "SCHEDULE (KIND:VALUE): ")
                    body = _prompt(stdscr, "BODY: ")

                    enabled = enabled_raw.strip().lower() in {"true", "1", "yes", "y"}
                    kind, value = _parse_schedule_input(schedule)

                    reminders_store.add(
                        ReminderRule(
                            id=rule_id,
                            enabled=enabled,
                            schedule_kind=cast(ScheduleKind, kind),
                            schedule_value=value,
                            body=body,
                        )
                    )
                    state.message = f"Added {rule_id}"
            except Exception as exc:
                state.message = f"Error: {exc}"


def run() -> None:
    """Run curses TUI application."""
    configure_logging()
    logger = get_logger(__name__)
    try:
        curses.wrapper(_main)
    except Exception:
        logger.exception("TUI app crashed")
        raise
