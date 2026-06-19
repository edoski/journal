"""Goal note target resolution for daily and period goal flows."""

from __future__ import annotations

import datetime
import os
from dataclasses import dataclass, field
from typing import Literal

from sync.constants import (
    DAILY_TEMPLATE_PATH,
    JOURNAL_DIR,
    MONTHLY_TEMPLATE_PATH,
    WEEKLY_TEMPLATE_PATH,
    YEARLY_TEMPLATE_PATH,
)
from sync.contracts.cache import GoalHorizon
from sync.contracts.goals import GoalWriteTarget
from sync.dates import iso_week_range, shift_month

GoalPeriod = Literal["daily", "weekly", "monthly", "yearly"]


@dataclass(frozen=True)
class GoalPathConfig:
    """Filesystem roots and templates for resolving goal notes."""

    journal_dir: str = field(default_factory=lambda: JOURNAL_DIR)
    daily_template_path: str = field(default_factory=lambda: DAILY_TEMPLATE_PATH)
    weekly_template_path: str = field(default_factory=lambda: WEEKLY_TEMPLATE_PATH)
    monthly_template_path: str = field(default_factory=lambda: MONTHLY_TEMPLATE_PATH)
    yearly_template_path: str = field(default_factory=lambda: YEARLY_TEMPLATE_PATH)


@dataclass(frozen=True)
class GoalNoteTarget:
    """Resolved goal note identity for reads, writes, and source relationships."""

    note_path: str
    template_path: str
    section: str
    horizon: GoalHorizon
    period_key: str
    filename: str

    def as_write_target(self) -> GoalWriteTarget:
        return GoalWriteTarget(
            note_path=self.note_path,
            template_path=self.template_path,
            section=self.section,
            horizon=self.horizon,
            period_key=self.period_key,
        )


def _target(
    *,
    filename: str,
    template_path: str,
    section: str,
    horizon: GoalHorizon,
    period_key: str,
    config: GoalPathConfig,
) -> GoalNoteTarget:
    return GoalNoteTarget(
        note_path=goal_note_path(filename, config),
        template_path=template_path,
        section=section,
        horizon=horizon,
        period_key=period_key,
        filename=filename,
    )


def goal_note_path(filename: str, config: GoalPathConfig) -> str:
    """Resolve a journal note filename to an absolute goal note path."""
    return os.path.join(config.journal_dir, filename)


def daily_goal_target(day: datetime.date, config: GoalPathConfig) -> GoalNoteTarget:
    return _target(
        filename=f"{day.isoformat()}.md",
        template_path=config.daily_template_path,
        section="DAILY",
        horizon="daily",
        period_key=day.isoformat(),
        config=config,
    )


def weekly_goal_target(day: datetime.date, config: GoalPathConfig) -> GoalNoteTarget:
    week_start, _ = iso_week_range(day)
    year, week_num, _ = week_start.isocalendar()
    return _target(
        filename=f"{year}-W{week_num:02d}.md",
        template_path=config.weekly_template_path,
        section="WEEKLY",
        horizon="weekly",
        period_key=week_start.isoformat(),
        config=config,
    )


def monthly_goal_target(day: datetime.date, config: GoalPathConfig) -> GoalNoteTarget:
    month_start = datetime.date(day.year, day.month, 1)
    month_key = f"{month_start.year}-{month_start.month:02d}"
    return _target(
        filename=f"{month_key}.md",
        template_path=config.monthly_template_path,
        section="MONTHLY",
        horizon="monthly",
        period_key=month_key,
        config=config,
    )


def yearly_goal_target(day: datetime.date, config: GoalPathConfig) -> GoalNoteTarget:
    return yearly_goal_target_for_year(day.year, config)


def yearly_goal_target_for_year(
    year: int,
    config: GoalPathConfig,
) -> GoalNoteTarget:
    return _target(
        filename=f"{year}.md",
        template_path=config.yearly_template_path,
        section="YEARLY",
        horizon="yearly",
        period_key=str(year),
        config=config,
    )


def resolve_goal_write_target(
    period: GoalPeriod,
    *,
    use_next: bool,
    today: datetime.date,
    config: GoalPathConfig,
) -> GoalWriteTarget:
    """Resolve the canonical destination for adding one goal."""
    if period == "daily":
        day = today + datetime.timedelta(days=1 if use_next else 0)
        return daily_goal_target(day, config).as_write_target()

    if period == "weekly":
        day = today + datetime.timedelta(days=7 if use_next else 0)
        return weekly_goal_target(day, config).as_write_target()

    if period == "monthly":
        year, month = (
            shift_month(today.year, today.month, 1)
            if use_next
            else (today.year, today.month)
        )
        return monthly_goal_target(
            datetime.date(year, month, 1), config
        ).as_write_target()

    if period == "yearly":
        year = today.year + (1 if use_next else 0)
        return yearly_goal_target_for_year(year, config).as_write_target()

    raise ValueError(f"Unsupported period: {period}")
