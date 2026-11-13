"""The daily plan across every course: which reviews and which new topics each
day, everything owed until the learner has shown he stops short of it, and
only on the days he studies.

Pure and read-only. The plan projects every course's record forward from today
together. Each study day (``capacity.Capacity``) takes every review due, and
each exam course's pace of new topics, unless he has shown a limit for that
kind of work: then it takes as many as his limit on that weekday, the
fractions carried from day to day. Nothing lands on a weekday he does not
study. Planned reviews are assumed ``solid``, so a later day's reviews are the
ladder's next steps; what does not fit stays due. The plan never stores
anything; the next save and the next plan start again from what happened.

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
its pace, the topics it has left over the study days it has left before its
new topics should end, nearest exam first, past the pace he has shown until he
has shown a limit; spare new-topic capacity then goes
to the nearest exam with topics left, even within its final review, since a
topic started late is better known at the exam than one never started; then to
courses with no exam. A topic a course cannot start before its exam does not
fit.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, timedelta
import math
from typing import Any

from learning import capacity, progress
from learning.capacity import Capacity

SECURE = frozenset({"independent", "retained", "transferred"})
NOT_YET_SOLID = frozenset({"introduced", "attempted", "assisted"})
RELEARNING, EXAM_AHEAD, NO_EXAM, EXAM_PASSED = range(4)


def waiting(
    record: dict[str, Any], levels: dict[str, dict[str, Any]], order: list[str]
) -> list[str]:
    """Path topics still to introduce: never taught, whatever date a tutor
    pinned on one."""
    return [key for key in order if levels[key]["level"] == "new"]


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
    replayed: dict[str, progress.Replay]
    days: list[dict[str, Any]] = field(default_factory=list)
    introduced: set[str] = field(default_factory=set)
    projected: set[str] = field(default_factory=set)

    @classmethod
    def of(cls, name: str, record: dict[str, Any]) -> _Course:
        levels = progress.standings(record)
        order = progress.path_order(record)
        replayed = progress.replays(record)
        return cls(
            name,
            {**record, "topics": dict(record["topics"])},
            dict(levels),
            {key: item.streak for key, item in replayed.items()},
            progress.exam_plan(record),
            order,
            waiting(record, levels, order),
            progress.contrasts(record),
            replayed,
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
            replayed=self.replayed,
        )
        return [
            item["topic"]
            for item in items
            if self.levels[item["topic"]]["level"] != "new"
        ]

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
        needs = progress.needs(self.record, topic)
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
        engine = self.replayed[topic].due if topic not in self.projected else None
        expected = engine or (date.fromisoformat(stored) if stored else None)
        late = progress.late_days(day, expected, self.exam) if expected else 0
        self.projected.add(topic)
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
        self.projected.add(topic)
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
        return progress.new_end(self.exam, day)


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
    courses: list[_Course], day: date, room: float, week: Capacity
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
    courses: list[_Course],
    day: date,
    room: float,
    week: Capacity,
    begun: int | None,
) -> dict[str, list[str]]:
    """New topics within ``room``. Until he has shown a limit (``begun`` is not
    None), every exam course's pace is proposed even past ``room``, less the
    ``begun`` topics he already started today."""
    chosen: dict[str, list[str]] = {course.name: [] for course in courses}

    def take(course: _Course, count: float) -> int:
        taken = 0
        for topic in list(course.untaught):
            if taken >= count:
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
    paces: dict[str, int] = {}
    for course in exams:
        end = course.new_end(day)
        assert end is not None
        left = _study_days(week, day, end)
        if left > 0 and course.untaught:
            paces[course.name] = math.ceil(len(course.untaught) / left)
    if begun is not None:
        room = max(room, sum(paces.values()) - begun)
    for course in exams:
        if room > 0 and course.name in paces:
            room -= take(course, min(room, paces[course.name]))
    for course in exams:
        if room > 0:
            room -= take(course, room)
    open_ = [course for course in courses if course.exam is None]
    while room > 0 and open_:
        started = []
        for course in open_:
            if room > 0 and take(course, 1):
                started.append(course)
                room -= 1
        open_ = started
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
    history = capacity.activity(records.values(), today)
    week = week or capacity.estimate(history, today)
    courses = [_Course.of(name, record) for name, record in records.items()]
    done = history.get(today, capacity.Done())
    allowance = _Allowance()
    for offset in range(days):
        day = today + timedelta(days=offset)
        rates = week.on(day)
        reviews_room: float = 0
        new_room: float = 0
        begun: int | None = None
        if week.studies(day):
            reviews_room = (
                allowance.take("reviews", rates.reviews.value)
                if rates.reviews.shown
                else math.inf
            )
            new_room = allowance.take("new", rates.new.value)
            if not rates.new.shown:
                begun = done.new if offset == 0 else 0
        if offset == 0:
            reviews_room = max(reviews_room - done.reviews, 0)
            new_room = max(new_room - done.new, 0)
        reviews = _reviews(courses, day, reviews_room, week)
        for course in courses:
            for topic in reviews[course.name]:
                course.reviewed(topic, day)
        new = _new(courses, day, new_room, week, begun)
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
