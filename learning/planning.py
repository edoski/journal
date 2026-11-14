"""Planning overview: due and upcoming reviews, the daily plan, open work, exams
and Journal effort."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Any

from learning import agenda, capacity, clock, progress, records
from learning import workspace as workspaces
from learning.retrieval import (
    DUE_LIMIT,
    compact,
    every_course,
    exam,
    last_activity,
    last_studied,
    selected_task,
    tonight,
)
from learning.workspace import Workspace
from sync.study.context import journal_summary

MAX_DAYS = agenda.MAX_DAYS
Failure = dict[str, str]
Loaded = tuple[Workspace, dict[str, Any] | None, Failure | None]


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
    week: capacity.Capacity,
) -> dict[str, Any] | None:
    """The exam run-up: what is untaught or not recently solid, and the days
    he studies before the exam."""
    days_left = _days_left(record, today)
    if days_left is None or not _in_runup(record, today):
        return None
    behind = progress.unready(record, today)
    result: dict[str, Any] = {
        "days_left": days_left,
        "not_introduced": [key for key in order if levels[key]["level"] == "new"],
        "unready": [key for key in order if key in behind],
        "study_days": sum(
            week.studies(today + timedelta(days=offset)) for offset in range(days_left)
        ),
    }
    return compact(result, keep=("days_left", "study_days"))


def _days(
    record: dict[str, Any],
    today: date,
    days: int,
    planned: list[dict[str, Any]],
    misfits: list[str],
) -> dict[str, Any] | None:
    """The daily plan: each day that proposes something, and what no longer fits."""
    exam = progress.exam_plan(record)
    proposed = [day for day in planned[:days] if day["reviews"] or day["new"]]
    if not proposed and not misfits:
        return None
    return compact(
        {
            "final_review_days": (exam.day - exam.final).days if exam else None,
            "days": proposed,
            "does_not_fit": misfits,
        }
    )


def _upcoming(
    planned: agenda.When, today: date, days: int, order: list[str]
) -> list[dict[str, Any]]:
    """Reviews the daily plan puts after today and within ``days`` days."""
    end = today + timedelta(days=days)
    rank = {key: index for index, key in enumerate(order)}
    items = [
        {"topic": key, "planned": day.isoformat()}
        for key, day in planned.reviews.items()
        if today < day <= end
    ]
    items.sort(key=lambda item: (item["planned"], rank.get(item["topic"], len(rank))))
    return items


def _course(
    workspace: Workspace,
    record: dict[str, Any],
    today: date,
    days: int,
    journals: tuple[dict[str, Any], dict[str, Any]],
    joint: tuple[agenda.Plan, capacity.Capacity],
) -> dict[str, Any]:
    journal, week_journal = journals
    together, week = joint
    name = str(workspace.directory)
    order = progress.path_order(record)
    levels = progress.standings(record)
    planned = together.when(name, today, bool(week.study_weekdays))
    due, _ = tonight(progress.due(record, today, levels=levels, order=order), planned)
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
            "upcoming": _upcoming(planned, today, days, order),
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
            "last_studied": last_studied(record, today),
            "journal": _effort(record.get("journal"), journal),
            "week": _week(record, today, week_journal),
            "runup": _runup(record, today, order, levels, week),
            "plan": _days(
                record,
                today,
                days,
                together.days[name],
                together.does_not_fit.get(name, []),
            ),
        }
    )


def _load(workspace: Workspace) -> Loaded:
    try:
        return workspace, records.load(workspace), None
    except (ValueError, OSError) as error:
        return workspace, None, _failure(error)


def _failure(error: ValueError | OSError) -> Failure:
    """A course that cannot be read: the error, and what stopped it as
    ``denied`` (no permission), ``damaged`` (not a valid record) or
    ``unreadable`` (any other I/O failure)."""
    reason = error.__cause__ if isinstance(error.__cause__, OSError) else error
    if isinstance(reason, PermissionError):
        problem = "denied"
    elif isinstance(reason, OSError) and not isinstance(reason, ValueError):
        problem = "unreadable"
    else:
        problem = "damaged"
    return {"error": str(error), "problem": problem}


def plan(
    workspace: Workspace | None, vault: Path, *, everywhere: bool, days: int
) -> dict[str, Any]:
    """Reviews, the daily plan, open work, the week, exam run-ups and recorded effort.

    The daily plan is every course's together, so even one course's plan is
    read from all of them: how much fits a day is the learner's, learned from
    every course's record (``capacity``), and is shared between them.
    """
    if type(days) is not int or not 1 <= days <= MAX_DAYS:
        raise ValueError(f"--days must be between 1 and {MAX_DAYS}")
    if workspace is None and not everywhere:
        raise ValueError("plan needs a study workspace, or --all")
    today = clock.today()
    loaded = [_load(target) for target in every_course(workspace)]
    if not everywhere:
        assert workspace is not None
        if not any(target.directory == workspace.directory for target, _, _ in loaded):
            loaded.append(_load(workspace))
    readable = {
        str(target.directory): record
        for target, record, _ in loaded
        if record is not None
    }
    ahead = [
        left
        for record in readable.values()
        if (left := _days_left(record, today)) is not None
    ]
    near = any(0 <= left <= progress.RUNUP_DAYS for left in ahead)
    shown = max(days, progress.RUNUP_DAYS) if near else days
    horizon = min(MAX_DAYS, max([shown, *(left + 1 for left in ahead)]))
    week = capacity.of(readable.values(), today)
    together = agenda.plan(readable, today, horizon, week)
    journal = _journal(vault, days, today, shown)
    week_journal = (
        journal
        if days == progress.WEEK_DAYS
        else _journal(vault, progress.WEEK_DAYS, today, 1)
    )
    targets = (
        loaded
        if everywhere
        else [
            item
            for item in loaded
            if workspace is not None and item[0].directory == workspace.directory
        ]
    )
    courses = [
        _course(
            target,
            record,
            today,
            days,
            (journal, week_journal),
            (together, week),
        )
        if record is not None
        else {"workspace": str(target.directory), **(error or {})}
        for target, record, error in targets
    ]
    if everywhere:
        courses += [
            {"workspace": str(directory), **_failure(error)}
            for directory, error in workspaces.unreadable()
        ]
    titles = {
        str(target.directory): record.get("title")
        for target, record, _ in loaded
        if record is not None
    }
    return compact(
        {
            "today": today.isoformat(),
            "capacity": week.summary(),
            "courses": sorted(courses, key=lambda entry: str(entry["workspace"])),
            "does_not_fit": [
                {"workspace": name, "title": titles.get(name), "topics": topics}
                for name, topics in together.does_not_fit.items()
            ],
            "journal": _shown(journal, shown),
        },
        keep=("courses",),
    )


def _shown(journal: dict[str, Any], days: int) -> dict[str, Any]:
    """The Journal summary with its schedule cut to the days the plan shows."""
    if not journal.get("upcoming_schedule"):
        return journal
    return {**journal, "upcoming_schedule": journal["upcoming_schedule"][:days]}
