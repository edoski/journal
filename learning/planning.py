"""Planning overview: due and upcoming reviews, open work, exams and Journal effort."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from learning import clock, progress, records
from learning.retrieval import (
    DUE_LIMIT,
    compact,
    every_course,
    exam,
    last_activity,
    selected_task,
)
from learning.workspace import Workspace
from sync.study.context import journal_summary

MAX_DAYS = 366


def _journal(vault: Path, days: int, today: date) -> dict[str, Any]:
    try:
        summary = journal_summary(vault, days=days, today=today, horizon=days)
    except (ValueError, OSError) as error:
        return {"error": str(error)}
    summary.pop("daily", None)
    return summary


def _effort(activity: str | None, journal: dict[str, Any]) -> dict[str, Any] | None:
    """Recorded study for the course's Journal activity; unknown stays absent."""
    if activity is None:
        return None
    result: dict[str, Any] = {"activity": activity}
    if "error" in journal or not journal.get("available_day_count"):
        return result
    recorded = journal.get("by_activity", {}).get(activity, {})
    minutes = recorded.get("study_minutes", 0)
    result["study_minutes"] = int(minutes) if float(minutes).is_integer() else minutes
    result["sessions"] = recorded.get("session_count", 0)
    return result


def _course(
    workspace: Workspace, today: date, days: int, journal: dict[str, Any]
) -> dict[str, Any]:
    try:
        record = records.load(workspace)
    except (ValueError, OSError) as error:
        return {"workspace": str(workspace.directory), "error": str(error)}
    order = progress.path_order(record)
    due = progress.due(record, today, order=order)
    key, task = selected_task(record)
    countdown = exam(record, today)
    return compact(
        {
            "workspace": str(workspace.directory),
            "title": record.get("title"),
            "exam": compact(
                {"date": countdown.get("date"), "days_left": countdown.get("days_left")}
            )
            if countdown
            else None,
            "due": due[:DUE_LIMIT],
            "due_more": max(0, len(due) - DUE_LIMIT) or None,
            "upcoming": progress.upcoming(record, today, days, order=order),
            "current": record.get("path", {}).get("current"),
            "task": compact(
                {"key": key, "title": task.get("title"), "step": task.get("step")}
            )
            if key
            else None,
            "open_tasks": len(record["tasks"]),
            "last_activity": last_activity(record, today),
            "journal": _effort(record.get("journal"), journal),
        }
    )


def _targets(workspace: Workspace | None, everywhere: bool) -> list[Workspace]:
    if everywhere:
        return every_course(workspace)
    if workspace is None:
        raise ValueError("plan needs a study workspace, or --all")
    return [workspace]


def plan(
    workspace: Workspace | None, vault: Path, *, everywhere: bool, days: int
) -> dict[str, Any]:
    """Reviews, open work and recorded effort for this course or every course."""
    if type(days) is not int or not 1 <= days <= MAX_DAYS:
        raise ValueError(f"--days must be between 1 and {MAX_DAYS}")
    today = clock.today()
    journal = _journal(vault, days, today)
    return {
        "today": today.isoformat(),
        "courses": [
            _course(target, today, days, journal)
            for target in _targets(workspace, everywhere)
        ],
        "journal": journal,
    }
