"""Shell runtime and event loop for the redesigned curses TUI."""

from __future__ import annotations

import curses
import datetime
from typing import cast

from sync.models import ReminderRule, ScheduleKind
from tui.commands import Command, default_commands, filter_commands
from tui.data.daily_store import DailyStore
from tui.data.reminders_store import RemindersStore
from tui.data.repository import QueryRepository
from tui.keymap import (
    is_backspace,
    is_enter,
    is_escape,
    resolve_global_action,
    resolve_route_action,
)
from tui.layout import Rect, ShellLayout, compute_shell_layout
from tui.screens import (
    dashboard,
    editor_daily,
    editor_reminders,
    explorer,
    help,
    metric_lab,
)
from tui.state import (
    METRIC_LAB_LOOKBACK_DEFAULT,
    ROUTE_ORDER,
    AppState,
    FormField,
    FormModal,
    PendingPreview,
    RouteName,
)
from tui.theme import init_theme
from tui.widgets.common import build_unified_diff, draw_box, safe_addstr

_ROUTE_LABELS = {
    "dashboard": "Dashboard",
    "explorer": "Explorer",
    "metric_lab": "Metric Lab",
    "daily_editor": "Daily Editor",
    "reminders": "Reminders",
    "help": "Help",
}
_WEEKDAYS = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}


class AppRuntime:
    """Stateful runtime for the shell-based journal TUI."""

    def __init__(
        self,
        *,
        stdscr: curses.window,
        repo: QueryRepository,
        daily_store: DailyStore,
        reminders_store: RemindersStore,
    ) -> None:
        self.stdscr = stdscr
        self.repo = repo
        self.daily_store = daily_store
        self.reminders_store = reminders_store
        self.state = AppState()
        self.theme = init_theme()
        self.commands = default_commands()
        self.metric_lab_lookback = dict(METRIC_LAB_LOOKBACK_DEFAULT)

    def run(self) -> None:
        """Main event loop."""
        curses.curs_set(0)
        self.stdscr.keypad(True)
        while not self.state.should_quit:
            self._render()
            ch = self.stdscr.getch()
            self._handle_key(ch)

    def _render(self) -> None:
        self.stdscr.erase()
        layout = compute_shell_layout(*self.stdscr.getmaxyx())
        self._render_header(layout)
        self._render_nav(layout)
        self._render_route(layout)
        self._render_footer(layout)
        if self.state.palette.open:
            self._render_palette(layout)
        if self.state.modal is not None:
            self._render_modal(layout)
        self.stdscr.refresh()

    def _render_header(self, layout: ShellLayout) -> None:
        route_label = _ROUTE_LABELS[self.state.route]
        text = (
            f" Journal TUI | {route_label} | "
            f"Anchor {self.state.anchor_date.isoformat()} | Period {self.state.period} "
        )
        safe_addstr(self.stdscr, layout.header.y, 0, text, self.theme.header)
        if layout.breakpoint == "compact":
            compact_nav = "  ".join(
                f"{idx + 1}:{_ROUTE_LABELS[route]}"
                for idx, route in enumerate(ROUTE_ORDER)
            )
            safe_addstr(
                self.stdscr, layout.header.y + 1, 0, compact_nav, self.theme.muted
            )

    def _render_nav(self, layout: ShellLayout) -> None:
        if layout.nav.w <= 0:
            return
        draw_box(
            self.stdscr,
            layout.nav,
            title="Navigation",
            title_attr=self.theme.panel_title,
        )
        for idx, route in enumerate(ROUTE_ORDER):
            if idx >= layout.nav.h - 2:
                break
            label = f"{idx + 1}. {_ROUTE_LABELS[route]}"
            attr = (
                self.theme.nav_active
                if route == self.state.route
                else self.theme.nav_idle
            )
            safe_addstr(
                self.stdscr, layout.nav.y + 1 + idx, layout.nav.x + 2, label, attr
            )

    def _render_footer(self, layout: ShellLayout) -> None:
        hints = "Ctrl+K/: commands  [ ] anchor  h/l period  / filter  ? help  q quit"
        safe_addstr(self.stdscr, layout.footer.y, 0, hints, self.theme.footer)
        if self.state.message:
            safe_addstr(
                self.stdscr, layout.footer.y + 1, 0, self.state.message, self.theme.warn
            )

    def _render_route(self, layout: ShellLayout) -> None:
        body = layout.body
        if self.state.route == "dashboard":
            snapshot = self.repo.query_dashboard(self.state.anchor_date)
            dashboard.render(self.stdscr, body, self.theme, snapshot)
            return

        if self.state.route == "explorer":
            detail = self.repo.query_period_detail(
                self.state.period, self.state.anchor_date
            )
            rows = explorer.filtered_rows(detail, self.state.explorer_filter_query)
            if not rows:
                self.state.explorer_metric_index = 0
            else:
                self.state.explorer_metric_index = max(
                    0, min(self.state.explorer_metric_index, len(rows) - 1)
                )
                self.state.selected_metric = rows[self.state.explorer_metric_index].key
            lookback = self.metric_lab_lookback[self.state.period]
            history = self.repo.query_metric_history(
                self.state.selected_metric,
                self.state.period,
                self.state.anchor_date,
                lookback,
            )
            explorer.render(
                self.stdscr,
                body,
                self.theme,
                detail,
                rows,
                self.state.explorer_metric_index,
                self.state.explorer_breakdown_tab,
                history,
            )
            return

        if self.state.route == "metric_lab":
            definitions = self.repo.metric_definitions()
            if definitions and self.state.selected_metric not in {
                definition.key for definition in definitions
            }:
                self.state.selected_metric = definitions[0].key
            detail = self.repo.query_period_detail(
                self.state.period, self.state.anchor_date
            )
            row_map = {row.key: row for row in detail.rows}
            lookback = self.metric_lab_lookback[self.state.period]
            history = self.repo.query_metric_history(
                self.state.selected_metric,
                self.state.period,
                self.state.anchor_date,
                lookback,
            )
            metric_lab.render(
                self.stdscr,
                body,
                self.theme,
                definitions,
                self.state.selected_metric,
                row_map.get(self.state.selected_metric),
                history,
                lookback,
            )
            return

        if self.state.route == "daily_editor":
            editor_daily.render(
                self.stdscr,
                body,
                self.theme,
                self.state.anchor_date,
                self.state.message,
                self.state.pending_preview,
                self.state.modal,
            )
            return

        if self.state.route == "reminders":
            rules = self._load_reminders()
            filtered = editor_reminders.filtered_rules(
                rules,
                self.state.reminders_filter_query,
            )
            if not filtered:
                self.state.reminders_selected_index = 0
            else:
                self.state.reminders_selected_index = max(
                    0,
                    min(self.state.reminders_selected_index, len(filtered) - 1),
                )
            editor_reminders.render(
                self.stdscr,
                body,
                self.theme,
                rules,
                self.state.reminders_selected_index,
                self.state.reminders_filter_query,
                self.state.message,
                self.state.pending_preview,
                self.state.modal,
            )
            return

        help.render(self.stdscr, body, self.theme)

    def _render_modal(self, layout: ShellLayout) -> None:
        modal = self.state.modal
        if modal is None:
            return
        width = min(88, max(38, layout.body.w - 8))
        height = min(12, max(6, 5 + len(modal.fields)))
        y = layout.body.y + max(0, (layout.body.h - height) // 2)
        x = layout.body.x + max(0, (layout.body.w - width) // 2)
        rect = Rect(y=y, x=x, h=height, w=width)
        draw_box(
            self.stdscr, rect, title=modal.title, title_attr=self.theme.panel_title
        )

        for idx, field in enumerate(modal.fields):
            attr = (
                self.theme.nav_active
                if idx == modal.active_index
                else self.theme.normal
            )
            label = f"{field.label}: {field.value}"
            safe_addstr(self.stdscr, rect.y + 1 + idx, rect.x + 2, label, attr)

        if modal.message:
            safe_addstr(
                self.stdscr,
                rect.y + rect.h - 2,
                rect.x + 2,
                modal.message,
                self.theme.warn,
            )
        else:
            safe_addstr(
                self.stdscr,
                rect.y + rect.h - 2,
                rect.x + 2,
                "Tab/j/k move field | Enter submit | Esc cancel",
                self.theme.muted,
            )

    def _render_palette(self, layout: ShellLayout) -> None:
        width = min(90, max(40, layout.body.w - 6))
        height = min(18, max(8, layout.body.h - 4))
        y = layout.body.y + max(0, (layout.body.h - height) // 2)
        x = layout.body.x + max(0, (layout.body.w - width) // 2)
        rect = Rect(y=y, x=x, h=height, w=width)
        draw_box(
            self.stdscr,
            rect,
            title="Command Palette",
            title_attr=self.theme.panel_title,
        )

        safe_addstr(
            self.stdscr,
            rect.y + 1,
            rect.x + 2,
            f"> {self.state.palette.query}",
            self.theme.table_header,
        )
        commands = self._visible_palette_commands()
        visible_rows = max(0, rect.h - 4)
        for idx, command in enumerate(commands[:visible_rows]):
            attr = (
                self.theme.nav_active
                if idx == self.state.palette.selected_index
                else self.theme.normal
            )
            line = f"{command.title:26} {command.description}"
            safe_addstr(self.stdscr, rect.y + 3 + idx, rect.x + 2, line, attr)

    def _visible_palette_commands(self) -> list[Command]:
        items = filter_commands(self.commands, self.state.palette.query)
        if not items:
            return [Command("no-result", "No matching command", "", "")]
        return items

    def _handle_key(self, ch: int) -> None:
        if self.state.pending_preview is not None:
            self._handle_pending_confirmation(ch)
            return

        if self.state.modal is not None:
            self._handle_modal_input(ch)
            return

        if self.state.palette.open:
            self._handle_palette_input(ch)
            return

        global_action = resolve_global_action(ch)
        if global_action is not None:
            self._dispatch_action(global_action)
            return

        route_action = resolve_route_action(self.state.route, ch)
        if route_action is not None:
            self._dispatch_action(route_action)

    def _dispatch_action(self, action: str) -> None:
        if action == "open_palette":
            self.state.palette.open = True
            self.state.palette.query = ""
            self.state.palette.selected_index = 0
            return
        if action == "open_help":
            self.state.set_route("help")
            return
        if action == "open_search":
            self._open_search_modal()
            return
        if action == "anchor_prev":
            self.state.anchor_date = self.repo.shift_anchor(
                self.state.period,
                self.state.anchor_date,
                -1,
            )
            self.repo.invalidate_cache()
            return
        if action == "anchor_next":
            self.state.anchor_date = self.repo.shift_anchor(
                self.state.period,
                self.state.anchor_date,
                1,
            )
            self.repo.invalidate_cache()
            return
        if action == "period_prev":
            self.state.cycle_period(-1)
            self.repo.invalidate_cache()
            return
        if action == "period_next":
            self.state.cycle_period(1)
            self.repo.invalidate_cache()
            return
        if action == "refresh":
            self.repo.invalidate_cache()
            self.state.message = "Refreshed."
            return
        if action == "jump_today":
            self.state.anchor_date = datetime.date.today()
            self.repo.invalidate_cache()
            return
        if action == "focus_next":
            self.state.pane_focus += 1
            return
        if action == "focus_prev":
            self.state.pane_focus = max(0, self.state.pane_focus - 1)
            return
        if action == "resize":
            return
        if action == "quit":
            self.state.should_quit = True
            return

        route_actions = {
            "goto_dashboard": "dashboard",
            "goto_explorer": "explorer",
            "goto_metric_lab": "metric_lab",
            "goto_daily_editor": "daily_editor",
            "goto_reminders": "reminders",
            "goto_help": "help",
        }
        if action in route_actions:
            self.state.set_route(cast(RouteName, route_actions[action]))
            return

        self._dispatch_route_action(action)

    def _dispatch_route_action(self, action: str) -> None:
        if action == "explorer_next_metric":
            self.state.explorer_metric_index += 1
            return
        if action == "explorer_prev_metric":
            self.state.explorer_metric_index = max(
                0, self.state.explorer_metric_index - 1
            )
            return
        if action == "explorer_next_breakdown":
            self.state.next_breakdown_tab(1)
            return
        if action == "explorer_prev_breakdown":
            self.state.next_breakdown_tab(-1)
            return
        if action == "explorer_open_metric_lab":
            detail = self.repo.query_period_detail(
                self.state.period, self.state.anchor_date
            )
            rows = explorer.filtered_rows(detail, self.state.explorer_filter_query)
            if rows:
                idx = max(0, min(self.state.explorer_metric_index, len(rows) - 1))
                self.state.selected_metric = rows[idx].key
            self.state.set_route("metric_lab")
            return

        if action == "metric_lab_next_metric":
            definitions = self.repo.metric_definitions()
            if not definitions:
                return
            keys = [definition.key for definition in definitions]
            try:
                idx = keys.index(self.state.selected_metric)
            except ValueError:
                idx = 0
            self.state.selected_metric = keys[(idx + 1) % len(keys)]
            self.repo.invalidate_cache()
            return
        if action == "metric_lab_prev_metric":
            definitions = self.repo.metric_definitions()
            if not definitions:
                return
            keys = [definition.key for definition in definitions]
            try:
                idx = keys.index(self.state.selected_metric)
            except ValueError:
                idx = 0
            self.state.selected_metric = keys[(idx - 1) % len(keys)]
            self.repo.invalidate_cache()
            return
        if action == "metric_lab_lookback_inc":
            current = self.metric_lab_lookback[self.state.period]
            self.metric_lab_lookback[self.state.period] = min(36, current + 1)
            self.repo.invalidate_cache()
            return
        if action == "metric_lab_lookback_dec":
            current = self.metric_lab_lookback[self.state.period]
            self.metric_lab_lookback[self.state.period] = max(2, current - 1)
            self.repo.invalidate_cache()
            return

        if action == "daily_next_day":
            self.state.anchor_date = self.state.anchor_date + datetime.timedelta(days=1)
            self.repo.invalidate_cache()
            return
        if action == "daily_prev_day":
            self.state.anchor_date = self.state.anchor_date - datetime.timedelta(days=1)
            self.repo.invalidate_cache()
            return
        if action == "daily_frontmatter_form":
            self.state.modal = FormModal(
                mode="daily_frontmatter",
                title="Set Frontmatter",
                fields=[FormField("Key"), FormField("Value")],
            )
            return
        if action == "daily_goals_form":
            self.state.modal = FormModal(
                mode="daily_goals",
                title="Replace DAILY Goals",
                fields=[FormField("Goal lines (;; separated)")],
            )
            return
        if action == "daily_section_form":
            self.state.modal = FormModal(
                mode="daily_section",
                title="Replace Section",
                fields=[
                    FormField("Section header (e.g. ### **STUDY**)"),
                    FormField("Body lines (;; separated)"),
                ],
            )
            return

        if action == "reminders_next":
            self.state.reminders_selected_index += 1
            return
        if action == "reminders_prev":
            self.state.reminders_selected_index = max(
                0, self.state.reminders_selected_index - 1
            )
            return
        if action == "reminders_add_form":
            self.state.modal = FormModal(
                mode="reminders_add",
                title="Add Reminder",
                fields=[FormField("Schedule (KIND:VALUE)"), FormField("Body")],
            )
            return
        if action == "reminders_delete":
            self._stage_delete_reminder()

    def _open_search_modal(self) -> None:
        if self.state.route == "explorer":
            self.state.modal = FormModal(
                mode="search_explorer",
                title="Explorer Filter",
                fields=[FormField("Filter", self.state.explorer_filter_query)],
            )
            return
        if self.state.route == "reminders":
            self.state.modal = FormModal(
                mode="search_reminders",
                title="Reminders Filter",
                fields=[FormField("Filter", self.state.reminders_filter_query)],
            )
            return
        self.state.message = "Search/filter is available on Explorer and Reminders."

    def _handle_modal_input(self, ch: int) -> None:
        modal = self.state.modal
        if modal is None:
            return
        if is_escape(ch):
            self.state.modal = None
            return
        if ch in {9, ord("j"), curses.KEY_DOWN}:
            modal.active_index = (modal.active_index + 1) % len(modal.fields)
            return
        if ch in {ord("k"), curses.KEY_UP}:
            modal.active_index = (modal.active_index - 1) % len(modal.fields)
            return
        if is_backspace(ch):
            active = modal.fields[modal.active_index]
            active.value = active.value[:-1]
            return
        if is_enter(ch):
            self._submit_modal()
            return
        if 32 <= ch <= 126:
            active = modal.fields[modal.active_index]
            active.value += chr(ch)

    def _submit_modal(self) -> None:
        modal = self.state.modal
        if modal is None:
            return
        try:
            if modal.mode == "search_explorer":
                self.state.explorer_filter_query = modal.fields[0].value.strip()
                self.state.explorer_metric_index = 0
                self.state.modal = None
                return
            if modal.mode == "search_reminders":
                self.state.reminders_filter_query = modal.fields[0].value.strip()
                self.state.reminders_selected_index = 0
                self.state.modal = None
                return
            if modal.mode == "daily_frontmatter":
                key = modal.fields[0].value.strip()
                value = modal.fields[1].value.strip()
                path, before, after = self.daily_store.preview_frontmatter_update(
                    self.state.anchor_date,
                    key,
                    value,
                )
                self._stage_pending_change(
                    title=f"Update frontmatter key '{key}'",
                    target_label=path,
                    before_lines=before,
                    after_lines=after,
                    success_message=f"Updated frontmatter {key}",
                    apply=lambda note_date=self.state.anchor_date, staged=after: (
                        self.daily_store.save_lines(note_date, list(staged))
                    ),
                )
                self.state.modal = None
                return
            if modal.mode == "daily_goals":
                raw = modal.fields[0].value.strip()
                goals = [part.strip() for part in raw.split(";;") if part.strip()]
                path, before, after = self.daily_store.preview_goals_subsection_replace(
                    self.state.anchor_date,
                    "DAILY",
                    goals,
                )
                self._stage_pending_change(
                    title="Replace DAILY goals subsection",
                    target_label=path,
                    before_lines=before,
                    after_lines=after,
                    success_message="Updated DAILY goals",
                    apply=lambda note_date=self.state.anchor_date, staged=after: (
                        self.daily_store.save_lines(note_date, list(staged))
                    ),
                )
                self.state.modal = None
                return
            if modal.mode == "daily_section":
                header = modal.fields[0].value.strip()
                body = [
                    part.strip()
                    for part in modal.fields[1].value.split(";;")
                    if part.strip()
                ]
                path, before, after = self.daily_store.preview_section_replace(
                    self.state.anchor_date,
                    header,
                    body,
                )
                self._stage_pending_change(
                    title=f"Replace section {header}",
                    target_label=path,
                    before_lines=before,
                    after_lines=after,
                    success_message=f"Updated section {header}",
                    apply=lambda note_date=self.state.anchor_date, staged=after: (
                        self.daily_store.save_lines(note_date, list(staged))
                    ),
                )
                self.state.modal = None
                return
            if modal.mode == "reminders_add":
                schedule = modal.fields[0].value.strip()
                body = modal.fields[1].value.strip()
                kind, value = self._parse_schedule_input(schedule)
                rule = ReminderRule(
                    schedule_kind=cast(ScheduleKind, kind),
                    schedule_value=value,
                    body=body,
                )
                before, after, updated_rules = self.reminders_store.preview_add(rule)
                label = f"{kind}:{value}"
                self._stage_pending_change(
                    title=f"Add reminder '{label}'",
                    target_label="REMINDERS.md",
                    before_lines=before,
                    after_lines=after,
                    success_message=f"Added reminder {label}",
                    apply=lambda staged=updated_rules: self.reminders_store.save(
                        list(staged)
                    ),
                )
                self.state.modal = None
                return
            self.state.modal = None
        except Exception as exc:
            modal.message = f"Error: {exc}"

    def _handle_palette_input(self, ch: int) -> None:
        if is_escape(ch):
            self.state.reset_palette()
            return
        if is_backspace(ch):
            self.state.palette.query = self.state.palette.query[:-1]
            self.state.palette.selected_index = 0
            return
        if ch in {ord("j"), curses.KEY_DOWN}:
            items = self._visible_palette_commands()
            self.state.palette.selected_index = min(
                len(items) - 1,
                self.state.palette.selected_index + 1,
            )
            return
        if ch in {ord("k"), curses.KEY_UP}:
            self.state.palette.selected_index = max(
                0, self.state.palette.selected_index - 1
            )
            return
        if is_enter(ch):
            commands = self._visible_palette_commands()
            if not commands:
                self.state.reset_palette()
                return
            selected = commands[
                max(0, min(self.state.palette.selected_index, len(commands) - 1))
            ]
            self.state.reset_palette()
            if selected.action:
                self._dispatch_action(selected.action)
            return
        if 32 <= ch <= 126:
            self.state.palette.query += chr(ch)
            self.state.palette.selected_index = 0

    def _stage_pending_change(
        self,
        *,
        title: str,
        target_label: str,
        before_lines: list[str],
        after_lines: list[str],
        success_message: str,
        apply,
    ) -> None:
        diff_lines = build_unified_diff(
            before_lines,
            after_lines,
            from_label=f"{target_label} (before)",
            to_label=f"{target_label} (after)",
        )
        self.state.pending_preview = PendingPreview(
            title=title,
            target_label=target_label,
            diff_lines=diff_lines,
            success_message=success_message,
        )
        self.state.pending_apply = apply
        self.state.message = "Review expected changes. Enter/y confirm, c/Esc cancel."

    def _handle_pending_confirmation(self, ch: int) -> None:
        if self.state.pending_preview is None:
            return
        if is_enter(ch) or ch in {ord("y"), ord("Y")}:
            apply = self.state.pending_apply
            if apply is None:
                self.state.pending_preview = None
                self.state.message = "No pending action to apply."
                return
            try:
                apply()
            except Exception as exc:
                self.state.message = f"Error: {exc}"
                return
            success = self.state.pending_preview.success_message
            self.state.pending_preview = None
            self.state.pending_apply = None
            self.repo.invalidate_cache()
            self.state.message = success
            return
        if ch in {ord("c"), ord("C")} or is_escape(ch):
            self.state.pending_preview = None
            self.state.pending_apply = None
            self.state.message = "Cancelled pending change."

    def _parse_schedule_input(self, schedule: str) -> tuple[str, str]:
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
            month = int(parts[0])
            day = int(parts[1])
            try:
                datetime.date(2000, month, day)
            except ValueError as exc:
                raise ValueError(f"Invalid YEARLY schedule date: {value}") from exc
            return kind, value
        raise ValueError(f"Unsupported schedule kind: {kind}")

    def _load_reminders(self) -> list[ReminderRule]:
        try:
            return self.reminders_store.load()
        except Exception as exc:
            self.state.message = f"Error loading reminders: {exc}"
            return []

    def _stage_delete_reminder(self) -> None:
        rules = self._load_reminders()
        filtered = editor_reminders.filtered_rules(
            rules, self.state.reminders_filter_query
        )
        if not filtered:
            self.state.message = "No reminder rule selected."
            return
        idx = max(0, min(self.state.reminders_selected_index, len(filtered) - 1))
        rule = filtered[idx]
        before, after, updated_rules = self.reminders_store.preview_delete(rule)
        label = f"{rule.schedule_kind}:{rule.schedule_value}"
        self._stage_pending_change(
            title=f"Delete reminder '{label}'",
            target_label="REMINDERS.md",
            before_lines=before,
            after_lines=after,
            success_message=f"Deleted reminder {label}",
            apply=lambda staged=updated_rules: self.reminders_store.save(list(staged)),
        )
