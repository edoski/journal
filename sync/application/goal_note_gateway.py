"""Application-layer gateway for goal note reads, writes, and path resolution."""

from __future__ import annotations

import datetime
import os
from dataclasses import dataclass

from sync.contracts.goals import Goal, GoalAddResult, GoalSection, GoalWriteTarget
from sync.goals.note_store import add_goal_to_note, render_goals_or_empty
from sync.goals.targets import (
    GoalNoteTarget,
    GoalPathConfig,
    goal_note_path,
    monthly_goal_target,
    quarterly_goal_target,
    weekly_goal_target,
    yearly_goal_target_for_year,
)
from sync.notes.locking import locked_note
from sync.ports.goals import GoalStore
from sync.ports.notes import NoteStore


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
    path_config: GoalPathConfig = GoalPathConfig()

    def add_goal(
        self,
        target: GoalWriteTarget,
        goal_text: str,
        *,
        insert_after_idx: int | None = None,
    ) -> GoalAddResult:
        """Create a note if needed, insert a goal, and persist the update."""
        if not os.path.exists(target.note_path) and not os.path.exists(
            target.template_path
        ):
            raise FileNotFoundError(target.template_path)

        with locked_note(target.note_path):
            lines = self.note_store.read_or_create(
                target.note_path, target.template_path
            )
            result = add_goal_to_note(
                lines,
                target=target,
                goal_text=goal_text,
                insert_after_idx=insert_after_idx,
            )
            if not result.duplicate:
                self.note_store.write(target.note_path, result.updated_lines)
            return result

    def read_target(self, target: GoalNoteTarget) -> list[str] | None:
        """Read a goal note without creating it."""
        return self.note_store.read(target.note_path)

    def note_path(self, filename: str) -> str:
        """Resolve a journal note filename through the goal path configuration."""
        return goal_note_path(filename, self.path_config)

    def read_or_create_target(self, target: GoalNoteTarget) -> list[str]:
        """Read a goal note, creating it from its template when missing."""
        return self.note_store.read_or_create(target.note_path, target.template_path)

    def extract_target(
        self,
        lines: list[str],
        target: GoalNoteTarget,
    ) -> list[Goal]:
        """Extract the source section for a resolved goal note target."""
        return self.goal_store.extract(
            lines,
            target.section,
            horizon=target.horizon,
            period_key=target.period_key,
        )

    def write_target_sections(
        self,
        target: GoalNoteTarget,
        sections: list[GoalSection],
    ) -> list[str]:
        """Persist rendered goal sections to a target under the note lock."""
        with locked_note(target.note_path):
            lines = self.read_or_create_target(target)
            return self.goal_store.write(target.note_path, lines, sections)

    def load_daily_sources(self, day: datetime.date) -> DailyGoalSources:
        weekly_target = weekly_goal_target(day, self.path_config)
        monthly_target = monthly_goal_target(day, self.path_config)
        quarterly_target = quarterly_goal_target(day, self.path_config)
        yearly_target = yearly_goal_target_for_year(day.year, self.path_config)

        weekly_lines = self.read_target(weekly_target)
        weekly_tasks = (
            self.extract_target(weekly_lines, weekly_target)
            if weekly_lines is not None
            else []
        )

        monthly_lines = self.read_or_create_target(monthly_target)
        quarterly_lines = self.read_or_create_target(quarterly_target)

        return DailyGoalSources(
            weekly_tasks=weekly_tasks,
            monthly_tasks=self.extract_target(monthly_lines, monthly_target),
            quarterly_tasks=self.extract_target(quarterly_lines, quarterly_target),
            yearly_tasks=self.extract_target(quarterly_lines, yearly_target),
            weekly_path=weekly_target.note_path,
            monthly_path=monthly_target.note_path,
            quarterly_path=quarterly_target.note_path,
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
        weekly_target = weekly_goal_target(day, self.path_config)
        weekly_lines = self.read_or_create_target(weekly_target)
        existing_monthly = self.goal_store.extract(weekly_lines, "MONTHLY")
        self.write_target_sections(
            weekly_target,
            [
                GoalSection(
                    section="MONTHLY",
                    lines=render_goals_or_empty("MONTHLY", existing_monthly),
                ),
                GoalSection(
                    section="WEEKLY",
                    lines=render_goals_or_empty("WEEKLY", weekly_tasks),
                ),
            ],
        )

        if monthly_tasks is not None:
            self.write_monthly_source(day, monthly_tasks)

        if quarterly_tasks is not None or yearly_tasks is not None:
            self.write_quarterly_source(
                day,
                quarterly_tasks=quarterly_tasks,
                yearly_tasks=yearly_tasks,
            )

    def load_quarterly_sources(
        self, month_start: datetime.date
    ) -> QuarterlyGoalSources:
        target = quarterly_goal_target(month_start, self.path_config)
        yearly_target = yearly_goal_target_for_year(month_start.year, self.path_config)
        lines = self.read_or_create_target(target)
        return QuarterlyGoalSources(
            yearly_mirror=self.extract_target(lines, yearly_target),
            quarterly_tasks=self.extract_target(lines, target),
            path=target.note_path,
            lines=lines,
        )

    def load_monthly_source(
        self, day: datetime.date
    ) -> tuple[GoalNoteTarget, list[Goal]]:
        """Load the monthly source section for a date."""
        target = monthly_goal_target(day, self.path_config)
        lines = self.read_or_create_target(target)
        return target, self.extract_target(lines, target)

    def load_yearly_source_for_year(
        self,
        year: int,
        *,
        create: bool = False,
    ) -> tuple[GoalNoteTarget, list[str], list[Goal]]:
        """Load the yearly source note and extracted YEARLY goals."""
        target = yearly_goal_target_for_year(year, self.path_config)
        lines = (
            self.read_or_create_target(target) if create else self.read_target(target)
        )
        resolved_lines = lines or []
        return target, resolved_lines, self.extract_target(resolved_lines, target)

    def write_monthly_source(
        self,
        day: datetime.date,
        monthly_tasks: list[Goal],
    ) -> list[str]:
        """Persist MONTHLY source tasks while preserving the QUARTERLY mirror."""
        target = monthly_goal_target(day, self.path_config)
        with locked_note(target.note_path):
            lines = self.read_or_create_target(target)
            existing_quarterly = self.goal_store.extract(lines, "QUARTERLY")
            return self.goal_store.write(
                target.note_path,
                lines,
                [
                    GoalSection(
                        section="QUARTERLY",
                        lines=render_goals_or_empty("QUARTERLY", existing_quarterly),
                    ),
                    GoalSection(
                        section="MONTHLY",
                        lines=render_goals_or_empty("MONTHLY", monthly_tasks),
                    ),
                ],
            )

    def write_quarterly_source(
        self,
        day: datetime.date,
        *,
        quarterly_tasks: list[Goal] | None = None,
        yearly_tasks: list[Goal] | None = None,
    ) -> list[str]:
        """Persist QUARTERLY/YEARLY sections in a quarterly note."""
        target = quarterly_goal_target(day, self.path_config)
        with locked_note(target.note_path):
            lines = self.read_or_create_target(target)
            existing_yearly = self.goal_store.extract(lines, "YEARLY")
            existing_quarterly = self.goal_store.extract(lines, "QUARTERLY")
            resolved_yearly = existing_yearly if yearly_tasks is None else yearly_tasks
            resolved_quarterly = (
                existing_quarterly if quarterly_tasks is None else quarterly_tasks
            )
            return self.goal_store.write(
                target.note_path,
                lines,
                [
                    GoalSection(
                        section="YEARLY",
                        lines=render_goals_or_empty("YEARLY", resolved_yearly),
                    ),
                    GoalSection(
                        section="QUARTERLY",
                        lines=render_goals_or_empty("QUARTERLY", resolved_quarterly),
                    ),
                ],
            )

    def write_yearly_source(self, year: int, yearly_tasks: list[Goal]) -> list[str]:
        """Persist YEARLY source tasks to a yearly note."""
        target = yearly_goal_target_for_year(year, self.path_config)
        with locked_note(target.note_path):
            lines = self.read_target(target) or []
            return self.goal_store.write(
                target.note_path,
                lines,
                [
                    GoalSection(
                        section="YEARLY",
                        lines=render_goals_or_empty("YEARLY", yearly_tasks),
                    )
                ],
            )
