"""Period-note goal synchronization flows."""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sync.application.goal_note_gateway import GoalNoteGateway
from sync.contracts.goals import Goal, GoalSection
from sync.goals.carry_forward import carry_forward_with_tombstones
from sync.goals.note_store import render_goals_or_empty
from sync.goals.period_pipeline import (
    CarryForwardConfig,
    MirrorSyncConfig,
    PiercingSource,
    PiercingSyncConfig,
    load_source_tasks_with_carry_forward,
    sync_mirror_section,
    sync_pierced_sources,
)
from sync.ports.cache import GoalCarryForwardCacheStore, GoalReconcileCacheStore
from sync.ports.goals import GoalStore
from sync.ports.notes import NoteStore
from sync.periods.windows import MonthWindow, WeekWindow, YearWindow


@dataclass(frozen=True)
class PeriodGoalNoteSync:
    """Synchronize weekly/monthly/yearly goal sections."""

    note_store: NoteStore
    goal_store: GoalStore
    gateway: GoalNoteGateway
    carry_cache_store: GoalCarryForwardCacheStore
    reconcile_cache_store: GoalReconcileCacheStore

    def sync_weekly_note(
        self,
        lines: list[str],
        *,
        note_path: str,
        window: WeekWindow,
    ) -> list[str]:
        month_start = datetime.date(window.start.year, window.start.month, 1)
        monthly_target, monthly_tasks = self.gateway.load_monthly_source(month_start)
        yearly_target, _, yearly_tasks = self.gateway.load_yearly_source_for_year(
            month_start.year,
            create=True,
        )
        monthly_mirror = self.goal_store.extract(
            lines,
            "MONTHLY",
            horizon="monthly",
            period_key=monthly_target.period_key,
        )
        previous_lines = self.note_store.read(
            self.gateway.note_path(window.previous_filename)
        )
        weekly_tasks = load_source_tasks_with_carry_forward(
            lines,
            config=CarryForwardConfig(
                section="WEEKLY",
                horizon="weekly",
                period_key=f"{window.year}-W{window.week_num:02d}",
                current_id_key=window.start.isoformat(),
                previous_lines=previous_lines,
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
                source_path=monthly_target.note_path,
                mirror_path=note_path,
                proximity_days=30,
            ),
            today=today,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        monthly_tasks = monthly_sync.source_tasks
        monthly_changed = monthly_sync.source_changed

        if monthly_changed:
            self.gateway.write_monthly_source(month_start, monthly_tasks)

        source_sync = sync_pierced_sources(
            existing_tasks=weekly_tasks,
            sources=[
                PiercingSource(
                    "YEARLY",
                    yearly_target.note_path,
                    yearly_tasks,
                ),
            ],
            config=PiercingSyncConfig(
                source_section="WEEKLY",
                note_path=note_path,
                proximity_days=30,
            ),
            today=today,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        weekly_source_lines = source_sync.source_lines
        yearly_tasks = source_sync.updated_tasks("YEARLY")
        yearly_changed = source_sync.changed("YEARLY")

        if yearly_changed:
            self.gateway.write_yearly_source(month_start.year, yearly_tasks)

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
        month_key = f"{window.year}-{window.month:02d}"
        previous_lines = self.note_store.read(
            self.gateway.note_path(window.previous_filename)
        )
        yearly_mirror = self.goal_store.extract(
            lines,
            "YEARLY",
            horizon="yearly",
            period_key=str(window.year),
        )
        monthly_tasks = load_source_tasks_with_carry_forward(
            lines,
            config=CarryForwardConfig(
                section="MONTHLY",
                horizon="monthly",
                period_key=month_key,
                current_id_key=month_key,
                previous_lines=previous_lines,
                previous_id_key=f"{window.previous_year}-{window.previous_month:02d}",
            ),
            carry_cache_store=self.carry_cache_store,
        )

        yearly_target, _, yearly_tasks = self.gateway.load_yearly_source_for_year(
            window.year,
            create=True,
        )
        today = window.target_date
        yearly_sync = sync_mirror_section(
            yearly_tasks,
            yearly_mirror,
            config=MirrorSyncConfig(
                mirror_section="YEARLY",
                source_path=yearly_target.note_path,
                mirror_path=note_path,
                proximity_days=365,
            ),
            today=today,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        yearly_tasks = yearly_sync.source_tasks
        yearly_changed = yearly_sync.source_changed

        if yearly_changed:
            self.gateway.write_yearly_source(window.year, yearly_tasks)

        return self.goal_store.apply(
            lines,
            [
                GoalSection(section="YEARLY", lines=yearly_sync.mirror_lines),
                GoalSection(
                    section="MONTHLY",
                    lines=render_goals_or_empty("MONTHLY", monthly_tasks),
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
        prev_note_path = self.gateway.note_path(window.previous_filename)
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
                    lines=render_goals_or_empty("YEARLY", yearly_tasks),
                )
            ],
        )
