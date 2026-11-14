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
  1. a course's final review, the one deadline the plan keeps: from its
     final-review day to the exam, its reviews come before every other
     course's, nearest exam first. Its solid topics are spread over its study
     days to the exam in proportion to the reviews he completes on each, so a
     lighter day takes less of it and a day off none; its not-yet-solid
     topics come back as their short intervals ask. Every taught topic is due
     by the final review, so each is reviewed before the exam whenever his
     limit leaves room for it; the plan names those it leaves without one
     (``Plan.unreviewed``).
  2. re-teaching, relearning and first retrievals (a topic not yet solid):
     such a review is part of learning the topic, and the topics that need
     it wait on it. One that an exam's untaught topics need comes first,
     nearest exam first: the rest of that exam's path cannot start before
     it is solid, so it carries the exam's deadline.
  3. every other review.
  4. reviews of courses whose exam has passed, on their spaced dates.
Within 2 and 3, by memory's own need: how far past its day a review is, as a
share of the interval that set the day (``progress.late_share``). Each step of
the ladder is set for the same recall, and forgetting runs with the gap as a
share of the interval, so ranking by that share keeps the courses' recall
alike: a course with no exam is not starved by the exam courses, a later
exam's first retrievals do not wait on a nearer exam's, and a backlog is
worked off from the most forgotten. The rule needs no share of the day and no
constant: the reviews he completes set the room, memory sets the order. On
equal shares, courses with an exam ahead come first, nearest first. The
nearer exam needs no more: its final review is the deadline, and comes first.
Then the course's own order (``progress.due``). A review left out of a
full day goes on to the next; the plan says why it waits past the day memory
asks for it (``When.held``): another course's final review came first, or
the days before were full.

An exam day is planned like any other day of its weekday, less the examined
course. Whether he does less on a day he sits an exam is his to show, as on
any day: stopping short lowers that weekday's limit. A lighter exam day by
assumption would be a guessed share.

New topics come only from the ready set: topics whose prerequisites are all
solid and not lapsed, and that no taught but not yet solid competing method
(``contrasts``) would interfere with. A course with an exam ahead first gets
its pace, the topics it has left over the study days it has left before its
new topics should end (``progress.new_end``: within its final review, the day
before the exam), nearest exam first, past the pace he has shown until he has
shown a limit; so a nearer exam's last topics come before a later exam's pace,
since a topic started late is better known at the exam than one never started.
Spare new-topic capacity then goes to the nearest exam with topics left; then
to courses with no exam. A topic a course cannot start before its exam does not
fit. Before any pace, an untaught topic that a taught topic needs starts first,
nearest exam first: what he has already started stands on it. A start that
waits while other courses' new topics take the days names them
(``When.starts_after``).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, timedelta
import math
from typing import Any

from learning import capacity, progress
from learning.capacity import Capacity

# The longest plan the engine makes: a year from today, so every review on
# the spacing ladder and every exam of the year falls inside it.
MAX_DAYS = 366
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
    holding: dict[str, str | None] = field(default_factory=dict)
    placed: set[str] = field(default_factory=set)
    held: dict[str, str | None] = field(default_factory=dict)
    gaps: set[str] = field(default_factory=set)
    pending: list[str] = field(default_factory=list)
    starts_after: dict[str, list[str]] = field(default_factory=dict)

    @classmethod
    def of(cls, name: str, record: dict[str, Any]) -> _Course:
        levels = progress.standings(record)
        order = progress.path_order(record)
        replayed = progress.replays(record)
        untaught = waiting(record, levels, order)
        return cls(
            name,
            {**record, "topics": dict(record["topics"])},
            dict(levels),
            {key: item.streak for key, item in replayed.items()},
            progress.exam_plan(record),
            order,
            untaught,
            progress.contrasts(record),
            replayed,
            gaps=_gaps(record, set(untaught)),
        )

    def ahead(self, day: date) -> bool:
        return self.exam is not None and self.exam.day > day

    @property
    def title(self) -> str:
        return str(self.record.get("title") or self.name)

    def due_items(self, day: date) -> list[dict[str, Any]]:
        """The reviews due on ``day``, in the course's own order."""
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
        return [item for item in items if self.levels[item["topic"]]["level"] != "new"]

    def due(self, day: date) -> list[str]:
        return [item["topic"] for item in self.due_items(day)]

    def need(self, item: dict[str, Any]) -> float:
        """Memory's need for a due review: days late as a share of its interval."""
        return progress.late_share(item, self.levels[item["topic"]])

    def oldest(self, topic: str, day: date) -> tuple[bool, str]:
        """A final review's order: topics not yet solid first, as their short
        intervals ask, then the solid ones least recently seen: with too
        little room, those he saw last are the best held at the exam."""
        return self.final(topic, day), self.levels[topic].get("last", {}).get(
            "date", ""
        )

    def gates(self, day: date) -> set[str]:
        """With the exam ahead, the topics its untaught topics need: until
        they are solid the rest of its path cannot start."""
        if not self.ahead(day):
            return set()
        return {
            need for key in self.untaught for need in progress.needs(self.record, key)
        }

    def reviewing(self, day: date) -> bool:
        """Within its final review: from the final-review day to the exam."""
        return self.exam is not None and self.exam.final <= day < self.exam.day

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

    def wait(self, topic: str, final: str | None) -> None:
        """A full day left it out; ``final`` is the course whose final review
        took some of that day. The last day's reason is the one it is placed
        after."""
        self.holding[topic] = final

    def place(self, topic: str) -> None:
        """Its review is on today's plan: held, with the reason, when a full
        day left it out first."""
        if topic not in self.placed and topic in self.holding:
            self.held[topic] = self.holding[topic]
        self.placed.add(topic)
        self.holding.pop(topic, None)

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


@dataclass(frozen=True)
class When:
    """The day the plan next puts each of one course's topics: a taught
    topic's next review, an untaught one's start. This is the one date a
    review has wherever it is read; the stored ``review.due`` is the day
    memory asks for it, which the plan may move later when other work comes
    first. With no study day ahead (``studies`` false) the plan puts nothing
    anywhere, and memory's dates stand."""

    today: date
    reviews: dict[str, date]
    starts: dict[str, date]
    studies: bool
    does_not_fit: list[str]
    held: Mapping[str, str | None] = field(default_factory=dict)
    """Each review the plan put past memory's day because a full day left it
    out: the title of the course whose final review took some of that day,
    else None (the days before were full)."""
    unreviewed: list[str] = field(default_factory=list)
    starts_after: Mapping[str, list[str]] = field(default_factory=dict)

    def review(self, topic: str, stored: str | None) -> str | None:
        placed = self.reviews.get(topic)
        return placed.isoformat() if placed else stored

    def tonight(self, topic: str) -> bool:
        """Of the reviews memory asks for by today, one the plan puts today:
        a review it moves to a later day is not due, nor overdue, tonight."""
        return self.reviews.get(topic) == self.today if self.studies else True


@dataclass
class Plan:
    """Each course's days (``{date, reviews, new}``), the path topics it
    cannot start before its exam, and the topics whose next review it put
    later because a full day left them out (``When.held``)."""

    days: dict[str, list[dict[str, Any]]]
    does_not_fit: dict[str, list[str]]
    held: dict[str, dict[str, str | None]] = field(default_factory=dict)
    unreviewed: dict[str, list[str]] = field(default_factory=dict)
    """Each exam course's taught topics its final review has no room for."""
    starts_after: dict[str, dict[str, list[str]]] = field(default_factory=dict)
    """Each start that waits: the titles of the courses whose new topics took
    the days before it, by course and topic."""

    def when(self, name: str, today: date, studies: bool) -> When:
        reviews: dict[str, date] = {}
        starts: dict[str, date] = {}
        for day in self.days[name]:
            on = date.fromisoformat(day["date"])
            for topic in day["reviews"]:
                if topic not in starts:
                    reviews.setdefault(topic, on)
            for topic in day["new"]:
                starts.setdefault(topic, on)
        return When(
            today,
            reviews,
            starts,
            studies,
            self.does_not_fit.get(name, []),
            dict(self.held.get(name, {})),
            self.unreviewed.get(name, []),
            dict(self.starts_after.get(name, {})),
        )


class _Allowance:
    """Whole items a day from fractional rates, the remainder carried."""

    def __init__(self) -> None:
        self.carry = {"reviews": 0.5, "new": 0.5}

    def take(self, kind: str, rate: float) -> int:
        """A day's whole items: never more than its own rate rounded up, so a
        remainder carried from lighter days never doubles a day's load."""
        whole = min(math.floor(self.carry[kind] + rate), math.ceil(rate))
        self.carry[kind] += rate - whole
        return whole


def _gaps(record: dict[str, Any], untaught: set[str]) -> set[str]:
    """Untaught topics that a taught topic needs, directly or through others:
    what he has already started stands on them. A topic the course leaves out
    is off the plan, so nothing he would study stands on what it needs."""
    gaps: set[str] = set()
    stack = [key for key in progress.path_order(record) if key not in untaught]
    seen = set(stack)
    while stack:
        for need in progress.needs(record, stack.pop()):
            if need in untaught:
                gaps.add(need)
            if need not in seen:
                seen.add(need)
                stack.append(need)
    return gaps


def _study_days(week: Capacity, first: date, last: date) -> int:
    return sum(
        week.studies(first + timedelta(days=n)) for n in range((last - first).days + 1)
    )


def _reviews(
    courses: list[_Course], day: date, room: float, week: Capacity
) -> dict[str, list[str]]:
    """The day's reviews within ``room``: final reviews first, nearest exam
    first, then by memory's need (the module's rule). Each one a full day
    leaves out waits on its course's ``holding``, with the course whose final
    review took some of the day."""
    candidates: list[tuple[tuple[Any, ...], str, _Course, str]] = []
    quota: dict[str, int] = {}
    for course in courses:
        items = course.due_items(day)
        distance = (
            float((course.exam.day - day).days)
            if course.exam is not None and course.ahead(day)
            else math.inf
        )
        if course.reviewing(day):
            assert course.exam is not None
            solid_ = sum(course.final(item["topic"], day) for item in items)
            share = week.share(day, course.exam.day - timedelta(days=1))
            quota[course.name] = math.ceil(solid_ * share)
            candidates.extend(
                (
                    (0, distance, *course.oldest(item["topic"], day), rank),
                    course.name,
                    course,
                    item["topic"],
                )
                for rank, item in enumerate(items)
            )
            continue
        gates = course.gates(day)
        for rank, item in enumerate(items):
            tier = course.tier(item["topic"], day)
            learning = tier == RELEARNING
            gating = learning and item["topic"] in gates
            key = (
                1,
                tier == EXAM_PASSED,
                not learning,
                not gating,
                distance if gating else 0.0,
                -course.need(item),
                distance,
                rank,
            )
            candidates.append((key, course.name, course, item["topic"]))
    candidates.sort(key=lambda item: (item[0], item[1]))
    chosen: dict[str, list[str]] = {course.name: [] for course in courses}
    taken: list[tuple[float, _Course]] = []
    left: list[tuple[_Course, str]] = []
    for key, _, course, topic in candidates:
        if room <= 0:
            left.append((course, topic))
            continue
        if course.final(topic, day):
            if quota[course.name] <= 0:
                continue
            quota[course.name] -= 1
        if key[0] == 0:
            taken.append((key[1], course))
        chosen[course.name].append(topic)
        room -= 1
    for course, topic in left:
        nearer = [
            other
            for _, other in sorted(taken, key=lambda f: f[0])
            if other is not course
        ]
        course.wait(topic, nearer[0].title if nearer else None)
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

    def take(course: _Course, count: float, among: set[str] | None = None) -> int:
        taken = 0
        for topic in list(course.untaught):
            if taken >= count:
                break
            if (among is None or topic in among) and course.ready(topic):
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
    for course in [*exams, *(course for course in courses if course.exam is None)]:
        if room > 0 and course.gaps:
            room -= take(course, room, course.gaps)
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
    _waited(courses, chosen, day)
    return chosen


def _morning(record: dict[str, Any], today: date) -> dict[str, Any]:
    """The record as today began: without today's answers, and each review
    the engine moved for one of them back on the day it had then."""
    day = today.isoformat()
    observations = {
        key: item for key, item in record["observations"].items() if item["date"] < day
    }
    touched = {
        topic
        for item in record["observations"].values()
        if item["date"] >= day
        for topic in item["topics"]
    }
    before = {**record, "observations": observations}
    replayed = progress.replays(before)
    topics = dict(record["topics"])
    for key in touched & topics.keys():
        review = topics[key].get("review", {})
        if review.get("by") != "engine":
            continue
        rest = {name: value for name, value in review.items() if name != "due"}
        due = replayed[key].due
        topics[key] = {
            **topics[key],
            "review": {**rest, "due": due.isoformat()} if due else rest,
        }
    return {**before, "topics": topics}


def _spent_today(
    records: Mapping[str, dict[str, Any]],
    courses: list[_Course],
    today: date,
    week: Capacity,
) -> int:
    """Today's reviews already answered that today's plan held as the day
    began. A review he chose beyond them, one the plan had put on a later
    day, is study past the plan: it takes no place from a review still
    planned today, so nothing shown due today drops off it unstudied."""
    morning = plan(
        {name: _morning(record, today) for name, record in records.items()},
        today,
        1,
        week,
    )
    day = today.isoformat()
    return sum(
        1
        for course in courses
        for topic in morning.days[course.name][0]["reviews"]
        if course.replayed[topic].days.get(day) == progress.PROBE
    )


def _waited(courses: list[_Course], chosen: dict[str, list[str]], day: date) -> None:
    """Why a start waits: the courses whose new topics took the room on the
    days one of this course's topics was ready and it started none, given to
    the topics it starts next."""
    starters = [course.title for course in courses if chosen[course.name]]
    for course in courses:
        if chosen[course.name]:
            if course.pending:
                for topic in chosen[course.name]:
                    course.starts_after[topic] = list(course.pending)
                course.pending.clear()
        elif (course.exam is None or course.ahead(day)) and any(
            map(course.ready, course.untaught)
        ):
            course.pending.extend(t for t in starters if t not in course.pending)


def plan(
    records: Mapping[str, dict[str, Any]],
    today: date,
    days: int,
    week: Capacity | None = None,
) -> Plan:
    """Every course's plan for ``days`` days from today, together.

    ``week`` defaults to the capacity learned from these records. Today's
    allowance is what is left after the reviews done today that today's plan
    held as the day began (``_spent_today``).
    """
    history = capacity.activity(records.values(), today)
    week = week or capacity.estimate(history, today)
    courses = [_Course.of(name, record) for name, record in records.items()]
    done = history.get(today, capacity.Done())
    spent = _spent_today(records, courses, today, week) if done.reviews else 0
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
            reviews_room = max(reviews_room - spent, 0)
            new_room = max(new_room - done.new, 0)
        reviews = _reviews(courses, day, reviews_room, week)
        for course in courses:
            for topic in reviews[course.name]:
                course.place(topic)
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
        {course.name: dict(course.held) for course in courses if course.held},
        {
            course.name: missed
            for course in courses
            if (missed := _unreviewed(course, records[course.name], today))
        },
        {course.name: course.starts_after for course in courses if course.starts_after},
    )


def _unreviewed(course: _Course, record: dict[str, Any], today: date) -> list[str]:
    """Of an exam course's topics taught by its exam, those neither reviewed
    in its final review so far nor planned there: no room before the exam.
    Known once the plan reaches the eve of the exam."""
    exam = course.exam
    last = course.days[-1]["date"] if course.days else ""
    eve = (exam.day - timedelta(days=1)).isoformat() if exam else ""
    if exam is None or exam.day <= today or last < eve:
        return []
    final, end = exam.final.isoformat(), exam.day.isoformat()
    levels = progress.standings(record)
    reviewed = {
        topic
        for day in course.days
        if final <= day["date"] < end
        for topic in day["reviews"]
    }
    started = {
        topic for day in course.days if day["date"] < end for topic in day["new"]
    }
    return [
        topic
        for topic in course.order
        if (levels[topic]["level"] != "new" or topic in started)
        and topic not in reviewed
        and levels[topic].get("last", {}).get("date", "") < final
    ]
