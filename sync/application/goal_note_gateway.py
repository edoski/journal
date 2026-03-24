"""Application-layer gateway for goal note reads, writes, and path resolution."""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sync.constants import (
    MONTHLY_TEMPLATE_PATH,
    QUARTERLY_TEMPLATE_PATH,
    WEEKLY_TEMPLATE_PATH,
)
from sync.contracts.goals import Goal, GoalSection
from sync.dates import iso_week_range, quarter_id, quarter_of_date
from sync.ports.goals import GoalStore
from sync.ports.notes import NoteStore
from sync.periods.runtime import journal_path


@dataclass(frozen=True)
class DailyGoalSources:
    """Resolved source notes used to synchronize a daily note."""

    weekly_tasks: list[Goal]
    monthly_tasks: list[Goal]
    quarterly_tasks: list[Goal]
    yearly_tasks: list[Goal]
    weekly_path: str
    monthly_path: str
    quarterly_path: str


@dataclass(frozen=True)
class QuarterlyGoalSources:
    """Resolved quarterly note content used by weekly/monthly sync."""

    yearly_mirror: list[Goal]
    quarterly_tasks: list[Goal]
    path: str
    lines: list[str]


@dataclass
class GoalNoteGateway:
    """Port-backed gateway for loading and persisting goal note sections."""

    note_store: NoteStore
    goal_store: GoalStore

    def load_daily_sources(self, day: datetime.date) -> DailyGoalSources:
        week_start, _ = iso_week_range(day)
        weekly_path = journal_path(
            f"{week_start.isocalendar().year}-W{week_start.isocalendar().week:02d}.md"
        )
        monthly_start = datetime.date(day.year, day.month, 1)
        monthly_key = f"{monthly_start.year}-{monthly_start.month:02d}"
        monthly_path = journal_path(f"{monthly_key}.md")

        q_year, q_num = quarter_of_date(day)
        quarter_key = quarter_id(q_year, q_num)
        quarterly_path = journal_path(f"{quarter_key}.md")

        weekly_lines = self.note_store.read(weekly_path)
        weekly_tasks = (
            self.goal_store.extract(
                weekly_lines,
                "WEEKLY",
                horizon="weekly",
                period_key=week_start.isoformat(),
            )
            if weekly_lines is not None
            else []
        )

        monthly_lines = self.note_store.read_or_create(
            monthly_path,
            MONTHLY_TEMPLATE_PATH,
        )
        quarterly_lines = self.note_store.read_or_create(
            quarterly_path,
            QUARTERLY_TEMPLATE_PATH,
        )

        return DailyGoalSources(
            weekly_tasks=weekly_tasks,
            monthly_tasks=self.goal_store.extract(
                monthly_lines,
                "MONTHLY",
                horizon="monthly",
                period_key=monthly_key,
            ),
            quarterly_tasks=self.goal_store.extract(
                quarterly_lines,
                "QUARTERLY",
                horizon="quarterly",
                period_key=quarter_key,
            ),
            yearly_tasks=self.goal_store.extract(
                quarterly_lines,
                "YEARLY",
                horizon="yearly",
                period_key=str(q_year),
            ),
            weekly_path=weekly_path,
            monthly_path=monthly_path,
            quarterly_path=quarterly_path,
        )

    def write_daily_sources(
        self,
        day: datetime.date,
        *,
        weekly_tasks: list[Goal],
        monthly_tasks: list[Goal] | None = None,
        quarterly_tasks: list[Goal] | None = None,
        yearly_tasks: list[Goal] | None = None,
    ) -> None:
        weekly_path = journal_path(
            f"{day.isocalendar().year}-W{day.isocalendar().week:02d}.md"
        )
        weekly_lines = self.note_store.read_or_create(weekly_path, WEEKLY_TEMPLATE_PATH)
        existing_monthly = self.goal_store.extract(weekly_lines, "MONTHLY")
        self.goal_store.write(
            weekly_path,
            weekly_lines,
            [
                GoalSection(
                    section="MONTHLY",
                    lines=self._render_or_empty("MONTHLY", existing_monthly),
                ),
                GoalSection(section="WEEKLY", lines=self._render_goals(weekly_tasks)),
            ],
        )

        month_start = datetime.date(day.year, day.month, 1)
        if monthly_tasks is not None:
            monthly_path = journal_path(
                f"{month_start.year}-{month_start.month:02d}.md"
            )
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
                        lines=self._render_or_empty("QUARTERLY", existing_quarterly),
                    ),
                    GoalSection(
                        section="MONTHLY", lines=self._render_goals(monthly_tasks)
                    ),
                ],
            )

        if quarterly_tasks is not None or yearly_tasks is not None:
            q_year, q_num = quarter_of_date(day)
            quarter_path = journal_path(f"{quarter_id(q_year, q_num)}.md")
            quarterly_lines = self.note_store.read_or_create(
                quarter_path,
                QUARTERLY_TEMPLATE_PATH,
            )
            existing_yearly = self.goal_store.extract(quarterly_lines, "YEARLY")
            existing_quarterly_src = self.goal_store.extract(
                quarterly_lines, "QUARTERLY"
            )
            self.goal_store.write(
                quarter_path,
                quarterly_lines,
                [
                    GoalSection(
                        section="YEARLY",
                        lines=self._render_goals(yearly_tasks or existing_yearly),
                    ),
                    GoalSection(
                        section="QUARTERLY",
                        lines=self._render_goals(
                            quarterly_tasks or existing_quarterly_src
                        ),
                    ),
                ],
            )

    def load_quarterly_sources(
        self, month_start: datetime.date
    ) -> QuarterlyGoalSources:
        q_year, q_num = quarter_of_date(month_start)
        quarter_key = quarter_id(q_year, q_num)
        path = journal_path(f"{quarter_key}.md")
        lines = self.note_store.read_or_create(path, QUARTERLY_TEMPLATE_PATH)
        return QuarterlyGoalSources(
            yearly_mirror=self.goal_store.extract(
                lines,
                "YEARLY",
                horizon="yearly",
                period_key=str(q_year),
            ),
            quarterly_tasks=self.goal_store.extract(
                lines,
                "QUARTERLY",
                horizon="quarterly",
                period_key=quarter_key,
            ),
            path=path,
            lines=lines,
        )

    def _render_goals(self, goals: list[Goal]) -> list[str]:
        from sync.writers.goals import render_goal_lines

        return render_goal_lines(goals)

    def _render_or_empty(self, section: str, goals: list[Goal]) -> list[str]:
        from sync.goals.note_store import render_goals_or_empty

        return render_goals_or_empty(section, goals)
