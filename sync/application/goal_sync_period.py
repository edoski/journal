"""Period-note goal synchronization flows."""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sync.application.goal_note_gateway import GoalNoteGateway
from sync.constants import MONTHLY_TEMPLATE_PATH, QUARTERLY_TEMPLATE_PATH
from sync.contracts.goals import Goal, GoalSection
from sync.goals.carry_forward import carry_forward_with_tombstones
from sync.goals.period_pipeline import (
    CarryForwardConfig,
    MirrorSyncConfig,
    PiercingSyncConfig,
    load_source_tasks_with_carry_forward,
    sync_mirror_section,
    sync_pierced_source_section,
)
from sync.notes.locking import locked_note
from sync.ports.cache import GoalCarryForwardCacheStore, GoalReconcileCacheStore
from sync.ports.goals import GoalStore
from sync.ports.notes import NoteStore
from sync.periods.runtime import journal_path
from sync.periods.windows import MonthWindow, QuarterWindow, WeekWindow, YearWindow


@dataclass(frozen=True)
class PeriodGoalNoteSync:
    """Synchronize weekly/monthly/quarterly/yearly goal sections."""

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
        monthly_path = journal_path(f"{month_start.year}-{month_start.month:02d}.md")
        monthly_lines = self.note_store.read_or_create(
            monthly_path,
            MONTHLY_TEMPLATE_PATH,
        )
        monthly_tasks = self.goal_store.extract(
            monthly_lines,
            "MONTHLY",
            horizon="monthly",
            period_key=month_start.isoformat(),
        )

        quarterly_sources = self.gateway.load_quarterly_sources(month_start)
        monthly_mirror = self.goal_store.extract(
            lines,
            "MONTHLY",
            horizon="monthly",
            period_key=month_start.isoformat(),
        )
        previous_lines = self.note_store.read(journal_path(window.previous_filename))
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
                self.goal_store.write(
                    monthly_path,
                    monthly_lines,
                    [
                        GoalSection(
                            section="QUARTERLY",
                            lines=self._render_goals_or_empty(
                                "QUARTERLY",
                                existing_quarterly,
                            ),
                        ),
                        GoalSection(
                            section="MONTHLY",
                            lines=self._render_goals_or_empty("MONTHLY", monthly_tasks),
                        ),
                    ],
                )

        source_sync = sync_pierced_source_section(
            existing_tasks=weekly_tasks,
            source_goal_lists=[
                quarterly_sources.quarterly_tasks,
                quarterly_sources.yearly_mirror,
            ],
            config=PiercingSyncConfig(
                source_section="WEEKLY",
                note_path=note_path,
                source_paths=(quarterly_sources.path, quarterly_sources.path),
                proximity_days=30,
            ),
            today=today,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        weekly_source_lines = source_sync.source_lines
        quarterly_tasks, yearly_mirror = source_sync.updated_source_lists
        quarterly_changed, yearly_changed = source_sync.source_changes

        if quarterly_changed or yearly_changed:
            with locked_note(quarterly_sources.path):
                quarterly_lines = self.note_store.read_or_create(
                    quarterly_sources.path,
                    QUARTERLY_TEMPLATE_PATH,
                )
                self.goal_store.write(
                    quarterly_sources.path,
                    quarterly_lines,
                    [
                        GoalSection(
                            section="YEARLY",
                            lines=self._render_goals_or_empty("YEARLY", yearly_mirror),
                        ),
                        GoalSection(
                            section="QUARTERLY",
                            lines=self._render_goals_or_empty(
                                "QUARTERLY",
                                quarterly_tasks,
                            ),
                        ),
                    ],
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
        previous_lines = self.note_store.read(journal_path(window.previous_filename))
        quarterly_mirror = self.goal_store.extract(
            lines,
            "QUARTERLY",
            horizon="quarterly",
            period_key=self._quarter_key(month_start),
        )
        monthly_tasks = load_source_tasks_with_carry_forward(
            lines,
            config=CarryForwardConfig(
                section="MONTHLY",
                horizon="monthly",
                period_key=month_key,
                current_id_key=month_start.isoformat(),
                previous_lines=previous_lines,
                previous_id_key=window.previous_start.isoformat(),
            ),
            carry_cache_store=self.carry_cache_store,
        )

        quarterly_sources = self.gateway.load_quarterly_sources(month_start)
        today = window.target_date
        quarterly_sync = sync_mirror_section(
            quarterly_sources.quarterly_tasks,
            quarterly_mirror,
            config=MirrorSyncConfig(
                mirror_section="QUARTERLY",
                source_path=quarterly_sources.path,
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
            source_goal_lists=[quarterly_sources.yearly_mirror],
            config=PiercingSyncConfig(
                source_section="MONTHLY",
                note_path=note_path,
                source_paths=(quarterly_sources.path,),
                proximity_days=90,
            ),
            today=today,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        monthly_source_lines = source_sync.source_lines
        [yearly_mirror] = source_sync.updated_source_lists
        [yearly_changed] = source_sync.source_changes

        if quarterly_changed or yearly_changed:
            with locked_note(quarterly_sources.path):
                quarterly_lines = self.note_store.read_or_create(
                    quarterly_sources.path,
                    QUARTERLY_TEMPLATE_PATH,
                )
                self.goal_store.write(
                    quarterly_sources.path,
                    quarterly_lines,
                    [
                        GoalSection(
                            section="YEARLY",
                            lines=self._render_goals_or_empty("YEARLY", yearly_mirror),
                        ),
                        GoalSection(
                            section="QUARTERLY",
                            lines=self._render_goals_or_empty(
                                "QUARTERLY",
                                quarterly_tasks,
                            ),
                        ),
                    ],
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
        previous_lines = self.note_store.read(journal_path(window.previous_filename))
        quarterly_tasks = load_source_tasks_with_carry_forward(
            lines,
            config=CarryForwardConfig(
                section="QUARTERLY",
                horizon="quarterly",
                period_key=self._quarter_key(window.start),
                current_id_key=self._quarter_key(window.start),
                previous_lines=previous_lines,
                previous_id_key=f"{window.previous_year}-Q{window.previous_quarter}",
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
                self.goal_store.write(
                    yearly_path,
                    latest_yearly_lines,
                    [
                        GoalSection(
                            section="YEARLY",
                            lines=self._render_goals_or_empty("YEARLY", yearly_tasks),
                        )
                    ],
                )

        return self.goal_store.apply(
            lines,
            [
                GoalSection(section="YEARLY", lines=yearly_sync.mirror_lines),
                GoalSection(
                    section="QUARTERLY",
                    lines=self._render_goals_or_empty("QUARTERLY", quarterly_tasks),
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
                    lines=self._render_goals_or_empty("YEARLY", yearly_tasks),
                )
            ],
        )

    @staticmethod
    def _quarter_key(day: datetime.date) -> str:
        quarter = ((day.month - 1) // 3) + 1
        return f"{day.year}-Q{quarter}"

    @staticmethod
    def _render_goals_or_empty(subsection: str, goals: list[Goal]) -> list[str]:
        from sync.goals.note_store import render_goals_or_empty

        return render_goals_or_empty(subsection, goals)
