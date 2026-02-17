"""Canonical goal synchronization service for daily and period notes."""

from __future__ import annotations

import datetime
from typing import TYPE_CHECKING

from sync.constants import (
    MONTHLY_TEMPLATE_PATH,
    QUARTERLY_TEMPLATE_PATH,
)
from sync.contracts.goals import GoalSection
from sync.dates import quarter_id, quarter_of_date
from sync.goals.carry_forward import carry_forward_with_tombstones
from sync.goals.identity import goal_id_kind
from sync.goals.period_pipeline import (
    CarryForwardConfig,
    MirrorSyncConfig,
    PiercingSyncConfig,
    SourceWriteConfig,
    load_source_tasks_with_carry_forward,
    propagate_source_sections,
    sync_mirror_section,
    sync_pierced_source_section,
)
from sync.goals.reconcile import (
    load_quarterly_goals,
    process_pierced_goals,
    reconcile_goal_lists,
)
from sync.goals.reminders import get_reminders_for_date
from sync.models.reminders import ReminderRule
from sync.notes.locking import locked_note
from sync.notes.sections import goals_section_bounds
from sync.ports.cache import GoalCarryForwardCacheStore, GoalReconcileCacheStore
from sync.ports.goals import GoalStore
from sync.ports.notes import NoteStore
from sync.periods.runtime import journal_path
from sync.periods.windows import MonthWindow, QuarterWindow, WeekWindow, YearWindow
from sync.readers.goals import filter_by_proximity
from sync.writers.goals import build_goals_block, render_goal_lines
from sync.goals.daily_pipeline import (
    carry_forward_daily_tasks,
    load_weekly_goals,
    parse_daily_goal_subsections,
    write_weekly_goals,
)

if TYPE_CHECKING:
    from sync.models.goals import Goal


class GoalSyncService:
    """Owns all source/mirror/piercing goal orchestration flows."""

    def __init__(
        self,
        *,
        note_store: NoteStore,
        goal_store: GoalStore,
        carry_cache_store: GoalCarryForwardCacheStore,
        reconcile_cache_store: GoalReconcileCacheStore,
    ) -> None:
        self.note_store = note_store
        self.goal_store = goal_store
        self.carry_cache_store = carry_cache_store
        self.reconcile_cache_store = reconcile_cache_store

    def sync_daily_note(
        self,
        lines: list[str],
        *,
        day: datetime.date,
        note_path: str,
        yaml_end_idx: int,
        reminder_rules: list[ReminderRule],
    ) -> list[str]:
        existing_weekly_tasks, existing_daily_tasks = parse_daily_goal_subsections(
            lines,
            day=day,
            goal_store=self.goal_store,
        )

        yesterday = day - datetime.timedelta(days=1)
        existing_daily_tasks, _ = carry_forward_daily_tasks(
            day,
            yesterday,
            existing_daily_tasks,
            carry_cache_store=self.carry_cache_store,
            note_store=self.note_store,
            goal_store=self.goal_store,
        )

        reminders = get_reminders_for_date(day, reminder_rules)
        today_reminder_ids = {goal.id for goal in reminders if goal.id}
        existing_daily_tasks = [
            goal
            for goal in existing_daily_tasks
            if not (
                goal.id
                and goal_id_kind(goal.id) == "reminder"
                and goal.id not in today_reminder_ids
            )
        ]
        existing_ids = {task.id for task in existing_daily_tasks if task.id}
        for reminder in reminders:
            if reminder.id not in existing_ids:
                existing_daily_tasks.append(reminder)
                existing_ids.add(reminder.id)

        (
            weekly_tasks,
            monthly_tasks,
            quarterly_tasks,
            yearly_tasks,
            weekly_path,
            monthly_path,
            quarterly_path,
        ) = load_weekly_goals(
            day,
            note_store=self.note_store,
            goal_store=self.goal_store,
        )

        updated_weekly_tasks, _, weekly_changed, _ = reconcile_goal_lists(
            weekly_tasks,
            existing_weekly_tasks,
            weekly_path,
            note_path,
            reconcile_cache_store=self.reconcile_cache_store,
        )

        filtered_weekly = filter_by_proximity(updated_weekly_tasks, 7, day)
        weekly_lines = self._render_goals_or_empty(
            "WEEKLY",
            filtered_weekly,
            today=day,
        )

        (
            original_daily,
            final_pierced,
            [updated_monthly, updated_quarterly, updated_yearly],
        ) = process_pierced_goals(
            existing_tasks=existing_daily_tasks,
            source_goal_lists=[monthly_tasks, quarterly_tasks, yearly_tasks],
            proximity_days=7,
            today=day,
            note_path=note_path,
            source_paths=[monthly_path, quarterly_path, quarterly_path],
            reconcile_cache_store=self.reconcile_cache_store,
        )
        monthly_changed = updated_monthly != monthly_tasks
        quarterly_changed = updated_quarterly != quarterly_tasks
        yearly_changed = updated_yearly != yearly_tasks

        if weekly_changed or monthly_changed or quarterly_changed or yearly_changed:
            write_weekly_goals(
                day,
                updated_weekly_tasks,
                updated_monthly if monthly_changed else None,
                updated_quarterly if quarterly_changed else None,
                updated_yearly if yearly_changed else None,
                note_store=self.note_store,
                goal_store=self.goal_store,
            )

        daily_source_lines = self._render_goals_or_empty(
            "DAILY",
            [*original_daily, *final_pierced],
            today=day,
        )

        goals_block = build_goals_block(
            [
                ("WEEKLY", weekly_lines),
                ("DAILY", daily_source_lines),
            ]
        )

        updated = lines[:]
        g_start, g_end = goals_section_bounds(updated)
        if g_start == -1:
            insert_pos = yaml_end_idx + 1 if yaml_end_idx != -1 else 0
            updated[insert_pos:insert_pos] = goals_block
        else:
            updated[g_start:g_end] = goals_block
        return updated

    def sync_weekly_note(
        self,
        lines: list[str],
        *,
        note_path: str,
        window: WeekWindow,
    ) -> list[str]:
        month_start = datetime.date(window.start.year, window.start.month, 1)
        monthly_path = journal_path(f"{month_start.year}-{month_start.month:02d}.md")
        monthly_lines = self.note_store.read_or_create(
            monthly_path, MONTHLY_TEMPLATE_PATH
        )
        monthly_tasks = self.goal_store.extract(
            monthly_lines,
            "MONTHLY",
            horizon="monthly",
            period_key=month_start.isoformat(),
        )

        yearly_mirror, quarterly_tasks, quarterly_path, _quarterly_lines = (
            load_quarterly_goals(month_start)
        )

        monthly_mirror = self.goal_store.extract(
            lines,
            "MONTHLY",
            horizon="monthly",
            period_key=month_start.isoformat(),
        )
        weekly_tasks = load_source_tasks_with_carry_forward(
            lines,
            config=CarryForwardConfig(
                section="WEEKLY",
                horizon="weekly",
                period_key=f"{window.year}-W{window.week_num:02d}",
                current_id_key=window.start.isoformat(),
                previous_note_path=journal_path(window.previous_filename),
                previous_id_key=window.previous_start.isoformat(),
            ),
            carry_cache_store=self.carry_cache_store,
        )

        today = window.target_date
        monthly_sync = sync_mirror_section(
            monthly_tasks,
            monthly_mirror,
            config=MirrorSyncConfig(
                mirror_section="MONTHLY",
                source_path=monthly_path,
                mirror_path=note_path,
                proximity_days=30,
            ),
            today=today,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        monthly_tasks = monthly_sync.source_tasks
        monthly_changed = monthly_sync.source_changed

        if monthly_changed:
            with locked_note(monthly_path):
                monthly_lines = self.note_store.read_or_create(
                    monthly_path,
                    MONTHLY_TEMPLATE_PATH,
                )
                existing_quarterly = self.goal_store.extract(monthly_lines, "QUARTERLY")
                propagate_source_sections(
                    config=SourceWriteConfig(path=monthly_path),
                    sections=[
                        (
                            "QUARTERLY",
                            self._render_goals_or_empty(
                                "QUARTERLY", existing_quarterly
                            ),
                        ),
                        ("MONTHLY", self._render_goal_lines(monthly_tasks)),
                    ],
                    existing_lines=monthly_lines,
                )

        source_sync = sync_pierced_source_section(
            existing_tasks=weekly_tasks,
            source_goal_lists=[quarterly_tasks, yearly_mirror],
            config=PiercingSyncConfig(
                note_path=note_path,
                source_paths=(quarterly_path, quarterly_path),
                proximity_days=30,
            ),
            today=today,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        weekly_source_lines = source_sync.source_lines
        quarterly_tasks, yearly_mirror = source_sync.updated_source_lists
        quarterly_changed, yearly_changed = source_sync.source_changes

        if quarterly_changed or yearly_changed:
            with locked_note(quarterly_path):
                quarterly_lines = self.note_store.read_or_create(
                    quarterly_path,
                    QUARTERLY_TEMPLATE_PATH,
                )
                propagate_source_sections(
                    config=SourceWriteConfig(path=quarterly_path),
                    sections=[
                        ("YEARLY", self._render_goal_lines(yearly_mirror)),
                        ("QUARTERLY", self._render_goal_lines(quarterly_tasks)),
                    ],
                    existing_lines=quarterly_lines,
                )

        return self.goal_store.apply(
            lines,
            [
                GoalSection(section="MONTHLY", lines=monthly_sync.mirror_lines),
                GoalSection(section="WEEKLY", lines=weekly_source_lines),
            ],
        )

    def sync_monthly_note(
        self,
        lines: list[str],
        *,
        note_path: str,
        window: MonthWindow,
    ) -> list[str]:
        month_start = window.start
        month_key = f"{window.year}-{window.month:02d}"
        prev_month_start = window.previous_start
        prev_path = journal_path(window.previous_filename)

        quarterly_mirror = self.goal_store.extract(
            lines,
            "QUARTERLY",
            horizon="quarterly",
            period_key=quarter_id(*quarter_of_date(month_start)),
        )
        monthly_tasks = load_source_tasks_with_carry_forward(
            lines,
            config=CarryForwardConfig(
                section="MONTHLY",
                horizon="monthly",
                period_key=month_key,
                current_id_key=month_start.isoformat(),
                previous_note_path=prev_path,
                previous_id_key=prev_month_start.isoformat(),
            ),
            carry_cache_store=self.carry_cache_store,
        )

        yearly_mirror, quarterly_tasks, quarterly_path, quarterly_lines = (
            load_quarterly_goals(month_start)
        )
        today = window.target_date
        quarterly_sync = sync_mirror_section(
            quarterly_tasks,
            quarterly_mirror,
            config=MirrorSyncConfig(
                mirror_section="QUARTERLY",
                source_path=quarterly_path,
                mirror_path=note_path,
                proximity_days=90,
            ),
            today=today,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        quarterly_tasks = quarterly_sync.source_tasks
        quarterly_changed = quarterly_sync.source_changed

        source_sync = sync_pierced_source_section(
            existing_tasks=monthly_tasks,
            source_goal_lists=[yearly_mirror],
            config=PiercingSyncConfig(
                note_path=note_path,
                source_paths=(quarterly_path,),
                proximity_days=90,
            ),
            today=today,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        monthly_source_lines = source_sync.source_lines
        [yearly_mirror] = source_sync.updated_source_lists
        [yearly_changed] = source_sync.source_changes

        if quarterly_changed or yearly_changed:
            propagate_source_sections(
                config=SourceWriteConfig(path=quarterly_path),
                sections=[
                    ("YEARLY", self._render_goal_lines(yearly_mirror)),
                    ("QUARTERLY", self._render_goal_lines(quarterly_tasks)),
                ],
                existing_lines=quarterly_lines,
            )

        return self.goal_store.apply(
            lines,
            [
                GoalSection(section="QUARTERLY", lines=quarterly_sync.mirror_lines),
                GoalSection(section="MONTHLY", lines=monthly_source_lines),
            ],
        )

    def sync_quarterly_note(
        self,
        lines: list[str],
        *,
        note_path: str,
        window: QuarterWindow,
    ) -> list[str]:
        yearly_mirror = self.goal_store.extract(
            lines,
            "YEARLY",
            horizon="yearly",
            period_key=str(window.year),
        )
        quarterly_tasks = load_source_tasks_with_carry_forward(
            lines,
            config=CarryForwardConfig(
                section="QUARTERLY",
                horizon="quarterly",
                period_key=quarter_id(window.year, window.quarter),
                current_id_key=quarter_id(window.year, window.quarter),
                previous_note_path=journal_path(window.previous_filename),
                previous_id_key=quarter_id(
                    window.previous_year, window.previous_quarter
                ),
            ),
            carry_cache_store=self.carry_cache_store,
        )

        yearly_path = journal_path(f"{window.year}.md")
        yearly_lines = self.note_store.read(yearly_path) or []
        yearly_tasks = self.goal_store.extract(
            yearly_lines,
            "YEARLY",
            horizon="yearly",
            period_key=str(window.year),
        )

        today = window.end
        yearly_sync = sync_mirror_section(
            yearly_tasks,
            yearly_mirror,
            config=MirrorSyncConfig(
                mirror_section="YEARLY",
                source_path=yearly_path,
                mirror_path=note_path,
                proximity_days=365,
            ),
            today=today,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        yearly_tasks = yearly_sync.source_tasks
        yearly_changed = yearly_sync.source_changed

        if yearly_changed:
            with locked_note(yearly_path):
                latest_yearly_lines = self.note_store.read(yearly_path) or yearly_lines
                propagate_source_sections(
                    config=SourceWriteConfig(path=yearly_path),
                    sections=[("YEARLY", self._render_goal_lines(yearly_tasks))],
                    existing_lines=latest_yearly_lines,
                )

        return self.goal_store.apply(
            lines,
            [
                GoalSection(section="YEARLY", lines=yearly_sync.mirror_lines),
                GoalSection(
                    section="QUARTERLY",
                    lines=self._render_goal_lines(quarterly_tasks),
                ),
            ],
        )

    def sync_yearly_note(self, lines: list[str], *, window: YearWindow) -> list[str]:
        yearly_tasks = self.goal_store.extract(
            lines,
            "YEARLY",
            horizon="yearly",
            period_key=str(window.year),
        )

        prev_tasks: list[Goal] = []
        prev_note_path = journal_path(window.previous_filename)
        prev_lines = self.note_store.read(prev_note_path)
        if prev_lines is not None:
            prev_tasks = self.goal_store.extract(
                prev_lines,
                "YEARLY",
                horizon="yearly",
                period_key=str(window.previous_year),
            )

        yearly_tasks, _ = carry_forward_with_tombstones(
            prev_tasks,
            yearly_tasks,
            str(window.year),
            "yearly",
            cache_store=self.carry_cache_store,
        )

        return self.goal_store.apply(
            lines,
            [
                GoalSection(
                    section="YEARLY",
                    lines=self._render_goal_lines(yearly_tasks),
                )
            ],
        )

    @staticmethod
    def _render_goal_lines(goals: list[Goal]) -> list[str]:
        return render_goal_lines(goals)

    @staticmethod
    def _render_goals_or_empty(
        subsection: str,
        goals: list[Goal],
        today: datetime.date | None = None,
    ) -> list[str]:
        from sync.goals.note_store import render_goals_or_empty

        return render_goals_or_empty(subsection, goals, today=today)
