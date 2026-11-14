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
  2. a review an exam's untaught topics wait on (a topic not yet solid that
     they need, or a competing method of theirs), nearest exam first: the
     rest of that exam's path cannot start before it is solid, so it carries
     the exam's deadline.
  3. every other review, but for those of 4 and 5, by memory's own need: how far
     past its day a review is, as a share of the interval that set the day
     (``progress.late_share``). Each step of the ladder is set for the same
     recall, and forgetting runs with the gap as a share of the interval, so
     ranking by that share keeps the courses' recall alike and works a
     backlog off from the most forgotten. On equal shares a topic not yet
     solid comes first (it is still being learned), then courses with an
     exam ahead, nearest first.
  4. a review of a course with an exam ahead that its final review would
     repeat: answered solid today, its next step falls within the final
     review, which brings it back before the exam anyway. A course with no
     exam has no final review to catch up what waits, so its reviews come
     before these. Ranking these by need alone starved the courses with no
     exam: a one-day interval gains a whole share each day it waits, and
     each exam's pace adds such reviews daily, so a review weeks late on a
     month's interval never had the larger share.
  5. reviews of courses whose exam has passed, on their spaced dates.
The rule needs no share of the day and no constant: the reviews he
completes set the room, memory and the exam set the order. Then the
course's own order (``progress.due``). Competing methods (``contrasts``) are
reviewed side by side, since telling them apart is what they need: one due
the day another is taken comes right after it, and one whose partner falls
due a little later waits for it, when the wait costs it no larger share of
its interval than a single day costs the ladder's shortest solid interval
(``_Course.together``). A review left out of a full day goes
on to the next; the plan says why it waits past the day memory asks for it
(``When.held``): another course's final review came first, or the days
before were full.

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
to courses with no exam, the one that started a topic least recently first.
Spare capacity starts one topic on a day that starts none, and a second only
when it belongs with the first (one needs the other, or both rest on the same
prerequisites) or his own rate that weekday holds two: two unrelated topics in
one sitting split his attention, and nothing but a pace asks for them. A pace
that needs two still takes two, related ones first. A topic a course cannot start before its exam does not
fit. Before any pace, an untaught topic that a taught topic needs starts first,
nearest exam first: what he has already started stands on it. A start that
waits while other courses' new topics take the days names them
(``When.starts_after``).

New topics follow the material. The path runs arc by arc, and a start comes
from the window: the earliest arc with topics left (the arc of the earliest
untaught topic he may start), the next arc, and any arc that needs nothing
from another (``progress.window``). That arc is not the current arc, the
arc of "You are here" (``arcs.current``): the two differ once he studies
ahead. Without arcs the path bounds it: a topic ahead of the
earliest untaught one starts only when it builds on one, so a topic that
needs nothing waits its place (``progress.opens``). An exam's pace passes the
window only on a day when holding would raise the pace it needs. Each start
says why it comes then (``When.why``): next in its arc, after what it waited
on, or early, with the earliest arc with topics left and what it waits on.

An exam with a scope examines only its topics, those of the arcs it names
less those it leaves out, with or without arcs (``progress.examining``):
only those take its review dates, its final review and its run-up, while its
pace, its gates and what does not fit hold them and their untaught
prerequisites (``progress.exam_topics``). The rest of the course is planned
as with no exam while the exam is ahead, and after it the whole course is,
what it examined but he never started included.
"""

from __future__ import annotations

from collections.abc import Collection, Mapping
from dataclasses import dataclass, field
from datetime import date, timedelta
import math
from typing import Any, TypedDict

from learning import arc_rules, capacity, progress
from learning.capacity import Capacity

# The longest plan the engine makes: a year from today, so every review on
# the spacing ladder and every exam of the year falls inside it.
MAX_DAYS = 366
NOT_YET_SOLID = frozenset({"introduced", "attempted", "assisted"})
RELEARNING, EXAM_AHEAD, NO_EXAM, EXAM_PASSED = range(4)


class Why(TypedDict, total=False):
    """Why the plan starts a topic when it does, in the material's terms.

    ``kind`` is ``next`` (the next topic of its arc, or of the path, he can
    start), ``after`` (on a day the plan reached it, it waited for ``needs``,
    prerequisites not yet solid, or ``partners``, competing methods not yet
    solid, to be told apart from them), or ``early`` (ahead of its place:
    from a later ``arc`` while ``behind``, the earliest arc with topics left,
    waits, or, without arcs, ahead of an earlier topic; ``waiting_on`` names
    what those wait on to be solid, ``exam`` that the exam's pace took it).
    ``arc`` is its arc. Another course's new topics taking the days before it are
    ``When.starts_after``, beside this."""

    kind: str
    arc: str
    behind: str
    needs: list[str]
    partners: list[str]
    waiting_on: list[str]
    exam: bool


def waiting(
    record: dict[str, Any], levels: dict[str, dict[str, Any]], order: list[str]
) -> list[str]:
    """Path topics still to introduce: never taught, whatever date a tutor
    pinned on one."""
    return [key for key in order if levels[key]["level"] == "new"]


def solid(standing: dict[str, Any]) -> bool:
    return (
        standing["level"] in progress.SECURE
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
    examined: frozenset[str] | None
    scope: frozenset[str] | None
    asks: bool
    free: frozenset[str]
    days: list[dict[str, Any]] = field(default_factory=list)
    introduced: set[str] = field(default_factory=set)
    projected: set[str] = field(default_factory=set)
    holding: dict[str, str | None] = field(default_factory=dict)
    placed: set[str] = field(default_factory=set)
    held: dict[str, str | None] = field(default_factory=dict)
    gaps: set[str] = field(default_factory=set)
    pending: list[str] = field(default_factory=list)
    starts_after: dict[str, list[str]] = field(default_factory=dict)
    paired: dict[str, date] = field(default_factory=dict)
    waits: dict[str, Why] = field(default_factory=dict)
    fresh: set[str] = field(default_factory=set)
    why: dict[str, Why] = field(default_factory=dict)
    missed: list[str] | None = None
    began: date | None = None

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
            arc_rules.examined(record),
            progress.exam_topics(record, untaught),
            progress.asks(record),
            progress.free_arcs(record),
            gaps=_gaps(record, set(untaught)),
        )

    def ahead(self, day: date) -> bool:
        return self.exam is not None and self.exam.day > day

    def exam_of(self, topic: str) -> progress.Exam | None:
        """The exam that examines ``topic`` (``progress.examining``): every
        per-topic read of the exam goes through it."""
        return self.exam if self.examined is None or topic in self.examined else None

    @property
    def scoped(self) -> list[str]:
        """Untaught topics the next exam needs started, in path order: what it
        examines and their untaught prerequisites (``progress.exam_topics``)."""
        return [key for key in self.untaught if self.scope is None or key in self.scope]

    def outside(self, day: date) -> list[str]:
        """Untaught topics no exam ahead needs: outside the next exam's scope,
        or, once an exam with a scope (arcs, or topics it leaves out) has
        passed, all of them, what it examined but he never started included.
        They are planned as in a course with no exam. After a whole-course
        exam nothing is, until the next exam is set."""
        if self.exam is None:
            return []
        if not self.ahead(day):
            return list(self.untaught) if self.examined is not None else []
        if self.scope is None:
            return []
        return [key for key in self.untaught if key not in self.scope]

    def arc(self, topic: str) -> str | None:
        arc: str | None = self.record["topics"][topic].get("arc")
        return arc

    def front(self, among: Collection[str] | None = None) -> str | None:
        """The earliest untaught topic of ``among`` (of all, when None): the
        place in that part of the material he has reached
        (``progress.window``)."""
        return next(
            (key for key in self.untaught if among is None or key in among), None
        )

    def opens(self, topic: str, front: str | None) -> bool:
        """Whether ``topic`` is in the window new topics come from, read from
        ``front`` (``progress.opens``): the earliest arc with topics left, the
        next and any arc that needs nothing from another; without arcs, the
        path's own order."""
        window = progress.window(self.record, front, self.free)
        return progress.opens(self.record, topic, window, front)

    def blockers(self, topic: str) -> Why:
        """What it waits on to start: its prerequisites not yet solid, and its
        competing methods taught but not yet solid."""
        found: Why = {}
        if needs := [
            need for need in progress.needs(self.record, topic) if not self.met(need)
        ]:
            found["needs"] = needs
        if partners := [
            other
            for other in self.partners[topic]
            if self.asks
            and self.levels[other]["level"] != "new"
            and not solid(self.levels[other])
        ]:
            found["partners"] = partners
        return found

    def _held_by(self, topic: str) -> list[str]:
        found = self.blockers(topic)
        return [*found.get("needs", []), *found.get("partners", [])]

    def watch(self, among: list[str]) -> None:
        """Note what each topic of ``among`` in the window still waits on."""
        front = self.front(among)
        for topic in among:
            if self.opens(topic, front) and (found := self.blockers(topic)):
                self.waits[topic] = found

    def reason(self, topic: str, front: str | None, *, pace: bool = False) -> Why:
        """Why ``topic`` starts now (``Why``), read before it starts, with
        ``front`` the earliest untaught topic of what it was picked from."""
        arc = self.arc(topic)
        earliest = self.arc(front) if front is not None else None
        why: Why = {"arc": arc} if arc is not None else {}
        chapters = arc_rules.order(self.record)
        if arc is not None and earliest is not None:
            if chapters.index(arc) > chapters.index(earliest):
                passed = [t for t in self.untaught if self.arc(t) == earliest]
                waiting = self._waiting_on(passed, pace)
                return {**why, "kind": "early", "behind": earliest, **waiting}
        elif arc is None and front is not None and topic != front:
            passed = self.untaught[: self.untaught.index(topic)]
            return {"kind": "early", **self._waiting_on(passed, pace)}
        if topic in self.waits:
            return {**why, "kind": "after", **self.waits[topic]}
        return {**why, "kind": "next"}

    def _waiting_on(self, behind: list[str], pace: bool) -> Why:
        """What the topics an early start passes over wait on to be solid, in
        path order: the evidence that holds them."""
        rank = {key: index for index, key in enumerate(self.order)}
        held = {
            other
            for topic in behind
            for other in self._held_by(topic)
            if self.levels[other]["level"] != "new"
        }
        found: Why = {}
        if held:
            found["waiting_on"] = sorted(held, key=lambda key: rank.get(key, len(rank)))
        if pace:
            found["exam"] = True
        return found

    def startable(self, day: date) -> list[str]:
        """The untaught topics the plan may start on ``day``."""
        if self.exam is None or self.ahead(day):
            return self.untaught
        return self.outside(day)

    @property
    def title(self) -> str:
        return str(self.record.get("title") or self.name)

    def due_items(self, day: date) -> list[dict[str, Any]]:
        """The reviews due on ``day``, in the course's own order. A course that
        takes no questions has none."""
        if not self.asks or (self.exam is not None and self.exam.day == day):
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
        """With the exam ahead, the topics its untaught topics wait on: what
        they need, and their competing methods (``ready``). Until those are
        solid the rest of its path cannot start."""
        if not self.ahead(day):
            return set()
        return {
            other
            for key in self.scoped
            for other in (*progress.needs(self.record, key), *self.partners[key])
        }

    def caught(self, topic: str, day: date) -> bool:
        """A review its final review would repeat: answered solid today, its
        next step falls within the final review, which brings it back anyway."""
        exam = self.exam_of(topic)
        if exam is None or exam.day <= day:
            return False
        step = progress.interval("solid", self.streaks.get(topic, 0) + 1)
        return day + timedelta(days=step) >= exam.final

    def together(self, topic: str, day: date, week: Capacity) -> bool:
        """Whether its review waits for a competing method's, so the two are
        reviewed side by side: one falls due on a later study day before the
        exam, and the wait costs it no larger share of its interval
        (``progress.late_share``) than a single day costs the ladder's
        shortest solid interval. The plan counts in whole days, so that is the
        least lateness any held review bears; a review on a long interval may
        wait a few days, one on a short interval none. It waits for one day
        before each review, so it never chases one method after another."""
        if topic in self.paired:
            return day < self.paired[topic]
        due = self.record["topics"][topic].get("review", {}).get("due")
        if due is None:
            return False
        least = 1 / progress.LADDER[0]
        exam = self.exam_of(topic)
        for other in self.partners[topic]:
            then = self.record["topics"][other].get("review", {}).get("due")
            if self.levels[other]["level"] == "new" or then is None:
                continue
            meet = date.fromisoformat(then)
            if meet <= day:
                continue
            while not week.studies(meet):
                meet += timedelta(days=1)
            if exam is not None and exam.day > day and meet >= exam.day:
                continue
            item = {"due": due, "overdue": (meet - day).days}
            if progress.late_share(item, self.levels[topic]) <= least:
                self.paired[topic] = meet
                return True
        return False

    def reviewing(self, day: date) -> bool:
        """Within its final review: from the final-review day to the exam."""
        return self.exam is not None and self.exam.final <= day < self.exam.day

    def tier(self, topic: str, day: date) -> int:
        standing = self.levels[topic]
        exam = self.exam_of(topic)
        if standing["level"] in NOT_YET_SOLID or not solid(standing):
            return RELEARNING if exam is None or exam.day > day else EXAM_PASSED
        if exam is None:
            return NO_EXAM
        return EXAM_AHEAD if exam.day > day else EXAM_PASSED

    def final(self, topic: str, day: date) -> bool:
        """A final-review item: a solid topic the exam examines, due within
        its final review."""
        exam = self.exam_of(topic)
        return (
            exam is not None
            and exam.final <= day < exam.day
            and self.tier(topic, day) == EXAM_AHEAD
        )

    def met(self, need: str) -> bool:
        """A prerequisite he can build on: solid, or, in a course that takes no
        questions, where nothing can show it solid, taught on an earlier day."""
        if not self.asks:
            return self.levels[need]["level"] != "new" and need not in self.fresh
        return solid(self.levels[need])

    def ready(self, topic: str) -> bool:
        """Its prerequisites are met, and no competing method is half-learned
        (in a course that takes no questions, nothing can show one is)."""
        needs = progress.needs(self.record, topic)
        return all(self.met(need) for need in needs) and not (
            self.asks
            and any(
                self.levels[other]["level"] != "new" and not solid(self.levels[other])
                for other in self.partners[topic]
            )
        )

    def _set_due(self, topic: str, base: date, days: int, *, solid: bool) -> None:
        exam = self.exam_of(topic)
        expected = progress.review_day(base, days, exam)
        due = progress.kept(base, expected, exam, solid=solid)
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
        late = progress.late_days(day, expected, self.exam_of(topic)) if expected else 0
        self.projected.add(topic)
        self.paired.pop(topic, None)
        self.streaks[topic] = self.streaks.get(topic, 0) + 1
        standing = {
            name: value
            for name, value in self.levels[topic].items()
            if name not in ("lapsed", "relearn")
        }
        if standing["level"] not in progress.SECURE:
            standing["level"] = "independent"
        standing["last"] = {"date": day.isoformat()}
        self.levels[topic] = standing
        step = progress.interval("solid", self.streaks[topic], late)
        self._set_due(topic, day, step, solid=True)

    def start(
        self, topic: str, day: date, front: str | None = None, *, pace: bool = False
    ) -> None:
        self.why[topic] = self.reason(topic, front, pace=pace)
        self.fresh.add(topic)
        self.began = day
        self.untaught.remove(topic)
        self.projected.add(topic)
        self.introduced.add(topic)
        self.streaks[topic] = 0
        self.levels[topic] = {
            **self.levels[topic],
            "level": "introduced",
            "last": {"date": day.isoformat()},
        }
        if self.asks:
            self._set_due(topic, day, progress.FIRST_RETRIEVAL_DAYS, solid=False)

    def related(self, topic: str, started: list[str]) -> bool:
        """Whether it belongs with one of the topics ``started`` today: one
        needs the other, or both rest on the same prerequisites. Sharing one
        of several is not enough: a foundation many topics need links
        topics from different chapters."""
        needs = set(progress.needs(self.record, topic))
        return any(
            other in needs
            or topic in progress.needs(self.record, other)
            or (bool(needs) and needs == set(progress.needs(self.record, other)))
            for other in started
        )

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
    why: Mapping[str, Why] = field(default_factory=dict)
    """Why each start comes when it does (``Why``)."""

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
    why: dict[str, dict[str, Why]] = field(default_factory=dict)
    """Why each start comes when it does, by course and topic (``Why``)."""

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
            {topic: self.why[name][topic] for topic in starts if name in self.why},
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
        reviewing = course.reviewing(day)
        if reviewing:
            assert course.exam is not None
            solid_ = sum(course.final(item["topic"], day) for item in items)
            share = week.share(day, course.exam.day - timedelta(days=1))
            quota[course.name] = math.ceil(solid_ * share)
        gates = course.gates(day)
        for rank, item in enumerate(items):
            topic = item["topic"]
            examined = course.exam_of(topic) is not None
            if reviewing and examined:
                key: tuple[Any, ...] = (0, distance, *course.oldest(topic, day), rank)
                candidates.append((key, course.name, course, topic))
                continue
            tier = course.tier(topic, day)
            learning = tier == RELEARNING
            gating = learning and topic in gates
            key = (
                1,
                tier == EXAM_PASSED,
                not gating,
                distance if gating else 0.0,
                course.caught(topic, day),
                -course.need(item),
                not learning,
                distance if examined else math.inf,
                rank,
            )
            candidates.append((key, course.name, course, topic))
    candidates.sort(key=lambda item: (item[0], item[1]))
    held = {
        (course.name, topic)
        for key, _, course, topic in candidates
        if key[0] == 1 and key[2] and course.together(topic, day, week)
    }
    picked = _select(courses, candidates, day, room, quota, held)
    for course, topic in picked.left:
        nearer = [
            other
            for _, other in sorted(picked.taken, key=lambda f: f[0])
            if other is not course
        ]
        course.wait(topic, nearer[0].title if nearer else None)
    return picked.chosen


@dataclass
class _Picked:
    chosen: dict[str, list[str]]
    taken: list[tuple[float, _Course]]
    left: list[tuple[_Course, str]]


def _select(
    courses: list[_Course],
    candidates: list[tuple[tuple[Any, ...], str, _Course, str]],
    day: date,
    room: float,
    quota: dict[str, int],
    held: set[tuple[str, str]],
) -> _Picked:
    """Take ``candidates`` in order within ``room`` and each final review's
    quota, less the ``held`` ones, which wait for a competing method rather
    than for room (not ``When.held``); a competing method due the same day
    comes right after the one taken, so the two are reviewed side by side. On
    a day that holds two or more, the last place goes to a review without a
    partner due, so a pair is never split across days for want of one place."""
    order = [entry for entry in candidates if (entry[1], entry[3]) not in held]
    picked = _Picked({course.name: [] for course in courses}, [], [])
    pairs = room >= 2
    index = 0
    while index < len(order):
        key, _, course, topic = order[index]
        index += 1
        partners = [
            entry
            for entry in order[index:]
            if entry[2] is course and entry[3] in course.partners[topic]
        ]
        if room <= 0:
            picked.left.append((course, topic))
            continue
        if room == 1 and pairs and partners:
            for entry in [order[index - 1], *partners]:
                picked.left.append((entry[2], entry[3]))
            for entry in partners:
                order.remove(entry)
            continue
        if course.final(topic, day):
            if quota[course.name] <= 0:
                continue
            quota[course.name] -= 1
        if key[0] == 0:
            picked.taken.append((key[1], course))
        picked.chosen[course.name].append(topic)
        room -= 1
        for entry in partners:
            order.remove(entry)
        order[index:index] = partners
    return picked


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
    for course in courses:
        course.fresh.clear()
        course.watch(course.startable(day))

    def take(
        course: _Course,
        count: float,
        among: set[str] | None = None,
        *,
        pool: Collection[str] | None = None,
        bound: bool = True,
        pace: bool = False,
    ) -> int:
        """Up to ``count`` ready topics of ``among`` in path order from the
        window (``_Course.opens``; all of them when not ``bound``), those
        related to one it starts today first: a second topic on one day builds
        on what the first does. The window is read from the earliest untaught
        topic of ``pool`` (of ``among`` when None), so narrowing the
        candidates never moves where he is in the material."""
        taken = 0
        while taken < count:
            front = course.front(among if pool is None else pool)
            # Ready topics go in path order, arc by arc, so a free arc later in
            # the path gives one only when no earlier arc in the window has one
            # ready, bar one related to today's start. capacity._opened mirrors
            # this order: change the two together.
            ready = [
                topic
                for topic in course.untaught
                if (among is None or topic in among)
                and course.ready(topic)
                and (not bound or course.opens(topic, front))
            ]
            near = [t for t in ready if course.related(t, chosen[course.name])]
            if not ready:
                break
            topic = (near or ready)[0]
            course.start(topic, day, front, pace=pace)
            chosen[course.name].append(topic)
            taken += 1
        return taken

    def spare(course: _Course, among: list[str], pool: list[str]) -> int:
        """One topic of ``among`` beyond what the paces and the gaps need, from
        the window read from ``pool``. Two unrelated topics on one day split
        his attention, so it starts one only on a day that starts none yet, or
        one related to a topic this course starts today, unless his own rate
        that weekday holds two."""
        if not any(chosen.values()) or week.on(day).new.value >= 2:
            return take(course, 1, set(among), pool=pool)
        started = chosen[course.name]
        related = {t for t in among if course.related(t, started)}
        return take(course, 1, related, pool=pool)

    exams = sorted(
        (course for course in courses if course.new_end(day) is not None),
        key=lambda course: (course.exam.day if course.exam else day, course.name),
    )
    paces: dict[str, int] = {}
    for course in exams:
        end = course.new_end(day)
        assert end is not None
        left = _study_days(week, day, end)
        if left > 0 and course.scoped:
            paces[course.name] = math.ceil(len(course.scoped) / left)
    if begun is not None:
        room = max(room, sum(paces.values()) - begun)
    others = [course for course in courses if course.new_end(day) is None]
    for course in [*exams, *others]:
        startable = course.startable(day)
        gaps = course.gaps.intersection(startable)
        if room > 0 and gaps:
            room -= take(course, room, gaps, pool=startable, bound=False)
    for course in exams:
        if room > 0 and course.name in paces:
            pace = paces[course.name]
            taken = take(course, min(room, pace), set(course.scoped))
            room -= taken
            end = course.new_end(day)
            assert end is not None
            left = _study_days(week, day, end)
            if (
                room > 0
                and taken < pace
                and progress.holding_raises(left, len(course.scoped), pace)
            ):
                scoped = set(course.scoped)
                more = min(room, pace - taken)
                room -= take(course, more, scoped, bound=False, pace=True)
    for course in exams:
        while room > 0 and spare(course, course.scoped, course.scoped):
            room -= 1
    open_ = sorted(
        (course for course in courses if course.exam is None or course.outside(day)),
        key=lambda course: course.began or date.min,
    )
    while room > 0 and open_:
        started = []
        for course in open_:
            among = course.untaught if course.exam is None else course.outside(day)
            if room > 0 and spare(course, among, course.startable(day)):
                started.append(course)
                room -= 1
        open_ = started
    for course in courses:
        course.watch(course.startable(day))
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
        startable = course.startable(day)
        front = course.front(startable)
        if chosen[course.name]:
            if course.pending:
                for topic in chosen[course.name]:
                    course.starts_after[topic] = list(course.pending)
                course.pending.clear()
        elif any(
            course.ready(topic) and course.opens(topic, front) for topic in startable
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
        for course in courses:
            if course.missed is None and course.ahead(today) and not course.ahead(day):
                course.missed = course.scoped
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
            course.name: missed
            for course in courses
            if course.ahead(today)
            and (missed := course.scoped if course.missed is None else course.missed)
        },
        {course.name: dict(course.held) for course in courses if course.held},
        {
            course.name: missed
            for course in courses
            if (missed := _unreviewed(course, records[course.name], today))
        },
        {course.name: course.starts_after for course in courses if course.starts_after},
        {course.name: course.why for course in courses},
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
        if course.exam_of(topic) is not None
        if (levels[topic]["level"] != "new" or topic in started)
        and topic not in reviewed
        and levels[topic].get("last", {}).get("date", "") < final
    ]
