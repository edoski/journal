"""Daily-note goal synchronization flow."""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sync.application.goal_note_gateway import GoalNoteGateway
from sync.contracts.goals import GoalSection
from sync.contracts.reminders import ReminderRule
from sync.goals.daily_pipeline import (
    carry_forward_daily_tasks,
    parse_daily_goal_subsections,
)
from sync.goals.note_store import render_goals_or_empty
from sync.goals.identity import goal_id_kind
from sync.goals.period_pipeline import (
    PiercingSource,
    PiercingSyncConfig,
    sync_pierced_sources,
)
from sync.goals.reconcile import reconcile_goal_lists
from sync.goals.reminders import get_reminders_for_date
from sync.ports.cache import GoalCarryForwardCacheStore, GoalReconcileCacheStore
from sync.ports.goals import GoalStore
from sync.ports.notes import NoteStore
from sync.readers.goals import filter_by_proximity


@dataclass(frozen=True)
class DailyGoalNoteSync:
    """Synchronize the Goals block inside a daily note."""

    note_store: NoteStore
    goal_store: GoalStore
    gateway: GoalNoteGateway
    carry_cache_store: GoalCarryForwardCacheStore
    reconcile_cache_store: GoalReconcileCacheStore

    def sync(
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

        sources = self.gateway.load_daily_sources(day)
        updated_weekly_tasks, _, weekly_changed, _ = reconcile_goal_lists(
            sources.weekly_tasks,
            existing_weekly_tasks,
            sources.weekly_path,
            note_path,
            reconcile_cache_store=self.reconcile_cache_store,
        )

        filtered_weekly = filter_by_proximity(updated_weekly_tasks, 7, day)
        weekly_lines = render_goals_or_empty(
            "WEEKLY",
            filtered_weekly,
            today=day,
        )

        source_sync = sync_pierced_sources(
            existing_tasks=existing_daily_tasks,
            sources=[
                PiercingSource("MONTHLY", sources.monthly_path, sources.monthly_tasks),
                PiercingSource("YEARLY", sources.yearly_path, sources.yearly_tasks),
            ],
            config=PiercingSyncConfig(
                source_section="DAILY",
                note_path=note_path,
                proximity_days=7,
            ),
            today=day,
            reconcile_cache_store=self.reconcile_cache_store,
        )

        updated_monthly = source_sync.updated_tasks("MONTHLY")
        updated_yearly = source_sync.updated_tasks("YEARLY")
        monthly_changed = source_sync.changed("MONTHLY")
        yearly_changed = source_sync.changed("YEARLY")

        if weekly_changed or monthly_changed or yearly_changed:
            self.gateway.write_daily_sources(
                day,
                weekly_tasks=updated_weekly_tasks,
                monthly_tasks=updated_monthly if monthly_changed else None,
                yearly_tasks=updated_yearly if yearly_changed else None,
            )

        daily_source_lines = source_sync.source_lines

        return self.goal_store.apply(
            lines,
            [
                GoalSection(section="WEEKLY", lines=weekly_lines),
                GoalSection(section="DAILY", lines=daily_source_lines),
            ],
            insert_after_idx=yaml_end_idx,
        )
