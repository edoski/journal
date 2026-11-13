"""The daily plan across every course: which reviews and which new topics each
day, as much as the learner gets through and only on the days he studies.

Pure and read-only. The plan projects every course's record forward from today
together. Each study day (``capacity.Capacity``) takes as many reviews and new
topics as he completes on that weekday, the fractions carried from day to day;
nothing lands on a weekday he does not study. Planned reviews are assumed
``solid``, so a later day's reviews are the ladder's next steps; what does not
fit stays due. The plan never stores anything; the next save and the next plan
start again from what happened.

Reviews, when there are more than fit:
  1. re-teaching, relearning and first retrievals (a topic not yet solid);
  2. other reviews of courses with an exam ahead, nearest exam first;
  3. reviews of courses with no exam;
  4. reviews of courses whose exam has passed, on their spaced dates.
Within each, the course's own order (``progress.due``). A course's final review
is spread over its study days to the exam in proportion to the reviews he
completes on each, so a lighter evening takes less of it and a day off none.

New topics come only from the ready set: topics whose prerequisites are all
solid and not lapsed, and that no taught but not yet solid competing method
(``contrasts``) would interfere with. A course with an exam ahead first gets
its pace, the topics it has left over the study days it has left, nearest exam
first; spare new-topic capacity then goes to the nearest exam, then to courses
with no exam. A topic a course cannot start before its exam does not fit.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, timedelta
import math
from typing import Any

from learning import capacity, progress
from learning.capacity import Capacity

# The last new topic needs its first retrieval and one solid review before the
# final review: the ladder's first two steps.
NEW_BEFORE_FINAL = progress.FIRST_RETRIEVAL_DAYS + progress.LADDER[0]
SECURE = frozenset({"independent", "retained", "transferred"})
NOT_YET_SOLID = frozenset({"introduced", "attempted", "assisted"})
RELEARNING, EXAM_AHEAD, NO_EXAM, EXAM_PASSED = range(4)


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


def solid(standing: dict[str, Any]) -> bool:
    return (
        standing["level"] in SECURE
        and not standing.get("lapsed")
        and not standing.get("relearn")
    )


@dataclass
class _Course:
    """One course's record as the plan expects it to stand, day by day."""

    name: str
    record: dict[str, Any]
    levels: dict[str, dict[str, Any]]
    streaks: dict[str, int]
    exam: progress.Exam | None
    order: list[str]
    untaught: list[str]
    partners: dict[str, list[str]]
    days: list[dict[str, Any]] = field(default_factory=list)
    introduced: set[str] = field(default_factory=set)

    @classmethod
    def of(cls, name: str, record: dict[str, Any]) -> _Course:
        levels = progress.standings(record)
        order = progress.path_order(record)
        return cls(
            name,
            {**record, "topics": dict(record["topics"])},
            dict(levels),
            {key: item.streak for key, item in progress.replays(record).items()},
            progress.exam_plan(record),
            order,
            waiting(record, levels, order),
            progress.contrasts(record),
        )

    def ahead(self, day: date) -> bool:
        return self.exam is not None and self.exam.day > day

    def due(self, day: date) -> list[str]:
        if self.exam is not None and self.exam.day == day:
            return []
        items = progress.due(
            self.record,
            day,
            levels=self.levels,
            order=self.order,
            limit=0,
        )
        return [item["topic"] for item in items]

    def tier(self, topic: str, day: date) -> int:
        standing = self.levels[topic]
        if standing["level"] in NOT_YET_SOLID or not solid(standing):
            return (
                RELEARNING if self.exam is None or self.exam.day > day else EXAM_PASSED
            )
        if self.exam is None:
            return NO_EXAM
        return EXAM_AHEAD if self.exam.day > day else EXAM_PASSED

    def final(self, topic: str, day: date) -> bool:
        """A final-review item: a solid topic due within the final review."""
        return (
            self.exam is not None
            and self.exam.final <= day < self.exam.day
            and self.tier(topic, day) == EXAM_AHEAD
        )

    def ready(self, topic: str) -> bool:
        """Its prerequisites are solid, and no competing method is half-learned."""
        needs = self.record["topics"][topic].get("needs", ())
        return all(solid(self.levels[need]) for need in needs) and not any(
            self.levels[other]["level"] != "new" and not solid(self.levels[other])
            for other in self.partners[topic]
        )

    def _set_due(self, topic: str, base: date, days: int, *, solid: bool) -> None:
        expected = progress.review_day(base, days, self.exam)
        due = progress.kept(base, expected, self.exam, solid=solid)
        entry = dict(self.record["topics"][topic])
        entry["review"] = {**entry.get("review", {}), "due": due.isoformat()}
        self.record["topics"][topic] = entry

    def reviewed(self, topic: str, day: date) -> None:
        stored = self.record["topics"][topic].get("review", {}).get("due")
        late = (day - date.fromisoformat(stored)).days if stored else 0
        self.streaks[topic] = self.streaks.get(topic, 0) + 1
        standing = {
            name: value
            for name, value in self.levels[topic].items()
            if name not in ("lapsed", "relearn")
        }
        if standing["level"] not in SECURE:
            standing["level"] = "independent"
        standing["last"] = {"date": day.isoformat()}
        self.levels[topic] = standing
        step = progress.interval("solid", self.streaks[topic], late)
        self._set_due(topic, day, step, solid=True)

    def start(self, topic: str, day: date) -> None:
        self.untaught.remove(topic)
        self.introduced.add(topic)
        self.streaks[topic] = 0
        self.levels[topic] = {
            **self.levels[topic],
            "level": "introduced",
            "last": {"date": day.isoformat()},
        }
        self._set_due(topic, day, progress.FIRST_RETRIEVAL_DAYS, solid=False)

    def new_end(self, day: date) -> date | None:
        """The last day this course takes new topics before its exam."""
        if not self.ahead(day):
            return None
        assert self.exam is not None
        last = last_new_day(self.exam)
        return last if day <= last else self.exam.final - timedelta(days=1)


@dataclass
class Plan:
    """Each course's days (``{date, reviews, new}``) and the path topics it
    cannot start before its exam."""

    days: dict[str, list[dict[str, Any]]]
    does_not_fit: dict[str, list[str]]


class _Allowance:
    """Whole items a day from fractional rates, the remainder carried."""

    def __init__(self) -> None:
        self.carry = {"reviews": 0.5, "new": 0.5}

    def take(self, kind: str, rate: float) -> int:
        whole = math.floor(self.carry[kind] + rate)
        self.carry[kind] += rate - whole
        return whole


def _study_days(week: Capacity, first: date, last: date) -> int:
    return sum(
        week.studies(first + timedelta(days=n)) for n in range((last - first).days + 1)
    )


def _reviews(
    courses: list[_Course], day: date, room: int, week: Capacity
) -> dict[str, list[str]]:
    candidates: list[tuple[tuple[int, float, int], _Course, str]] = []
    quota: dict[str, int] = {}
    for course in courses:
        due = course.due(day)
        finals = [topic for topic in due if course.final(topic, day)]
        if finals:
            assert course.exam is not None
            share = week.share(day, course.exam.day - timedelta(days=1))
            quota[course.name] = math.ceil(len(finals) * share)
        distance = (
            float((course.exam.day - day).days)
            if course.exam is not None and course.ahead(day)
            else math.inf
        )
        candidates.extend(
            ((course.tier(topic, day), distance, rank), course, topic)
            for rank, topic in enumerate(due)
        )
    candidates.sort(key=lambda item: (item[0], item[1].name))
    chosen: dict[str, list[str]] = {course.name: [] for course in courses}
    for _, course, topic in candidates:
        if room <= 0:
            break
        if course.final(topic, day):
            if quota[course.name] <= 0:
                continue
            quota[course.name] -= 1
        chosen[course.name].append(topic)
        room -= 1
    return chosen


def _new(
    courses: list[_Course], day: date, room: int, week: Capacity
) -> dict[str, list[str]]:
    chosen: dict[str, list[str]] = {course.name: [] for course in courses}

    def take(course: _Course, count: int) -> int:
        taken = 0
        for topic in list(course.untaught):
            if taken == count:
                break
            if course.ready(topic):
                course.start(topic, day)
                chosen[course.name].append(topic)
                taken += 1
        return taken

    exams = sorted(
        (course for course in courses if course.new_end(day) is not None),
        key=lambda course: (course.exam.day if course.exam else day, course.name),
    )
    for course in exams:
        end = course.new_end(day)
        assert end is not None
        left = _study_days(week, day, end)
        if room > 0 and left > 0 and course.untaught:
            room -= take(course, min(room, math.ceil(len(course.untaught) / left)))
    for course in exams:
        end = course.new_end(day)
        if room > 0 and end is not None and day <= end:
            room -= take(course, room)
    for course in courses:
        if room > 0 and course.exam is None:
            room -= take(course, 1)
    return chosen


def plan(
    records: Mapping[str, dict[str, Any]],
    today: date,
    days: int,
    week: Capacity | None = None,
) -> Plan:
    """Every course's plan for ``days`` days from today, together.

    ``week`` defaults to the capacity learned from these records. Today's
    allowance is what is left after what the record shows done today.
    """
    week = week or capacity.of(records.values(), today)
    courses = [_Course.of(name, record) for name, record in records.items()]
    done = capacity.activity(records.values()).get(today, capacity.Done())
    allowance = _Allowance()
    for offset in range(days):
        day = today + timedelta(days=offset)
        rates = week.on(day)
        if week.studies(day):
            reviews_room = allowance.take("reviews", rates.reviews)
            new_room = allowance.take("new", rates.new)
        else:
            reviews_room = new_room = 0
        if offset == 0:
            reviews_room = max(reviews_room - done.reviews, 0)
            new_room = max(new_room - done.new, 0)
        reviews = _reviews(courses, day, reviews_room, week)
        for course in courses:
            for topic in reviews[course.name]:
                course.reviewed(topic, day)
        new = _new(courses, day, new_room, week)
        for course in courses:
            course.days.append(
                {
                    "date": day.isoformat(),
                    "reviews": reviews[course.name],
                    "new": new[course.name],
                }
            )
    return Plan(
        {course.name: course.days for course in courses},
        {
            course.name: list(course.untaught)
            for course in courses
            if course.ahead(today) and course.untaught
        },
    )
