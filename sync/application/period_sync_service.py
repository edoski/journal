"""Port-driven service for weekly/monthly/quarterly/yearly sync."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Any, cast

from sync.constants import (
    MONTHLY_TEMPLATE_PATH,
    QUARTERLY_TEMPLATE_PATH,
    WEEKLY_TEMPLATE_PATH,
    YEARLY_TEMPLATE_PATH,
)
from sync.contracts.goals import GoalSection
from sync.goals.carry_forward import carry_forward_with_tombstones
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
from sync.goals.reconcile import load_quarterly_goals
from sync.notes.locking import locked_note
from sync.ports.daily_aggregates import DailyAggregateSource
from sync.ports.goals import GoalStore
from sync.ports.notes import NoteStore
from sync.periods.engine import (
    build_monthly_metrics,
    build_quarterly_metrics,
    build_weekly_metrics,
    build_yearly_metrics,
)
from sync.periods.runtime import (
    journal_path,
    maybe_cleanup_previous,
    open_period_note,
    write_note_metrics,
)
from sync.periods.windows import MonthWindow, QuarterWindow, WeekWindow, YearWindow
from sync.metrics import compute_period_metrics
from sync.dates import daterange, quarter_id, quarter_of_date


@dataclass(frozen=True)
class PeriodSyncService:
    """Synchronize periodic notes through ports and shared engines."""

    note_store: NoteStore
    aggregate_source: DailyAggregateSource
    goal_store: GoalStore

    def _load_range(
        self,
        start_date: datetime.date,
        end_date: datetime.date,
    ) -> dict[datetime.date, dict[str, Any]]:
        dates = list(daterange(start_date, end_date))
        data = self.aggregate_source.load_for_dates(dates)
        return cast(dict[datetime.date, dict[str, Any]], data)

    def _load_dates(
        self,
        dates: list[datetime.date],
    ) -> dict[datetime.date, dict[str, Any]]:
        data = self.aggregate_source.load_for_dates(dates)
        return cast(dict[datetime.date, dict[str, Any]], data)

    def _load_prior_metrics(
        self,
        offsets: range,
        bounds_for_offset,
    ) -> list[dict[str, Any]]:
        metrics_list: list[dict[str, Any]] = []
        for offset in offsets:
            start_date, end_date = bounds_for_offset(offset)
            dates = list(daterange(start_date, end_date))
            daily_data = self._load_dates(dates)
            metrics_list.append(compute_period_metrics(dates, daily_data))
        return metrics_list

    def sync_week(
        self,
        window: WeekWindow,
        note_path: str,
        *,
        cleanup_previous: bool,
    ) -> None:
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

        with open_period_note(
            note_path, WEEKLY_TEMPLATE_PATH, self.note_store
        ) as lines:
            week_dates = list(daterange(window.start, window.end))
            daily_data = self._load_dates(week_dates)

            prev_week_dates = list(
                daterange(window.previous_start, window.previous_end)
            )
            prev_daily_data = self._load_dates(prev_week_dates)

            prior_week_metrics = self._load_prior_metrics(
                range(4, 0, -1),
                window.prior_bounds,
            )

            metrics_block = build_weekly_metrics(
                window.start,
                window.end,
                daily_data,
                prev_daily_data,
                window.previous_label,
                prior_week_metrics=prior_week_metrics,
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
            )

            today = datetime.date.today()
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
            )
            monthly_tasks = monthly_sync.source_tasks
            monthly_changed = monthly_sync.source_changed

            if monthly_changed:
                with locked_note(monthly_path):
                    monthly_lines = self.note_store.read_or_create(
                        monthly_path,
                        MONTHLY_TEMPLATE_PATH,
                    )
                    existing_quarterly = self.goal_store.extract(
                        monthly_lines, "QUARTERLY"
                    )
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

            lines = self.goal_store.apply(
                lines,
                [
                    GoalSection(section="MONTHLY", lines=monthly_sync.mirror_lines),
                    GoalSection(section="WEEKLY", lines=weekly_source_lines),
                ],
            )

            write_note_metrics(note_path, lines, metrics_block, self.note_store)

        maybe_cleanup_previous(
            enabled=cleanup_previous,
            previous_note_path=journal_path(window.previous_filename),
            module_name="sync.periods.weekly",
            module_args=["--date", window.previous_start.isoformat(), "--no-cleanup"],
        )

    def sync_month(
        self,
        window: MonthWindow,
        note_path: str,
        *,
        cleanup_previous: bool,
    ) -> None:
        with open_period_note(
            note_path, MONTHLY_TEMPLATE_PATH, self.note_store
        ) as lines:
            month_start, month_end = window.start, window.end

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
            )

            yearly_mirror, quarterly_tasks, quarterly_path, quarterly_lines = (
                load_quarterly_goals(month_start)
            )
            today = datetime.date.today()
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

            lines = self.goal_store.apply(
                lines,
                [
                    GoalSection(section="QUARTERLY", lines=quarterly_sync.mirror_lines),
                    GoalSection(section="MONTHLY", lines=monthly_source_lines),
                ],
            )

            month_dates = list(daterange(month_start, month_end))
            daily_data = self._load_dates(month_dates)

            prev_month_dates = list(
                daterange(window.previous_start, window.previous_end)
            )
            prev_daily_data = self._load_dates(prev_month_dates)

            prior_month_metrics = self._load_prior_metrics(
                range(3, 0, -1),
                window.prior_bounds,
            )

            metrics_block = build_monthly_metrics(
                month_start,
                month_end,
                window.week_ranges,
                daily_data,
                prev_daily_data,
                window.current_label,
                window.previous_label,
                prior_month_metrics=prior_month_metrics,
            )

            write_note_metrics(note_path, lines, metrics_block, self.note_store)

        maybe_cleanup_previous(
            enabled=cleanup_previous,
            previous_note_path=journal_path(window.previous_filename),
            module_name="sync.periods.monthly",
            module_args=[
                "--month",
                f"{window.previous_year}-{window.previous_month:02d}",
                "--no-cleanup",
            ],
        )

    def sync_quarter(self, window: QuarterWindow, note_path: str) -> None:
        with open_period_note(
            note_path, QUARTERLY_TEMPLATE_PATH, self.note_store
        ) as lines:
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
            )

            yearly_path = journal_path(f"{window.year}.md")
            yearly_lines = self.note_store.read(yearly_path) or []
            yearly_tasks = self.goal_store.extract(
                yearly_lines,
                "YEARLY",
                horizon="yearly",
                period_key=str(window.year),
            )

            today = datetime.date.today()
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
            )
            yearly_tasks = yearly_sync.source_tasks
            yearly_changed = yearly_sync.source_changed

            if yearly_changed:
                with locked_note(yearly_path):
                    latest_yearly_lines = (
                        self.note_store.read(yearly_path) or yearly_lines
                    )
                    propagate_source_sections(
                        config=SourceWriteConfig(path=yearly_path),
                        sections=[("YEARLY", self._render_goal_lines(yearly_tasks))],
                        existing_lines=latest_yearly_lines,
                    )

            lines = self.goal_store.apply(
                lines,
                [
                    GoalSection(section="YEARLY", lines=yearly_sync.mirror_lines),
                    GoalSection(
                        section="QUARTERLY",
                        lines=self._render_goal_lines(quarterly_tasks),
                    ),
                ],
            )

            daily_data = self._load_range(window.start, window.end)
            prev_daily_data = self._load_range(
                window.previous_start, window.previous_end
            )
            prior_quarter_metrics = self._load_prior_metrics(
                range(4, 0, -1),
                window.prior_bounds,
            )

            metrics_block = build_quarterly_metrics(
                window.start,
                window.end,
                window.month_ranges,
                daily_data,
                prev_daily_data,
                window.previous_year,
                window.previous_quarter,
                prior_quarter_metrics=prior_quarter_metrics,
            )

            write_note_metrics(note_path, lines, metrics_block, self.note_store)

    def sync_year(self, window: YearWindow, note_path: str) -> None:
        with open_period_note(
            note_path, YEARLY_TEMPLATE_PATH, self.note_store
        ) as lines:
            yearly_tasks = self.goal_store.extract(
                lines,
                "YEARLY",
                horizon="yearly",
                period_key=str(window.year),
            )

            prev_tasks: list = []
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
            )

            lines = self.goal_store.apply(
                lines,
                [
                    GoalSection(
                        section="YEARLY",
                        lines=self._render_goal_lines(yearly_tasks),
                    )
                ],
            )

            daily_data = self._load_range(window.start, window.end)
            prev_daily_data = self._load_range(
                window.previous_start, window.previous_end
            )
            prior_year_metrics = self._load_prior_metrics(
                range(3, 0, -1),
                window.prior_bounds,
            )

            metrics_block = build_yearly_metrics(
                window.year,
                window.start,
                window.end,
                window.quarter_ranges,
                window.previous_quarter_ranges,
                daily_data,
                prev_daily_data,
                prior_year_metrics=prior_year_metrics,
            )

            write_note_metrics(note_path, lines, metrics_block, self.note_store)

    @staticmethod
    def _render_goal_lines(goals: list) -> list[str]:
        from sync.writers.goals import render_goal_lines

        return render_goal_lines(goals)

    @staticmethod
    def _render_goals_or_empty(subsection: str, goals: list, today=None) -> list[str]:
        from sync.goals.note_store import render_goals_or_empty

        return render_goals_or_empty(subsection, goals, today=today)
