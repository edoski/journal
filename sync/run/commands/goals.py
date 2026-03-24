"""Goals command handlers."""

from __future__ import annotations

import argparse
import datetime
import os
import re
from dataclasses import dataclass, field
from typing import Literal

from sync.constants import (
    DAILY_TEMPLATE_PATH,
    JOURNAL_DIR,
    MONTHLY_TEMPLATE_PATH,
    QUARTERLY_TEMPLATE_PATH,
    WEEKLY_TEMPLATE_PATH,
    YEARLY_TEMPLATE_PATH,
)
from sync.contracts.goals import Goal
from sync.dates import (
    iso_week_range,
    quarter_id,
    quarter_of_date,
    shift_month,
    shift_quarter,
)
from sync.goals.identity import canonical_goal_text, generate_goal_id
from sync.io import atomic_write_note, safe_read_file
from sync.notes.locking import locked_note
from sync.notes.markdown import normalize_header
from sync.notes.sections import ensure_note, goals_section_bounds, splice_goals_section
from sync.readers.goals import ensure_goal_ids, parse_goal_tasks
from sync.writers.goals import build_goals_block, render_goal_lines

GoalPeriod = Literal["daily", "weekly", "monthly", "quarterly", "yearly"]
_EMPTY_GOALS_RE = re.compile(
    r"^_No\s+\w+\s+goals\s+have\s+been\s+defined\s+yet\._$",
    flags=re.IGNORECASE,
)


@dataclass(frozen=True)
class GoalTarget:
    """Target note metadata for a goals add operation."""

    note_path: str
    template_path: str
    section: str
    horizon: str
    period_key: str


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
) -> GoalTarget:
    resolved = config or GoalCommandConfig()
    if period == "daily":
        day = today + datetime.timedelta(days=1 if use_next else 0)
        return GoalTarget(
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
        return GoalTarget(
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
        month_start = datetime.date(year, month, 1)
        return GoalTarget(
            note_path=os.path.join(resolved.journal_dir, f"{year}-{month:02d}.md"),
            template_path=resolved.monthly_template_path,
            section="MONTHLY",
            horizon="monthly",
            period_key=month_start.isoformat(),
        )

    if period == "quarterly":
        year, quarter_num = quarter_of_date(today)
        if use_next:
            year, quarter_num = shift_quarter(year, quarter_num, 1)
        qid = quarter_id(year, quarter_num)
        return GoalTarget(
            note_path=os.path.join(resolved.journal_dir, f"{qid}.md"),
            template_path=resolved.quarterly_template_path,
            section="QUARTERLY",
            horizon="quarterly",
            period_key=qid,
        )

    if period == "yearly":
        year = today.year + (1 if use_next else 0)
        return GoalTarget(
            note_path=os.path.join(resolved.journal_dir, f"{year}.md"),
            template_path=resolved.yearly_template_path,
            section="YEARLY",
            horizon="yearly",
            period_key=str(year),
        )

    raise ValueError(f"Unsupported period: {period}")


def _find_subsection_body_span(
    lines: list[str],
    goals_start: int,
    goals_end: int,
    section: str,
) -> tuple[int, int] | None:
    target_header = normalize_header(f"### {section}")
    for idx in range(goals_start + 1, goals_end):
        stripped = lines[idx].strip()
        if not stripped.startswith("### "):
            continue
        if normalize_header(lines[idx]) != target_header:
            continue
        body_end = goals_end
        for candidate in range(idx + 1, goals_end):
            if lines[candidate].strip().startswith("### "):
                body_end = candidate
                break
        return idx + 1, body_end
    return None


def _subsection_is_effectively_empty(lines: list[str]) -> bool:
    return all(
        not line.strip() or _EMPTY_GOALS_RE.match(line.strip()) for line in lines
    )


def _goal_line(body: str, goal_id: str) -> str:
    return render_goal_lines([Goal(id=goal_id, body=body, done=False)])[0]


def _update_note_lines(
    lines: list[str],
    *,
    target: GoalTarget,
    goal_text: str,
) -> tuple[list[str], str | None, bool]:
    updated = lines[:]
    goals_start, goals_end = goals_section_bounds(updated)
    goal_id = generate_goal_id(kind="manual")
    candidate_canonical = canonical_goal_text(goal_text)

    if goals_start == -1:
        block = build_goals_block([(target.section, [_goal_line(goal_text, goal_id)])])
        splice_goals_section(updated, block, insert_if_missing=True)
        return updated, goal_id, False

    span = _find_subsection_body_span(updated, goals_start, goals_end, target.section)
    if span is None:
        insertion: list[str] = []
        if goals_end > goals_start + 1 and updated[goals_end - 1].strip() != "":
            insertion.append("")
        insertion.append(f"### **{target.section}**")
        insertion.append(_goal_line(goal_text, goal_id))
        insertion.append("")
        updated[goals_end:goals_end] = insertion
        return updated, goal_id, False

    body_start, body_end = span
    existing_tasks = parse_goal_tasks(updated[body_start:body_end])
    existing_tasks = ensure_goal_ids(
        existing_tasks,
        horizon_key=target.horizon,
        period_key=target.period_key,
    )
    if any(task.canonical == candidate_canonical for task in existing_tasks):
        return lines, None, True

    new_line = _goal_line(goal_text, goal_id)
    if _subsection_is_effectively_empty(updated[body_start:body_end]):
        updated[body_start:body_end] = [new_line]
        return updated, goal_id, False

    insert_at = body_end
    while insert_at > body_start and updated[insert_at - 1].strip() == "":
        insert_at -= 1
    updated[insert_at:insert_at] = [new_line]
    return updated, goal_id, False


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
    if not os.path.exists(target.note_path) and not os.path.exists(
        target.template_path
    ):
        print(f"Error: required template not found: {target.template_path}")
        return 1

    try:
        with locked_note(target.note_path):
            ensure_note(target.note_path, target.template_path)
            existing_lines = safe_read_file(target.note_path)
            if existing_lines is None:
                print(f"Error: failed to read target note: {target.note_path}")
                return 1

            updated_lines, goal_id, duplicate = _update_note_lines(
                existing_lines,
                target=target,
                goal_text=text,
            )
            if duplicate:
                print(f"No-op: goal already exists in {target.section}.")
                print(f"  Path: {target.note_path}")
                return 0

            atomic_write_note(target.note_path, updated_lines)
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
