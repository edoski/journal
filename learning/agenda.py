"""The daily plan: which reviews and which new topics each day, within a budget.

Pure and read-only. The plan projects the record forward from today: each day
takes the reviews ``progress.due`` ranks first, up to the budget left after the
day's new topics, and assumes every planned review is answered ``solid``, so a
later day's reviews are the ladder's next steps. It never stores anything; the
next save and the next plan start again from what happened.

New topics follow the path order, skipping any that already has a review date.
With an exam ahead they are paced from today
so the last is introduced ``NEW_BEFORE_FINAL`` days before the final review,
counting only the days that take new topics (weekdays, weekends when the
learner wants them, never a day the Journal marks off). With no exam ahead the
plan proposes one new topic a day when the reviews leave room.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
import math
from typing import Any

from learning import preferences, progress

DAILY_TOPICS = 8
NEW_ON_WEEKENDS = False
NEW_BEFORE_FINAL = 4
SATURDAY = 5

StudyDay = Callable[[date], bool]


@dataclass(frozen=True)
class Settings:
    """The learner's budget in topics a day, reviews and new topics together,
    and whether new topics are proposed on Saturday and Sunday."""

    budget: int = DAILY_TOPICS
    weekends: bool = NEW_ON_WEEKENDS


def settings(values: dict[str, str]) -> Settings:
    """The plan's settings from the effective preferences, defaults where unset."""
    return Settings(
        budget=preferences.count(values, preferences.DAILY_TOPICS, DAILY_TOPICS),
        weekends=preferences.flag(values, preferences.WEEKEND_TOPICS, NEW_ON_WEEKENDS),
    )


def _every_day(_: date) -> bool:
    return True


def last_new_day(exam: progress.Exam) -> date:
    """The day by which the path's new topics should all be introduced."""
    return exam.final - timedelta(days=NEW_BEFORE_FINAL)


@dataclass
class _Projection:
    """The record as the plan expects it to stand, one day at a time."""

    record: dict[str, Any]
    levels: dict[str, dict[str, Any]]
    streaks: dict[str, int]
    exam: progress.Exam | None

    def set_due(self, topic: str, base: date, days: int) -> None:
        expected = progress.review_day(base, days, self.exam)
        due = progress.kept(base, expected, self.exam)
        entry = dict(self.record["topics"][topic])
        review = {
            name: value
            for name, value in entry.get("review", {}).items()
            if name != "due"
        }
        if due is not None:
            review["due"] = due.isoformat()
        entry["review"] = review
        self.record["topics"][topic] = entry

    def reviewed(self, topic: str, day: date) -> None:
        self.streaks[topic] += 1
        self.levels[topic] = {**self.levels[topic], "lapsed": False}
        self.set_due(topic, day, progress.interval("solid", self.streaks[topic]))

    def introduced(self, topic: str, day: date) -> None:
        self.streaks[topic] = 0
        self.levels[topic] = {**self.levels[topic], "level": "introduced"}
        self.set_due(topic, day, progress.FIRST_RETRIEVAL_DAYS)


def _new_count(
    untaught: int,
    day: date,
    exam: progress.Exam | None,
    takes_new: Callable[[date], bool],
    due_today: int,
    budget: int,
) -> int:
    if not untaught or not takes_new(day):
        return 0
    if exam is None or exam.day <= day:
        return 1 if due_today < budget else 0
    last = last_new_day(exam)
    if day > last:
        last = exam.final - timedelta(days=1)
    left = sum(
        takes_new(day + timedelta(days=offset))
        for offset in range((last - day).days + 1)
    )
    return min(budget, math.ceil(untaught / left)) if left > 0 else 0


def plan_days(
    record: dict[str, Any],
    today: date,
    plan: Settings,
    days: int,
    *,
    study_day: StudyDay = _every_day,
) -> list[dict[str, Any]]:
    """The plan for ``days`` days from today: ``{date, reviews, new}`` per day.

    ``reviews`` and ``new`` are topic handles; together they never exceed the
    budget. The exam day, and every day after an exam not yet past, propose
    nothing. ``study_day`` says whether a day takes new topics.
    """
    order = progress.path_order(record)
    levels = progress.standings(record)
    replayed = progress.replays(record)
    exam = progress.exam_plan(record)
    projection = _Projection(
        {**record, "topics": dict(record["topics"])},
        dict(levels),
        {key: item.streak for key, item in replayed.items()},
        exam,
    )
    untaught = [
        key
        for key in order
        if levels[key]["level"] == "new"
        and "due" not in record["topics"][key].get("review", {})
    ]

    def takes_new(day: date) -> bool:
        return study_day(day) and (plan.weekends or day.weekday() < SATURDAY)

    result: list[dict[str, Any]] = []
    for offset in range(days):
        day = today + timedelta(days=offset)
        if exam is not None and today <= exam.day <= day:
            result.append({"date": day.isoformat(), "reviews": [], "new": []})
            continue
        due = progress.due(
            projection.record, day, levels=projection.levels, order=order
        )
        count = _new_count(len(untaught), day, exam, takes_new, len(due), plan.budget)
        new, untaught = untaught[:count], untaught[count:]
        reviews = [item["topic"] for item in due[: plan.budget - len(new)]]
        for topic in reviews:
            projection.reviewed(topic, day)
        for topic in new:
            projection.introduced(topic, day)
        result.append({"date": day.isoformat(), "reviews": reviews, "new": new})
    return result
