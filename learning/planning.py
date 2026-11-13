"""Planning overview: due and upcoming reviews, the daily plan, open work, exams
and Journal effort."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from learning import agenda, clock, progress, records
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


def _study_day(journal: dict[str, Any]) -> agenda.StudyDay:
    """A day takes new topics unless the Journal schedules no study window on it."""
    unscheduled = {
        entry["date"]
        for entry in journal.get("upcoming_schedule") or ()
        if not entry["study_windows"]
    }
    return lambda day: day.isoformat() not in unscheduled


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
    """The exam run-up: what is untaught or not recently solid, and the pace:
    untaught topics per day left that takes new topics, as the daily plan counts."""
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
    exam = progress.exam_plan(record)
    assert exam is not None
    study_days = agenda.new_days(
        today, agenda.last_new_day(exam), _settings(record), _study_day(journal)
    )
    if study_days > 0 and untaught:
        result["study_days"] = study_days
        result["pace"] = round(len(untaught) / study_days, 2)
    return compact(result, keep=("days_left",))


def _settings(record: dict[str, Any]) -> agenda.Settings:
    try:
        return agenda.settings(records.effective_preferences(record))
    except OSError:
        return agenda.settings(record["preferences"])


def _days(
    record: dict[str, Any], today: date, days: int, journal: dict[str, Any]
) -> dict[str, Any] | None:
    """The daily plan: its settings and each day that proposes something."""
    settings = _settings(record)
    exam = progress.exam_plan(record)
    left = (exam.day - today).days if exam is not None else 0
    ahead = left > 0
    horizon = min(MAX_DAYS, max(days, left))
    planned = agenda.plan_days(
        record, today, settings, horizon, study_day=_study_day(journal)
    )
    proposed = [day for day in planned[:days] if day["reviews"] or day["new"]]
    introduced = {topic for day in planned for topic in day["new"]}
    untaught = agenda.waiting(
        record, progress.standings(record), progress.path_order(record)
    )
    misfits = [key for key in untaught if key not in introduced] if ahead else []
    paused = progress.paused(record, today)
    if not proposed and not misfits and not paused:
        return None
    return compact(
        {
            "daily_topics": settings.budget,
            "final_review_days": (exam.day - exam.final).days if exam else None,
            "new_topics_on_weekends": settings.weekends,
            "paused": "the exam has passed; reviews wait for the next exam date"
            if paused
            else None,
            "days": proposed,
            "does_not_fit": misfits,
        }
    )


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
    current = record.get("path", {}).get("current")
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
            "current": current,
            "current_title": record["topics"][current].get("title")
            if current
            else None,
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
            "plan": _days(record, today, days, journal),
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
    """Reviews, the daily plan, open work, the week, exam run-ups and recorded effort.

    The Journal's schedule reaches the farthest exam ahead, so the plan paces new
    topics against its days off.
    """
    if type(days) is not int or not 1 <= days <= MAX_DAYS:
        raise ValueError(f"--days must be between 1 and {MAX_DAYS}")
    today = clock.today()
    loaded = [_load(target) for target in _targets(workspace, everywhere)]
    ahead = [
        left
        for _, record, _ in loaded
        if record is not None and (left := _days_left(record, today)) is not None
    ]
    near = any(0 <= left <= progress.RUNUP_DAYS for left in ahead)
    shown = max(days, progress.RUNUP_DAYS) if near else days
    horizon = min(MAX_DAYS, max([shown, *ahead]))
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
        "journal": _shown(journal, shown),
    }


def _shown(journal: dict[str, Any], days: int) -> dict[str, Any]:
    """The Journal summary with its schedule cut to the days the plan shows."""
    if not journal.get("upcoming_schedule"):
        return journal
    return {**journal, "upcoming_schedule": journal["upcoming_schedule"][:days]}
