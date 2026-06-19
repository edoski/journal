"""Facade for daily and period goal synchronization flows."""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field

from sync.application.goal_note_gateway import GoalNoteGateway
from sync.application.goal_sync_daily import DailyGoalNoteSync
from sync.application.goal_sync_period import PeriodGoalNoteSync
from sync.contracts.reminders import ReminderRule
from sync.ports.cache import GoalCarryForwardCacheStore, GoalReconcileCacheStore
from sync.ports.goals import GoalStore
from sync.ports.notes import NoteStore
from sync.periods.windows import MonthWindow, WeekWindow, YearWindow


@dataclass
class GoalSyncService:
    """Own the public goal-sync API while delegating to focused flows."""

    note_store: NoteStore
    goal_store: GoalStore
    carry_cache_store: GoalCarryForwardCacheStore
    reconcile_cache_store: GoalReconcileCacheStore
    gateway: GoalNoteGateway = field(init=False)
    daily_flow: DailyGoalNoteSync = field(init=False)
    period_flow: PeriodGoalNoteSync = field(init=False)

    def __post_init__(self) -> None:
        gateway = GoalNoteGateway(
            note_store=self.note_store,
            goal_store=self.goal_store,
        )
        self.gateway = gateway
        self.daily_flow = DailyGoalNoteSync(
            note_store=self.note_store,
            goal_store=self.goal_store,
            gateway=gateway,
            carry_cache_store=self.carry_cache_store,
            reconcile_cache_store=self.reconcile_cache_store,
        )
        self.period_flow = PeriodGoalNoteSync(
            note_store=self.note_store,
            goal_store=self.goal_store,
            gateway=gateway,
            carry_cache_store=self.carry_cache_store,
            reconcile_cache_store=self.reconcile_cache_store,
        )

    def sync_daily_note(
        self,
        lines: list[str],
        *,
        day: datetime.date,
        note_path: str,
        yaml_end_idx: int,
        reminder_rules: list[ReminderRule],
    ) -> list[str]:
        return self.daily_flow.sync(
            lines,
            day=day,
            note_path=note_path,
            yaml_end_idx=yaml_end_idx,
            reminder_rules=reminder_rules,
        )

    def sync_weekly_note(
        self,
        lines: list[str],
        *,
        note_path: str,
        window: WeekWindow,
    ) -> list[str]:
        return self.period_flow.sync_weekly_note(
            lines,
            note_path=note_path,
            window=window,
        )

    def sync_monthly_note(
        self,
        lines: list[str],
        *,
        note_path: str,
        window: MonthWindow,
    ) -> list[str]:
        return self.period_flow.sync_monthly_note(
            lines,
            note_path=note_path,
            window=window,
        )

    def sync_yearly_note(self, lines: list[str], *, window: YearWindow) -> list[str]:
        return self.period_flow.sync_yearly_note(lines, window=window)
