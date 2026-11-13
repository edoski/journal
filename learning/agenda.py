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
# More new topics than this in a day cannot be taught well; the rest do not fit.
NEW_PER_DAY = 3
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


def waiting(
    record: dict[str, Any], levels: dict[str, dict[str, Any]], order: list[str]
) -> list[str]:
    """Path topics still to introduce: never taught and without a review date."""
    return [
        key
        for key in order
        if levels[key]["level"] == "new"
        and "due" not in record["topics"][key].get("review", {})
    ]


def takes_new(day: date, plan: Settings, study_day: StudyDay) -> bool:
    """Whether a day takes new topics: a study day, on a weekday unless the
    learner wants them on weekends too."""
    return study_day(day) and (plan.weekends or day.weekday() < SATURDAY)


def new_days(first: date, last: date, plan: Settings, study_day: StudyDay) -> int:
    """How many days from ``first`` to ``last`` take new topics."""
    return sum(
        takes_new(first + timedelta(days=offset), plan, study_day)
        for offset in range((last - first).days + 1)
    )


@dataclass
class _Projection:
    """The record as the plan expects it to stand, one day at a time."""

    record: dict[str, Any]
    levels: dict[str, dict[str, Any]]
    streaks: dict[str, int]
    exam: progress.Exam | None

    def set_due(self, topic: str, base: date, days: int, *, solid: bool) -> None:
        expected = progress.review_day(base, days, self.exam)
        due = progress.kept(base, expected, self.exam, solid=solid)
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
        step = progress.interval("solid", self.streaks[topic])
        self.set_due(topic, day, step, solid=True)

    def introduced(self, topic: str, day: date) -> None:
        self.streaks[topic] = 0
        self.levels[topic] = {**self.levels[topic], "level": "introduced"}
        self.set_due(topic, day, progress.FIRST_RETRIEVAL_DAYS, solid=False)


def _new_count(
    untaught: int,
    day: date,
    exam: progress.Exam | None,
    plan: Settings,
    study_day: StudyDay,
    due_today: int,
) -> int:
    if not untaught or not takes_new(day, plan, study_day):
        return 0
    if exam is None or exam.day <= day:
        return 1 if due_today < plan.budget else 0
    last = last_new_day(exam)
    if day > last:
        last = exam.final - timedelta(days=1)
    left = new_days(day, last, plan, study_day)
    pace = math.ceil(untaught / left) if left > 0 else 0
    return min(plan.budget, NEW_PER_DAY, pace)


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
    budget. The exam day and every day after it propose nothing, and once the
    exam has passed no day does, until a new exam date is set. ``study_day`` says whether a day takes new topics.
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
    untaught = waiting(record, levels, order)

    result: list[dict[str, Any]] = []
    for offset in range(days):
        day = today + timedelta(days=offset)
        if exam is not None and (exam.day < today or today <= exam.day <= day):
            result.append({"date": day.isoformat(), "reviews": [], "new": []})
            continue
        due = progress.due(
            projection.record, day, levels=projection.levels, order=order
        )
        count = _new_count(len(untaught), day, exam, plan, study_day, len(due))
        new, untaught = untaught[:count], untaught[count:]
        reviews = [item["topic"] for item in due[: plan.budget - len(new)]]
        for topic in reviews:
            projection.reviewed(topic, day)
        for topic in new:
            projection.introduced(topic, day)
        result.append({"date": day.isoformat(), "reviews": reviews, "new": new})
    return result
