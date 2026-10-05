"""Planning overview: due and upcoming reviews, open work, exams and Journal effort."""

from __future__ import annotations

from datetime import date, timedelta
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
EXAM_GAP_DAYS = 8
Loaded = tuple[Workspace, dict[str, Any] | None, str | None]


def _journal(vault: Path, days: int, today: date, horizon: int) -> dict[str, Any]:
    try:
        summary = journal_summary(vault, days=days, today=today, horizon=horizon)
    except (ValueError, OSError) as error:
        return {"error": str(error)}
    summary.pop("daily", None)
    return summary


def _minutes(activity: str, journal: dict[str, Any]) -> int | float | None:
    if "error" in journal or not journal.get("available_day_count"):
        return None
    recorded = journal.get("by_activity", {}).get(activity, {})
    minutes = recorded.get("study_minutes", 0)
    return int(minutes) if float(minutes).is_integer() else minutes


def _effort(activity: str | None, journal: dict[str, Any]) -> dict[str, Any] | None:
    """Recorded study for the course's Journal activity; unknown stays absent."""
    if activity is None:
        return None
    result: dict[str, Any] = {"activity": activity}
    minutes = _minutes(activity, journal)
    if minutes is None:
        return result
    result["study_minutes"] = minutes
    result["sessions"] = (
        journal.get("by_activity", {}).get(activity, {}).get("session_count", 0)
    )
    return result


def _week(
    record: dict[str, Any], today: date, week_journal: dict[str, Any]
) -> dict[str, Any] | None:
    result = progress.week(record, today)
    activity = record.get("journal")
    minutes = _minutes(activity, week_journal) if activity else None
    if minutes is not None:
        result["minutes"] = minutes
    return result or None


def _study_days(journal: dict[str, Any], exam_day: date) -> int:
    """Days with a scheduled study window from today until a week before the exam."""
    if "error" in journal:
        return 0
    last = (exam_day - timedelta(days=EXAM_GAP_DAYS)).isoformat()
    return sum(
        1
        for entry in journal.get("upcoming_schedule") or ()
        if entry["date"] <= last and entry["study_windows"]
    )


def _days_left(record: dict[str, Any], today: date) -> int | None:
    when = record.get("exam", {}).get("date")
    return (date.fromisoformat(when) - today).days if when else None


def _in_runup(record: dict[str, Any], today: date) -> bool:
    days_left = _days_left(record, today)
    return days_left is not None and 0 <= days_left <= progress.RUNUP_DAYS


def _runup(
    record: dict[str, Any],
    today: date,
    order: list[str],
    levels: dict[str, dict[str, Any]],
    journal: dict[str, Any],
) -> dict[str, Any] | None:
    """The exam run-up: what is untaught or not recently solid, and the pace."""
    days_left = _days_left(record, today)
    if days_left is None or not _in_runup(record, today):
        return None
    behind = progress.unready(record, today)
    untaught = [key for key in order if levels[key]["level"] == "new"]
    result: dict[str, Any] = {
        "days_left": days_left,
        "not_introduced": untaught,
        "unready": [key for key in order if key in behind],
    }
    study_days = _study_days(journal, today + timedelta(days=days_left))
    if study_days:
        result["study_days"] = study_days
        result["pace"] = round(len(untaught) / study_days, 2)
    return compact(result, keep=("days_left",))


def _course(
    workspace: Workspace,
    record: dict[str, Any],
    today: date,
    days: int,
    journals: tuple[dict[str, Any], dict[str, Any]],
) -> dict[str, Any]:
    journal, week_journal = journals
    order = progress.path_order(record)
    levels = progress.standings(record)
    due = progress.due(record, today, levels=levels, order=order)
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
            "week": _week(record, today, week_journal),
            "runup": _runup(record, today, order, levels, journal),
        }
    )


def _targets(workspace: Workspace | None, everywhere: bool) -> list[Workspace]:
    if everywhere:
        return every_course(workspace)
    if workspace is None:
        raise ValueError("plan needs a study workspace, or --all")
    return [workspace]


def _load(workspace: Workspace) -> Loaded:
    try:
        return workspace, records.load(workspace), None
    except (ValueError, OSError) as error:
        return workspace, None, str(error)


def plan(
    workspace: Workspace | None, vault: Path, *, everywhere: bool, days: int
) -> dict[str, Any]:
    """Reviews, open work, the week, exam run-ups and recorded effort."""
    if type(days) is not int or not 1 <= days <= MAX_DAYS:
        raise ValueError(f"--days must be between 1 and {MAX_DAYS}")
    today = clock.today()
    loaded = [_load(target) for target in _targets(workspace, everywhere)]
    near = any(
        _in_runup(record, today) for _, record, _ in loaded if record is not None
    )
    horizon = max(days, progress.RUNUP_DAYS) if near else days
    journal = _journal(vault, days, today, horizon)
    week_journal = (
        journal
        if days == progress.WEEK_DAYS
        else _journal(vault, progress.WEEK_DAYS, today, 1)
    )
    return {
        "today": today.isoformat(),
        "courses": [
            _course(target, record, today, days, (journal, week_journal))
            if record is not None
            else {"workspace": str(target.directory), "error": error}
            for target, record, error in loaded
        ],
        "journal": journal,
    }
