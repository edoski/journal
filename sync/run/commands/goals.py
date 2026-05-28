"""Goals command handlers."""

from __future__ import annotations

import argparse
import datetime
import os
from dataclasses import dataclass, field
from typing import Literal

from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.goal_note_gateway import GoalNoteGateway
from sync.constants import (
    DAILY_TEMPLATE_PATH,
    JOURNAL_DIR,
    MONTHLY_TEMPLATE_PATH,
    QUARTERLY_TEMPLATE_PATH,
    WEEKLY_TEMPLATE_PATH,
    YEARLY_TEMPLATE_PATH,
)
from sync.contracts.goals import GoalWriteTarget
from sync.dates import (
    iso_week_range,
    quarter_id,
    quarter_of_date,
    shift_month,
    shift_quarter,
)

GoalPeriod = Literal["daily", "weekly", "monthly", "quarterly", "yearly"]


@dataclass(frozen=True)
class GoalCommandConfig:
    """Static filesystem/template configuration for goals commands."""

    journal_dir: str = field(default_factory=lambda: JOURNAL_DIR)
    daily_template_path: str = field(default_factory=lambda: DAILY_TEMPLATE_PATH)
    weekly_template_path: str = field(default_factory=lambda: WEEKLY_TEMPLATE_PATH)
    monthly_template_path: str = field(default_factory=lambda: MONTHLY_TEMPLATE_PATH)
    quarterly_template_path: str = field(
        default_factory=lambda: QUARTERLY_TEMPLATE_PATH
    )
    yearly_template_path: str = field(default_factory=lambda: YEARLY_TEMPLATE_PATH)


def _today() -> datetime.date:
    return datetime.date.today()


def _resolve_target(
    period: GoalPeriod,
    *,
    use_next: bool,
    today: datetime.date,
    config: GoalCommandConfig | None = None,
) -> GoalWriteTarget:
    resolved = config or GoalCommandConfig()
    if period == "daily":
        day = today + datetime.timedelta(days=1 if use_next else 0)
        return GoalWriteTarget(
            note_path=os.path.join(resolved.journal_dir, f"{day.isoformat()}.md"),
            template_path=resolved.daily_template_path,
            section="DAILY",
            horizon="daily",
            period_key=day.isoformat(),
        )

    if period == "weekly":
        anchor = today + datetime.timedelta(days=7 if use_next else 0)
        year, week_num, _ = anchor.isocalendar()
        week_start, _ = iso_week_range(anchor)
        return GoalWriteTarget(
            note_path=os.path.join(resolved.journal_dir, f"{year}-W{week_num:02d}.md"),
            template_path=resolved.weekly_template_path,
            section="WEEKLY",
            horizon="weekly",
            period_key=week_start.isoformat(),
        )

    if period == "monthly":
        year, month = (
            shift_month(today.year, today.month, 1)
            if use_next
            else (today.year, today.month)
        )
        return GoalWriteTarget(
            note_path=os.path.join(resolved.journal_dir, f"{year}-{month:02d}.md"),
            template_path=resolved.monthly_template_path,
            section="MONTHLY",
            horizon="monthly",
            period_key=f"{year}-{month:02d}",
        )

    if period == "quarterly":
        year, quarter_num = quarter_of_date(today)
        if use_next:
            year, quarter_num = shift_quarter(year, quarter_num, 1)
        qid = quarter_id(year, quarter_num)
        return GoalWriteTarget(
            note_path=os.path.join(resolved.journal_dir, f"{qid}.md"),
            template_path=resolved.quarterly_template_path,
            section="QUARTERLY",
            horizon="quarterly",
            period_key=qid,
        )

    if period == "yearly":
        year = today.year + (1 if use_next else 0)
        return GoalWriteTarget(
            note_path=os.path.join(resolved.journal_dir, f"{year}.md"),
            template_path=resolved.yearly_template_path,
            section="YEARLY",
            horizon="yearly",
            period_key=str(year),
        )

    raise ValueError(f"Unsupported period: {period}")


def cmd_goals_add(
    args: argparse.Namespace,
    *,
    config: GoalCommandConfig | None = None,
) -> int:
    resolved = config or GoalCommandConfig()
    text = args.text.strip()
    if not text:
        print("Error: goal text cannot be empty.")
        return 1

    use_next = bool(args.next)
    target = _resolve_target(
        args.period,
        use_next=use_next,
        today=_today(),
        config=resolved,
    )
    gateway = GoalNoteGateway(
        note_store=MarkdownNoteStore(),
        goal_store=MarkdownGoalStore(),
    )

    try:
        result = gateway.add_goal(target, text)
        if result.duplicate:
            print(f"No-op: goal already exists in {target.section}.")
            print(f"  Path: {target.note_path}")
            return 0
        goal_id = result.goal_id
    except FileNotFoundError:
        print(f"Error: required template not found: {target.template_path}")
        return 1
    except TimeoutError as exc:
        print(f"Error: could not lock note for write: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to write goal note: {exc}")
        return 1

    if goal_id is None:
        print("Error: failed to assign goal id.")
        return 1

    print("Added goal:")
    print(f"  Path: {target.note_path}")
    print(f"  Section: {target.section}")
    print(f"  Goal ID: {goal_id}")
    return 0
