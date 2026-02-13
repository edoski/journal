"""Curses application for journal querying and source-data editing."""

from __future__ import annotations

import curses
import datetime
from typing import Callable, cast

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
from tui.state import AppState, PendingPreview
from tui.views import (
    editor_daily,
    editor_reminders,
    explorer_metric,
    explorer_period,
    main_menu,
)
from tui.views.preview import build_unified_diff

PendingApply = Callable[[], None]
_WEEKDAYS = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}


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
    """Parse and validate reminder schedule input from interactive prompts."""
    kind, sep, value = schedule.partition(":")
    if not sep:
        raise ValueError("SCHEDULE must be KIND:VALUE")

    kind = kind.strip().upper()
    value = value.strip().upper()

    if kind in {"WEEKLY", "WEEKLY_ODD", "WEEKLY_EVEN"}:
        if value not in _WEEKDAYS:
            raise ValueError(f"Unsupported weekday for {kind}: {value}")
        return kind, value

    if kind == "MONTHLY":
        if value != "LAST_DAY":
            raise ValueError("MONTHLY schedule must be MONTHLY:LAST_DAY")
        return kind, value

    if kind == "YEARLY":
        parts = value.split("-", maxsplit=1)
        if len(parts) != 2 or len(parts[0]) != 2 or len(parts[1]) != 2:
            raise ValueError("YEARLY schedule must be YEARLY:MM-DD")
        if not parts[0].isdigit() or not parts[1].isdigit():
            raise ValueError("YEARLY schedule must be YEARLY:MM-DD")
        month, day = int(parts[0]), int(parts[1])
        try:
            datetime.date(2000, month, day)
        except ValueError as exc:
            raise ValueError(f"Invalid YEARLY schedule date: {value}") from exc
        return kind, value

    raise ValueError(f"Unsupported schedule kind: {kind}")


def _stage_pending_change(
    state: AppState,
    *,
    title: str,
    target_label: str,
    before_lines: list[str],
    after_lines: list[str],
    success_message: str,
) -> None:
    """Store a pending change preview that requires user confirmation."""
    diff_lines = build_unified_diff(
        before_lines,
        after_lines,
        from_label=f"{target_label} (before)",
        to_label=f"{target_label} (after)",
    )
    state.pending_preview = PendingPreview(
        title=title,
        target_label=target_label,
        diff_lines=diff_lines,
        success_message=success_message,
    )
    state.message = "Review expected changes. Press Enter/y to confirm or c to cancel."


def _handle_pending_confirmation(
    state: AppState,
    ch: int,
    pending_apply: PendingApply | None,
) -> tuple[bool, PendingApply | None]:
    """
    Handle confirm/cancel keys while a preview is staged.

    Returns (consumed, pending_apply).
    """
    if state.pending_preview is None:
        return False, pending_apply

    if is_enter(ch) or ch in {ord("y"), ord("Y")}:
        if pending_apply is None:
            state.pending_preview = None
            state.message = "No pending action to apply."
            return True, None
        try:
            pending_apply()
        except Exception as exc:
            state.message = f"Error: {exc}"
            return True, pending_apply
        success_message = state.pending_preview.success_message
        state.pending_preview = None
        state.message = success_message
        return True, None

    if ch in {ord("c"), ord("C")} or is_back(ch):
        state.pending_preview = None
        state.message = "Cancelled pending change."
        return True, None

    # Freeze edit controls while waiting for explicit confirm/cancel.
    return True, pending_apply


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
        state.pending_preview = None
        state.message = ""
    return False


def _main(stdscr: curses.window) -> None:
    curses.curs_set(0)
    stdscr.keypad(True)

    state = AppState()
    pending_apply: PendingApply | None = None
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
            editor_daily.render(
                stdscr,
                state.anchor_date,
                state.message,
                state.pending_preview,
            )

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
                    stdscr,
                    rules,
                    state.selected_index,
                    state.message,
                    state.pending_preview,
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

        if state.screen in {"edit_daily", "edit_reminders"}:
            consumed, pending_apply = _handle_pending_confirmation(
                state,
                ch,
                pending_apply,
            )
            if consumed:
                continue

        if is_back(ch):
            state.screen = "menu"
            state.pending_preview = None
            pending_apply = None
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
                    state.period,
                    state.anchor_date,
                    1,
                )
            elif ch == ord("p"):
                state.anchor_date = repo.shift_anchor(
                    state.period,
                    state.anchor_date,
                    -1,
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
                    state.period,
                    state.anchor_date,
                    1,
                )
            elif ch == ord("p"):
                state.anchor_date = repo.shift_anchor(
                    state.period,
                    state.anchor_date,
                    -1,
                )
            continue

        if state.screen == "edit_daily":
            try:
                if ch == ord("n"):
                    state.anchor_date = state.anchor_date + datetime.timedelta(days=1)
                    state.message = ""
                elif ch == ord("p"):
                    state.anchor_date = state.anchor_date - datetime.timedelta(days=1)
                    state.message = ""
                elif ch == ord("f"):
                    key = _prompt(stdscr, "frontmatter key: ")
                    value = _prompt(stdscr, "value: ")
                    note_date = state.anchor_date
                    path, before, after = daily_store.preview_frontmatter_update(
                        note_date,
                        key,
                        value,
                    )
                    _stage_pending_change(
                        state,
                        title=f"Update frontmatter key '{key}'",
                        target_label=path,
                        before_lines=before,
                        after_lines=after,
                        success_message=f"Updated frontmatter {key}",
                    )

                    def _apply_frontmatter(
                        note_date: datetime.date = note_date,
                        staged_lines: list[str] = list(after),
                    ) -> None:
                        daily_store.save_lines(note_date, list(staged_lines))

                    pending_apply = _apply_frontmatter
                elif ch == ord("g"):
                    raw = _prompt(stdscr, "DAILY goals (use ';;' to separate lines): ")
                    goals = [part.strip() for part in raw.split(";;") if part.strip()]
                    note_date = state.anchor_date
                    path, before, after = daily_store.preview_goals_subsection_replace(
                        note_date,
                        "DAILY",
                        goals,
                    )
                    _stage_pending_change(
                        state,
                        title="Replace DAILY goals subsection",
                        target_label=path,
                        before_lines=before,
                        after_lines=after,
                        success_message="Updated DAILY goals",
                    )

                    def _apply_goals(
                        note_date: datetime.date = note_date,
                        staged_lines: list[str] = list(after),
                    ) -> None:
                        daily_store.save_lines(note_date, list(staged_lines))

                    pending_apply = _apply_goals
                elif ch == ord("s"):
                    header = _prompt(stdscr, "Section header (e.g. ### **STUDY**): ")
                    raw = _prompt(stdscr, "Section body lines separated by ';;': ")
                    body_lines = [
                        part.strip() for part in raw.split(";;") if part.strip()
                    ]
                    note_date = state.anchor_date
                    path, before, after = daily_store.preview_section_replace(
                        note_date,
                        header,
                        body_lines,
                    )
                    _stage_pending_change(
                        state,
                        title=f"Replace section {header}",
                        target_label=path,
                        before_lines=before,
                        after_lines=after,
                        success_message=f"Updated section {header}",
                    )

                    def _apply_section(
                        note_date: datetime.date = note_date,
                        staged_lines: list[str] = list(after),
                    ) -> None:
                        daily_store.save_lines(note_date, list(staged_lines))

                    pending_apply = _apply_section
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
                elif ch == ord("d") and rules:
                    rule = rules[state.selected_index]
                    before, after, updated_rules = reminders_store.preview_delete(rule)
                    next_index = max(
                        0, min(state.selected_index, len(updated_rules) - 1)
                    )
                    schedule = f"{rule.schedule_kind}:{rule.schedule_value}"
                    _stage_pending_change(
                        state,
                        title=f"Delete reminder '{schedule}'",
                        target_label="REMINDERS.md",
                        before_lines=before,
                        after_lines=after,
                        success_message=f"Deleted reminder {schedule}",
                    )

                    def _apply_deleted(
                        staged_rules: list[ReminderRule] = list(updated_rules),
                        staged_index: int = next_index,
                    ) -> None:
                        reminders_store.save(list(staged_rules))
                        state.selected_index = staged_index

                    pending_apply = _apply_deleted
                elif ch == ord("a"):
                    schedule = _prompt(stdscr, "SCHEDULE (KIND:VALUE): ")
                    body = _prompt(stdscr, "BODY: ")
                    kind, value = _parse_schedule_input(schedule)
                    rule = ReminderRule(
                        schedule_kind=cast(ScheduleKind, kind),
                        schedule_value=value,
                        body=body,
                    )
                    before, after, updated_rules = reminders_store.preview_add(rule)
                    schedule_label = f"{kind}:{value}"
                    _stage_pending_change(
                        state,
                        title=f"Add reminder '{schedule_label}'",
                        target_label="REMINDERS.md",
                        before_lines=before,
                        after_lines=after,
                        success_message=f"Added reminder {schedule_label}",
                    )

                    def _apply_added(
                        staged_rules: list[ReminderRule] = list(updated_rules),
                    ) -> None:
                        reminders_store.save(list(staged_rules))
                        state.selected_index = max(0, len(staged_rules) - 1)

                    pending_apply = _apply_added
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
