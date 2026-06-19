"""Canonical goal note read/write helpers."""

from __future__ import annotations

import datetime
import re

from sync.contracts.goals import Goal, GoalAddResult, GoalWriteTarget
from sync.goals.identity import canonical_goal_text, generate_goal_id
from sync.notes.markdown import normalize_header
from sync.notes.sections import (
    extract_subsection_tasks,
    goals_section_bounds,
    splice_goals_section,
)
from sync.readers.goals import ensure_goal_ids, parse_goal_date, parse_goal_tasks
from sync.writers.goals import build_goals_block, render_goal_lines

EMPTY_SUBSECTION_MESSAGES: dict[str, str] = {
    "DAILY": "_No daily goals have been defined yet._",
    "WEEKLY": "_No weekly goals have been defined yet._",
    "MONTHLY": "_No monthly goals have been defined yet._",
    "YEARLY": "_No yearly goals have been defined yet._",
}
_EMPTY_GOALS_RE = re.compile(
    r"^_No\s+\w+\s+goals\s+have\s+been\s+defined\s+yet\._$",
    flags=re.IGNORECASE,
)


def empty_subsection_lines(subsection: str) -> list[str]:
    """Return canonical placeholder lines for an empty goal subsection."""
    message = EMPTY_SUBSECTION_MESSAGES.get(
        subsection.upper(), "_No goals have been defined yet._"
    )
    return ["", message]


def extract_goals(
    lines: list[str],
    subsection: str,
    *,
    horizon: str | None = None,
    period_key: str | None = None,
) -> list[Goal]:
    """Extract tasks from a goals subsection with optional ID normalization."""
    g_start, g_end = goals_section_bounds(lines)
    tasks = extract_subsection_tasks(lines, g_start, g_end, subsection)
    if horizon and period_key:
        tasks = ensure_goal_ids(tasks, horizon, period_key)
    return tasks


def render_goals_or_empty(
    subsection: str,
    goals: list[Goal],
    *,
    today: datetime.date | None = None,
) -> list[str]:
    """Render goals for a subsection, or canonical placeholder when empty."""
    if goals:
        return render_goal_lines(goals, today=today)
    return empty_subsection_lines(subsection)


def apply_goals_sections(
    lines: list[str],
    sections: list[tuple[str, list[str]]],
    *,
    insert_if_missing: bool = True,
    insert_after_idx: int | None = None,
) -> list[str]:
    """Return updated note lines with a rebuilt Goals block."""
    updated = lines[:]
    new_block = build_goals_block(sections)
    splice_goals_section(
        updated,
        new_block,
        insert_if_missing=insert_if_missing,
        insert_after_idx=insert_after_idx,
    )
    return updated


def add_goal_to_note(
    lines: list[str],
    *,
    target: GoalWriteTarget,
    goal_text: str,
    insert_after_idx: int | None = None,
) -> GoalAddResult:
    """Insert a goal into one subsection while preserving untouched lines."""
    updated = lines[:]
    goal_id = generate_goal_id(kind="manual")
    candidate_canonical = _canonical_goal_input(goal_text)
    rendered_goal_line = render_goal_lines(
        [Goal(id=goal_id, body=goal_text, done=False)]
    )[0]
    goals_start, goals_end = goals_section_bounds(updated)

    if goals_start == -1:
        updated = apply_goals_sections(
            updated,
            [(target.section, [rendered_goal_line])],
            insert_if_missing=True,
            insert_after_idx=insert_after_idx,
        )
        return GoalAddResult(updated_lines=updated, goal_id=goal_id, duplicate=False)

    span = _find_subsection_body_span(updated, goals_start, goals_end, target.section)
    if span is None:
        insertion = _build_missing_subsection_insertion(
            updated,
            goals_end,
            target.section,
            rendered_goal_line,
        )
        updated[goals_end:goals_end] = insertion
        return GoalAddResult(updated_lines=updated, goal_id=goal_id, duplicate=False)

    body_start, body_end = span
    existing_tasks = ensure_goal_ids(
        parse_goal_tasks(updated[body_start:body_end]),
        horizon_key=target.horizon,
        period_key=target.period_key,
    )
    if any(task.canonical == candidate_canonical for task in existing_tasks):
        return GoalAddResult(updated_lines=lines, goal_id=None, duplicate=True)

    if _subsection_is_effectively_empty(updated[body_start:body_end]):
        updated[body_start:body_end] = [rendered_goal_line]
        return GoalAddResult(updated_lines=updated, goal_id=goal_id, duplicate=False)

    insert_at = body_end
    while insert_at > body_start and updated[insert_at - 1].strip() == "":
        insert_at -= 1
    updated[insert_at:insert_at] = [rendered_goal_line]
    return GoalAddResult(updated_lines=updated, goal_id=goal_id, duplicate=False)


def _find_subsection_body_span(
    lines: list[str],
    goals_start: int,
    goals_end: int,
    section: str,
) -> tuple[int, int] | None:
    target_header = normalize_header(f"### {section}")
    for idx in range(goals_start + 1, goals_end):
        if not lines[idx].strip().startswith("### "):
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


def _canonical_goal_input(text: str) -> str:
    body = re.sub(r"\s*—\s*`(?:TODAY|LATE \+\d+d|\d+d)`\s*$", "", text)
    body, _, _, _ = parse_goal_date(body)
    return canonical_goal_text(body)


def _subsection_is_effectively_empty(lines: list[str]) -> bool:
    return all(
        not line.strip() or _EMPTY_GOALS_RE.match(line.strip()) for line in lines
    )


def _build_missing_subsection_insertion(
    lines: list[str],
    goals_end: int,
    section: str,
    rendered_goal_line: str,
) -> list[str]:
    insertion: list[str] = []
    if goals_end > 0 and lines[goals_end - 1].strip() != "":
        insertion.append("")
    insertion.append(f"### **{section}**")
    insertion.append(rendered_goal_line)
    insertion.append("")
    return insertion
