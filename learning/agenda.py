"""The daily plan across every course: which reviews and which new topics each
day, everything owed until the learner has shown he stops short of it, and
only on the days he studies.

Pure and read-only. The plan projects every course's record forward from today
together. Each study day (``capacity.Capacity``) takes every review due, and
each exam course's pace of new topics, unless he has shown a limit for that
kind of work: then it takes as many as his limit on that weekday, the
fractions carried from day to day within the calendar week, so a date's room
does not depend on the day the plan is made. Nothing lands on a weekday he does not
study. Planned reviews are assumed ``solid``, so a later day's reviews are the
ladder's next steps; what does not fit stays due. The plan never stores
anything; the next save and the next plan start again from what happened.

Reviews, when there are more than fit:
  0. a topic's first review, the day after it was taught, and the review of a
     topic he must learn again (missed on its last two counted days,
     ``progress``'s ``relearn``): what he has just learned, or has just shown
     he does not know, is checked within days, ahead of every older review
     and of another course's final review, which would otherwise hold it
     until its exam. Within its own course's final review it is that
     review's, and the exam's topics come before the check of one it does
     not examine. Among these, those of 2 come first, then the most recently
     worked on. One left more than its own interval late is no longer just
     learned: it ranks by memory's need with the reviews not yet solid
     (round 8: a first review two weeks late took the last place in another
     course's final review the day before its exam).
  1. a course's final review, the one deadline the plan keeps: from its
     final-review day to the exam, its reviews come before every other
     course's but first reviews, nearest exam first; within it, one its
     untaught topics wait on comes first (as in 2), so the next topic can
     start while a review of it still fits (round 10: Expectation, waiting
     on Random variables, started the day before its exam). Its solid topics are spread over its study
     days to the exam in proportion to the reviews he completes on each, so a
     lighter day takes less of it and a day off none; its not-yet-solid
     topics come back as their short intervals ask. Every taught topic is due
     by the final review, so each is reviewed before the exam whenever his
     limit leaves room for it; the plan names those it leaves without one
     (``Plan.unreviewed``), each with why (``Reason``).
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

An exam day holds nothing, of any course (``capacity.exam_days``): the exam
is that day's work. Planned as a study day less the examined course, it took
another course's reviews that the exam's final review had held, and new
topics besides (round 8: four Linear Algebra items on the Probability exam's
day). It is not a share of the day: like a day off, the plan proposes
nothing on it, and nothing he does or leaves that day reads as his limit or
his study days.

New topics come only from the ready set: topics whose prerequisites are all
solid and not lapsed, and that no taught but not yet solid competing method
(``contrasts``) would interfere with. A course with an exam ahead first gets
its pace, the topics it has left over the study days it has left before its
new topics should end (``progress.new_end``: within its final review, the day
before the exam), nearest exam first, past the pace he has shown until he has
shown a limit; so a nearer exam's last topics come before a later exam's pace,
since a topic started late is better known at the exam than one never started.
A pace is whole topics a day, its fraction carried within the calendar week
(``capacity.pace``): half a topic a day starts one every other day, and a date
gets the same pace whichever day the plan is made on. Rounding each day up
instead took a start every day from courses with no exam until the exam's
topics ran out. Once he has shown a limit, a day's pace also takes what the
days after it cannot hold, so a fraction carried to a day with no room is never
a topic lost. Spare new-topic capacity then goes to courses with no exam
ahead, the one that started a topic least recently first; then to the nearest
exam with topics left; then to the topics outside an exam's scope. While any
final review runs, the exams with topics left come before the courses with no
exam: the run-up is for the exam (round 9: Real Analysis started a topic two
days before the Probability exam while Geometric had no room).
Spare capacity starts one topic on a day that starts none, and a second only
when it belongs with the first (one needs the other, or both rest on the same
prerequisites) in the arc the plan is taking from, or his own rate that
weekday holds two: two unrelated topics in
one sitting split his attention, and nothing but a pace asks for them. A pace
that needs two still takes two, related ones first. A topic a course cannot start before its exam does not
fit, and the plan says why (``Reason``). Before any pace, an untaught topic that a taught topic needs starts first,
nearest exam first: what he has already started stands on it. A start that
waits while other courses' new topics take the days names them
(``When.starts_after``).

New topics follow the material. The path runs arc by arc, and a start comes
from the window: the earliest arc with topics left (the arc of the earliest
untaught topic he may start) and the next arc; in a course whose arcs need
nothing from each other, strands with no order between them, every arc
(``progress.window``). Once one arc builds on another the arcs are chapters,
and a later one that happens to need nothing still waits its place. That arc
is not the current arc, the arc of "You are here" (``arcs.current``): the two
differ once he studies ahead. Without arcs the path bounds it: a topic ahead of the
earliest untaught one starts only when it builds on one, so a topic that
needs nothing waits its place (``progress.opens``). An exam's pace passes the
window only on a day when holding would raise the pace it needs, or, once he
has shown a limit, when his limit on the days left cannot make the day up
(``progress.holding_raises``). Each start
says why it comes then (``When.why``): next in its arc, after what it waited
on, or early, with the earliest arc with topics left and what it waits on.

An exam with a scope examines only its topics, those of the arcs it names
less those it leaves out, with or without arcs (``progress.examining``):
only those take its review dates, its final review and its run-up, while its
pace, its gates and what does not fit hold them and their untaught
prerequisites (``progress.exam_topics``). The rest of the course is planned
as with no exam while the exam is ahead, but for the topics it leaves out
(``exam.leaves_out``): those wait for the exam's day to pass, since they are
in the material the run-up studies and the exam does not ask them. After the
exam the whole course is planned as with no exam, what it examined but he
never started included.
"""

from __future__ import annotations

from collections.abc import Collection, Mapping
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
import math
from typing import Any, Literal, TypedDict

from learning import arc_rules, capacity, progress, schema
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


Reason = Literal["no_study_day", "not_ready", "full", "too_late"]
"""Why the plan leaves a topic out before its exam, by its own rule.

A topic it cannot start (``does_not_fit``): ``no_study_day``, no day he
studies is left before the exam; ``not_ready``, on no study day before it
were its prerequisites solid and its competing methods settled
(``_Course.ready``); ``full``, it was ready, and every day it could start
went to other topics at his limit. A taught topic with no review in the
final review (``unreviewed``): ``no_study_day``, no day he studies is left
in the final review; ``too_late``, the plan starts it so near the exam that
its first review falls on the exam day or after; ``full``, every study day
of the final review went to other reviews at his limit."""


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
    checked: set[str] = field(default_factory=set)
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
    ready_once: set[str] = field(default_factory=set)
    """The exam's untaught topics ready on some study day before it."""
    moving: set[str] | None = None
    """With work saved today, the topics it touched: only these take new
    days, every other keeps the day the plan as today began gave it
    (``_Told``). None with nothing saved today: every topic moves."""

    def moves(self, topic: str) -> bool:
        return self.moving is None or topic in self.moving

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

    @property
    def left_out(self) -> frozenset[str]:
        """Untaught topics the next exam leaves out (``exam.leaves_out``) and
        none of its topics needs: they wait for the exam's day to pass."""
        left = self.record.get("exam", {}).get("leaves_out") or ()
        return frozenset(
            key for key in left if self.scope is None or key not in self.scope
        )

    def outside(self, day: date) -> list[str]:
        """Untaught topics no exam ahead needs: outside the next exam's scope
        but for those it leaves out, or, once an exam with a scope (arcs, or
        topics it leaves out) has passed, all of them, what it examined but he
        never started included. They are planned as in a course with no exam.
        After a whole-course exam nothing is, until the next exam is set. The
        exam's own day starts none: it is planned less the examined course."""
        if self.exam is None or self.exam.day == day:
            return []
        if not self.ahead(day):
            return list(self.untaught) if self.examined is not None else []
        if self.scope is None:
            return []
        return [
            key
            for key in self.untaught
            if key not in self.scope and key not in self.left_out
        ]

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
        next, and every strand of a course whose arcs need nothing from each
        other; without arcs, the path's own order."""
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
        if self.exam is None:
            return self.untaught
        if self.ahead(day):
            return [key for key in self.untaught if key not in self.left_out]
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

    def due_moving(self, day: date) -> bool:
        """Whether a topic that moves has a review due on ``day``
        (``due_items``): a day with none keeps what it holds."""
        if (
            not self.asks
            or not self.moving
            or (self.exam is not None and self.exam.day == day)
        ):
            return False
        when = day.isoformat()
        for topic in self.moving:
            entry = self.record["topics"].get(topic, {})
            due = entry.get("review", {}).get("due")
            if (
                due is not None
                and due <= when
                and "excluded" not in entry
                and self.levels[topic]["level"] != "new"
            ):
                return True
        return False

    def starts_moving(self) -> bool:
        """Whether an untaught topic moves, so the day's new topics are
        chosen again (``_new``)."""
        moving = self.moving or set()
        return any(t in moving for t in self.untaught)

    def due(self, day: date) -> list[str]:
        return [item["topic"] for item in self.due_items(day)]

    def first(self, topic: str) -> bool:
        """Its next review is its first: taught, and no review answered yet,
        on record or in the plan."""
        return topic not in self.checked and progress.PROBE not in (
            self.replayed[topic].days.values()
        )

    def just_learned(self, topic: str, item: dict[str, Any]) -> bool:
        """A check of what he has just learned, or has just shown he does not
        know: its first review, or one of a topic missed on its last two
        counted days (``progress``'s ``relearn``), while it is no more than
        its own interval late (``progress.late_share``). Past that its gap
        has doubled: it is no longer just learned, and memory's need ranks
        it with the reviews not yet solid."""
        return (
            self.first(topic) or bool(self.levels[topic].get("relearn"))
        ) and self.need(item) <= 1

    def worked(self, topic: str) -> int:
        """The day he last worked on it, as a day number."""
        last = self.levels[topic].get("last", {}).get("date")
        return date.fromisoformat(last).toordinal() if last else 0

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
        self.checked.add(topic)
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
    reasons: Mapping[str, Reason] = field(default_factory=dict)
    """Why each topic of ``does_not_fit`` and ``unreviewed`` is left out."""
    final: date | None = None
    """The final-review start the plan was made with (``Plan.finals``)."""

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
    reasons: dict[str, dict[str, Reason]] = field(default_factory=dict)
    """Why each topic of ``does_not_fit`` and ``unreviewed`` is left out, by
    course and topic (``Reason``)."""
    finals: dict[str, date] = field(default_factory=dict)
    """Each exam course's final-review start this plan was made with: the
    one every view names (``replay``)."""

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
            dict(self.reasons.get(name, {})),
            self.finals.get(name),
        )


def _whole(week: Capacity, day: date, kind: str) -> int:
    """A study day's whole items of ``kind`` (``Capacity.room``)."""
    return week.room(day, kind)


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


def _room_after(week: Capacity, day: date, last: date) -> int | None:
    """The new topics his shown limit holds from the day after ``day`` to
    ``last``, as the days take them (``_whole``); None while he has shown
    none."""
    if not week.on(day).new.shown:
        return None
    days = (day + timedelta(days=n) for n in range(1, (last - day).days + 1))
    return sum(_whole(week, other, "new") for other in days if week.studies(other))


def _reviews(
    courses: list[_Course], day: date, room: float, week: Capacity
) -> dict[str, list[str]]:
    """The day's reviews within ``room``: first reviews, then final reviews,
    nearest exam first, then by memory's need (the module's rule). Each one a full day
    leaves out waits on its course's ``holding``, with the course whose final
    review took some of the day."""
    candidates, quota = _candidates(courses, day, week)
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


Candidate = tuple[tuple[Any, ...], str, _Course, str]


def _candidates(
    courses: list[_Course], day: date, week: Capacity
) -> tuple[list[Candidate], dict[str, int]]:
    """Every review due on ``day``, in the module's order, and each final
    review's quota of the day."""
    candidates: list[Candidate] = []
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
                key: tuple[Any, ...] = (
                    0,
                    distance,
                    topic not in gates,
                    *course.oldest(topic, day),
                    rank,
                )
                candidates.append((key, course.name, course, topic))
                continue
            tier = course.tier(topic, day)
            learning = tier == RELEARNING
            gating = learning and topic in gates
            if course.just_learned(topic, item) and not reviewing:
                key = (
                    -1,
                    not gating,
                    distance if gating else 0.0,
                    -course.worked(topic),
                    distance if examined else math.inf,
                    rank,
                )
                candidates.append((key, course.name, course, topic))
                continue
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
    return candidates, quota


def _kept_reviews(
    courses: list[_Course], day: date, room: float, week: Capacity, told: _Told
) -> dict[str, list[str]]:
    """The day's reviews in a step of the replay (``_Told``): the reviews
    the plan before the step put on it, of topics that do not move, which
    stay; then each topic that moves, in the module's order, where that
    order puts it within ``room`` among the reviews already on the day, and
    after the topics moved before it. So a save never takes the day an
    earlier one told him, and a day may hold more than his limit by what a
    save moved past the reviews it found there. A topic moves when the step's save touched it, or
    when its start, kept from the plan before, is no longer ready: its
    reviews then follow its new start, never one before it."""
    chosen = {
        c.name: [t for t in told.kept(c.name, day, "reviews") if not c.moves(t)]
        for c in courses
    }
    if not any(course.due_moving(day) for course in courses):
        return chosen
    candidates, quota = _candidates(courses, day, week)
    for course in courses:
        if course.name in quota:
            quota[course.name] -= sum(
                course.final(topic, day) for topic in chosen[course.name]
            )
    rank = {(name, topic): key for key, name, _, topic in candidates}
    first = (-math.inf,)
    kept = [
        rank.get((name, topic), first)
        for name, topics in chosen.items()
        for topic in topics
    ]
    moved = 0
    for key, name, owner, topic in candidates:
        if not owner.moves(topic):
            continue
        ahead = (
            len(kept) if told.yields else sum(other < key for other in kept)
        ) + moved
        final = owner.final(topic, day)
        if week.studies(day) and ahead < room and (not final or quota[name] > 0):
            chosen[name].append(topic)
            moved += 1
            if final:
                quota[name] -= 1
        else:
            owner.wait(topic, None)
    return chosen


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
        if week.studies(day) and course.ahead(day):
            course.ready_once.update(t for t in course.scoped if course.ready(t))

    def take(
        course: _Course,
        count: float,
        among: set[str] | None = None,
        *,
        pool: Collection[str] | None = None,
        bound: bool = True,
        pace: bool = False,
        second: bool = False,
    ) -> int:
        """Up to ``count`` ready topics of ``among`` in path order from the
        window (``_Course.opens``; all of them when not ``bound``), those
        related to one it starts today first: a second topic on one day builds
        on what the first does, within the arc it would take anyway, so a
        later arc's topic never passes the earlier arc's next one for sharing
        a prerequisite. A ``second`` takes only such a topic, or none. The
        window is read from the earliest untaught
        topic of ``pool`` (of ``among`` when None), so narrowing the
        candidates never moves where he is in the material."""
        taken = 0
        while taken < count:
            front = course.front(among if pool is None else pool)
            # Ready topics go in path order, arc by arc, so a strand later in
            # the path gives one only when no earlier arc in the window has one
            # ready. capacity._opened mirrors this order: change the two
            # together.
            ready = [
                topic
                for topic in course.untaught
                if (among is None or topic in among)
                and course.moves(topic)
                and course.ready(topic)
                and (not bound or course.opens(topic, front))
            ]
            if not ready:
                break
            near = [
                t
                for t in ready
                if course.arc(t) == course.arc(ready[0])
                and course.related(t, chosen[course.name])
            ]
            if second and not near:
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
        alone = not any(chosen.values()) or week.on(day).new.value >= 2
        return take(course, 1, set(among), pool=pool, second=not alone)

    def share(group: list[_Course]) -> int:
        """Topics planned as in a course with no exam, within ``room``: one
        per course of ``group`` a round, the course that started a topic least
        recently first, while any of them starts one."""
        group = sorted(group, key=lambda course: course.began or date.min)
        count = 0
        while count < room and group:
            started = []
            for course in group:
                among = course.untaught if course.exam is None else course.outside(day)
                if count < room and spare(course, among, course.startable(day)):
                    started.append(course)
                    count += 1
            group = started
        return count

    exams = sorted(
        (course for course in courses if course.new_end(day) is not None),
        key=lambda course: (course.exam.day if course.exam else day, course.name),
    )
    paces: dict[str, int] = {}
    before: dict[str, int] = {}
    for course in exams:
        end = course.new_end(day)
        assert end is not None
        left = _study_days(week, day, end)
        if left > 0 and course.scoped:
            rest = len(course.scoped)
            after = _room_after(week, day, end)
            before[course.name] = rest
            paces[course.name] = max(
                capacity.pace(rest, left, day, week.studies),
                rest - after if after is not None else 0,
            )
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
                and progress.holding_raises(
                    left,
                    len(course.scoped),
                    before[course.name],
                    _room_after(week, day, end),
                )
            ):
                scoped = set(course.scoped)
                more = min(room, pace - taken)
                room -= take(course, more, scoped, bound=False, pace=True)
    open_ = [course for course in others if course.exam is None or course.outside(day)]
    if not any(course.reviewing(day) for course in exams):
        room -= share(open_)
    for course in exams:
        while room > 0 and spare(course, course.scoped, course.scoped):
            room -= 1
    room -= share(open_)
    room -= share([course for course in exams if course.outside(day)])
    for course in courses:
        course.watch(course.startable(day))
    _waited(courses, chosen, day)
    return chosen


def _kept_new(
    courses: list[_Course], day: date, week: Capacity
) -> dict[str, list[str]]:
    """New topics in a step of the replay where no untaught topic moves: none
    beyond those the plan before kept, and what ``_new`` notes of the day."""
    for course in courses:
        course.fresh.clear()
        if week.studies(day) and course.ahead(day):
            course.ready_once.update(t for t in course.scoped if course.ready(t))
    return {course.name: [] for course in courses}


def touched(record: dict[str, Any], today: date) -> set[str]:
    """The topics he answered or started today: a prediction, which never
    counts, moves nothing."""
    day = today.isoformat()
    return {
        topic
        for item in record["observations"].values()
        if item["date"] >= day and schema.counts(item)
        for topic in item["topics"]
    } | {
        key
        for key, topic in record["topics"].items()
        if topic.get("introduced", "") >= day
    }


Stamp = tuple[int, datetime]
"""When a save on a day came, in the order of that day's saves: an answer
when it was recorded; a start with no answer that day after every answer
(``_starts``)."""
_LATE = (1, datetime.min.replace(tzinfo=UTC))


def _stamp(item: dict[str, Any]) -> Stamp:
    return (0, datetime.fromisoformat(item["recorded"]))


def _answers(record: dict[str, Any], day: date) -> dict[str, dict[str, Any]]:
    """His answers on ``day`` that count: a prediction moves nothing."""
    when = day.isoformat()
    return {
        key: item
        for key, item in record["observations"].items()
        if item["date"] == when and schema.counts(item)
    }


def _starts(record: dict[str, Any], day: date) -> dict[str, Stamp]:
    """The topics he started on ``day``, each at its first answer that day,
    or, with none, after every answer: a lesson opened and not yet
    answered is the latest thing he did."""
    when = day.isoformat()
    answers = _answers(record, day)
    found: dict[str, Stamp] = {}
    for key, topic in record["topics"].items():
        if topic.get("introduced") != when:
            continue
        stamps = [_stamp(item) for item in answers.values() if key in item["topics"]]
        found[key] = min(stamps, default=_LATE)
    return found


def as_of(
    record: dict[str, Any],
    day: date,
    stamp: Stamp | None = None,
    until: date | None = None,
) -> dict[str, Any]:
    """The record as it stood on ``day`` once the save at ``stamp`` was made,
    as ``day`` began when None: without the answers after it through
    ``until`` (``day`` when None), a topic started then not yet started,
    and each review the engine set again for one of them back on the day
    the answers before gave it. A day a tutor pinned past ``until`` stays.
    Record edits that are not answers or starts carry no time, so the
    record keeps them throughout."""
    when = day.isoformat()
    last = (until or day).isoformat()

    def before(item: dict[str, Any]) -> bool:
        if item["date"] != when:
            return bool(item["date"] < when or item["date"] > last)
        return stamp is not None and (not schema.counts(item) or _stamp(item) <= stamp)

    observations = {
        key: item for key, item in record["observations"].items() if before(item)
    }
    starts = _starts(record, day)
    later = {
        key
        for key, topic in record["topics"].items()
        if when < topic.get("introduced", "") <= last
        or (key in starts and (stamp is None or starts[key] > stamp))
    }
    topics = {
        key: {name: value for name, value in topic.items() if name != "introduced"}
        if key in later
        else topic
        for key, topic in record["topics"].items()
    }
    dropped = later | {
        topic
        for key, item in record["observations"].items()
        if key not in observations
        for topic in item["topics"]
    }
    before_ = {**record, "observations": observations}
    replayed = progress.replays({**before_, "topics": topics})
    for key in dropped & topics.keys():
        review = topics[key].get("review", {})
        if review.get("by") != "engine":
            continue
        rest = {name: value for name, value in review.items() if name != "due"}
        due = replayed[key].due
        entry = {
            **topics[key],
            "review": {**rest, "due": due.isoformat()} if due else rest,
        }
        topics[key] = (
            entry
            if entry["review"]
            else {name: value for name, value in entry.items() if name != "review"}
        )
    return {**before_, "topics": topics}


def morning(record: dict[str, Any], today: date) -> dict[str, Any]:
    """The record as today began (``as_of``)."""
    return as_of(record, today)


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


@dataclass(frozen=True)
class _Told:
    """A step of the replay (``replay``): the plan before it (``plan``,
    made on ``on``) and the topics the step moves in each course
    (``touched``): every other topic keeps the days that plan gave it.
    ``morning`` is the plan as the step's day began, which says which of
    today's reviews were on today's plan (``plan``)."""

    plan: Plan
    touched: Mapping[str, set[str]]
    on: date
    morning: Plan | None
    yields: bool = False
    """A night's step: what it moves takes only the room the days he was
    told leave, so what he left never stacks a day past his limit."""

    def kept(self, name: str, day: date, kind: str) -> list[str]:
        """The ``kind`` items the plan before put on ``day``, of topics the
        step does not touch."""
        held: list[str] = self.plan.days[name][(day - self.on).days][kind]
        return [topic for topic in held if topic not in self.touched.get(name, ())]

    def untouched(self, name: str, found: Mapping[str, Any]) -> dict[str, Any]:
        """Of a mapping by this course's topics in the plan before, those the
        step does not touch."""
        return {
            topic: value
            for topic, value in found.get(name, {}).items()
            if topic not in self.touched.get(name, ())
        }


@dataclass(frozen=True)
class Replay:
    """The plan now and the plans it was made from (``replay``)."""

    now: Plan
    began: Plan
    """The plan as today began."""
    told: Plan | None
    """The plan as the last day he studied before today ended (``studied``),
    made on that day: the days he was last told. None before his first."""
    studied: date | None
    afresh: bool = False
    """Whether today began with a plan made afresh: the last day he studied
    left an item of its plan untouched (``left``) and showed where he
    stops, or a day he studies went by with no study after it (``missed``)."""
    missed: bool = False
    since: date | None = None
    """The first day of the run the replay holds: the day that began with a
    plan made afresh. Only saves from then on move a day past his limit."""
    left: Mapping[str, set[str]] = field(default_factory=dict)
    """By course, what ``told`` put on ``studied`` and he left undone: when
    today began from it, the only topics the night moves."""
    finals: Mapping[str, tuple[str, str]] = field(default_factory=dict)
    """By course whose stored record leaves its final review to the plan
    (``progress.unplanned``), the exam day and final-review start today's
    plan was made with: read from his pace on the day the run began
    (``since``), and held through the days he finished since, as the days
    he was told are."""


def plan(
    records: Mapping[str, dict[str, Any]],
    today: date,
    days: int,
    week: Capacity | None = None,
) -> Plan:
    """Every course's plan for ``days`` days from today, together
    (``replay``)."""
    return replay(records, today, days, week).now


def afresh(
    records: Mapping[str, dict[str, Any]],
    today: date,
    days: int,
    week: Capacity | None = None,
) -> Plan:
    """The plan made afresh from the records as they stand, by the module's
    rules alone: what a day begins from after one he left work owed or
    missed (``replay``)."""
    return _planned(records, today, days, week, None)


def replay(
    records: Mapping[str, dict[str, Any]],
    today: date,
    days: int,
    week: Capacity | None = None,
) -> Replay:
    """Every course's plan for ``days`` days from today, made again from the
    records as he was told it.

    A day he was told stays until his own study moves it (Edo, 15 Nov), and
    the plan stores nothing, so it is replayed. Each of a day's saves, in
    the order he made them, moves only the topics it touched (an answer that
    counts, or a start), and every other topic keeps the days the plan
    before it gave it: so a later save never moves a day an earlier one told
    him, in any course (round 10: a Probability save moved Eigen from 12 to
    20 Nov an hour after its own save told 12). A topic whose start moves
    takes its reviews with it, so none comes before its first lesson.

    A day begins from the plan as the last day he studied ended: the night
    moves nothing but what that plan left on its day, an item he neither
    answered nor started, and that takes the room the days he was told
    leave, so a finished day's days all hold (round 10: one moved 19 dates
    overnight); and what it put on a day his week no longer studies, since
    nothing lands on one. A day counts as unfinished only when it left such an item:
    what his limit owed beyond the plan is his limit's evidence, never work
    left, and an open question at Done for today leaves its topic answered
    (round 11: a day whose plan was all done moved 36 dates overnight, and
    the pages called it unfinished). An unfinished day that also showed
    where he stops (``capacity.Done``'s ``reviews_short`` or ``new_short``),
    or a day he studies gone by with no study, is his own study moving the
    days, so the next begins with a plan made afresh from the record as it
    began, which spreads what he left within his limit. So the replay
    reaches back through the days he finished, to the day after one he did
    not.

    ``week`` is his week on every day the plan is made; by default, what the
    records showed as each day began (``capacity.of``). Today's allowance is
    what is left after the reviews done today that the plan as today began
    held for today: a review he chose beyond them, one it had put on a later
    day, is study past the plan, and takes no place from a review still
    planned today.
    """
    return _day(records, today, days, week, today, told=True)


def _day(
    records: Mapping[str, dict[str, Any]],
    day: date,
    days: int,
    week: Capacity | None,
    until: date,
    *,
    told: bool,
) -> Replay:
    """The plan of ``day`` as its saves through ``until`` leave it, for
    ``days`` days, and the plans it was made from (``replay``); with
    ``told`` false, the plan the last day he studied ended with only where
    this day began from it."""
    morning = _at(records, day, None, until)
    weekly = week or capacity.of(morning.values(), day)
    studied = _last_studied(records, day)
    if studied is None:
        return _afresh(records, day, days, (weekly, morning), until, None)
    missed = any(
        weekly.studies(studied + timedelta(days=n))
        for n in range(1, (day - studied).days)
    )
    span = days + (day - studied).days
    if missed:
        ended = (
            _day(records, studied, span, week, until, told=False).now if told else None
        )
        return _afresh(records, day, days, (weekly, morning), until, (ended, studied))
    before = _day(records, studied, span, week, until, told=False)
    ended = before.now
    left = {
        name: {
            topic
            for planned in ended.days[name][: (day - studied).days]
            for topic in (*planned["reviews"], *planned["new"])
        }
        for name in records
    }
    done = capacity.activity(morning.values(), day).get(studied, capacity.Done())
    if any(left.values()) and (done.reviews_short or done.new_short):
        return _afresh(
            records, day, days, (weekly, morning), until, (ended, studied), left
        )
    finals = before.finals
    morning = _at(records, day, None, until, finals)
    weekly = week or capacity.of(morning.values(), day)
    unstudied = {
        name: {
            topic
            for planned in ended.days[name][(day - studied).days :]
            if not weekly.studies(date.fromisoformat(planned["date"]))
            for topic in (*planned["reviews"], *planned["new"])
        }
        for name in records
    }
    moving = {name: left[name] | unstudied[name] for name in records}
    night = _Told(ended, moving, studied, None, yields=True)
    began = _planned(morning, day, days, weekly, night)
    now = _saved(records, day, days, weekly, began, until, finals)
    return Replay(now, began, ended, studied, False, False, before.since, left, finals)


def _afresh(
    records: Mapping[str, dict[str, Any]],
    day: date,
    days: int,
    read: tuple[Capacity, dict[str, dict[str, Any]]],
    until: date,
    last: tuple[Plan | None, date] | None,
    left: Mapping[str, set[str]] | None = None,
) -> Replay:
    """The plan of a day that begins afresh (``replay``): from the records
    as it began (``read``: his week and the courses, read with the final
    reviews his pace gives them that morning), after ``last``, the plan the
    last day he studied ended with and that day, when there is one."""
    weekly, morning = read
    finals = {
        name: (record["exam"]["date"], record["exam"]["final_review"])
        for name, record in morning.items()
        if "final_review" in record.get("exam", {})
        and progress.unplanned(
            progress.begun(records[name], day) if day < until else records[name]
        )
    }
    began = _planned(morning, day, days, weekly, None)
    now = _saved(records, day, days, weekly, began, until, finals)
    if last is None:
        return Replay(now, began, None, None, since=day, finals=finals)
    ended, studied = last
    return Replay(
        now, began, ended, studied, True, left is None, day, left or {}, finals
    )


def _at(
    records: Mapping[str, dict[str, Any]],
    day: date,
    stamp: Stamp | None,
    until: date | None = None,
    finals: Mapping[str, tuple[str, str]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Every course as it stood on ``day`` (``as_of``), read with the plan
    as that day read it. A final review the stored record leaves to the
    plan (``progress.unplanned``), or, on a day before ``until``, one not
    yet begun that day (``progress.begun``), starts where ``finals`` holds
    it, for the same exam day; else where his pace put it as that day began
    (``capacity.final_reviews``), not where today's pace puts it, so a day
    replayed is the day he was told (round 11: Probability's final review,
    read from 10 Nov's pace, replayed 9 Nov's plan with a start a day later,
    and 16 dates moved overnight after a day whose plan was all done)."""
    unread = {
        name
        for name, record in records.items()
        if progress.unplanned(
            progress.begun(record, day) if until is not None and day < until else record
        )
    }
    records = {
        name: progress.with_final_review(record, None) if name in unread else record
        for name, record in records.items()
    }
    held = {
        name: progress.redated(
            progress.with_final_review(record, date.fromisoformat(finals[name][1])),
            day,
        )
        for name, record in records.items()
        if finals
        and name in unread
        and name in finals
        and finals[name][0] == record["exam"]["date"]
    }
    # ``as_of`` replays each topic with some final review; the reading below
    # dates every one the engine set again, so the exam day serves until then.
    placed = {
        name: progress.with_final_review(
            record, date.fromisoformat(record["exam"]["date"])
        )
        if name in unread
        else record
        for name, record in records.items()
    }
    stood = {
        name: as_of(record, day, stamp, until)
        for name, record in {**placed, **held}.items()
    }
    return capacity.final_reviews(
        {
            name: progress.with_final_review(record, None)
            if name in unread and name not in held
            else record
            for name, record in stood.items()
        },
        day,
    )


def _last_studied(records: Mapping[str, dict[str, Any]], today: date) -> date | None:
    """The last day before today he answered, with an answer that counts, or
    started a topic, in any course."""
    when = today.isoformat()
    days = {
        item["date"]
        for record in records.values()
        for item in record["observations"].values()
        if item["date"] < when and schema.counts(item)
    } | {
        str(topic["introduced"])
        for record in records.values()
        for topic in record["topics"].values()
        if str(topic.get("introduced", "")) < when and topic.get("introduced")
    }
    return date.fromisoformat(max(days)) if days else None


def _saves(
    records: Mapping[str, dict[str, Any]], day: date
) -> list[tuple[Stamp, dict[str, set[str]]]]:
    """The saves of ``day`` that moved something, in the order he made them,
    each with the topics it touched by course. A save that touches no more
    than the next one is left out: the next moves all it moved, from the
    same days, so the result is the same."""
    found: dict[Stamp, dict[str, set[str]]] = {}
    for name, record in records.items():
        for item in _answers(record, day).values():
            found.setdefault(_stamp(item), {}).setdefault(name, set()).update(
                item["topics"]
            )
        for topic, stamp in _starts(record, day).items():
            found.setdefault(stamp, {}).setdefault(name, set()).add(topic)
    ordered = sorted(found.items())
    return [
        (stamp, touched)
        for index, (stamp, touched) in enumerate(ordered)
        if index + 1 == len(ordered) or not _within(touched, ordered[index + 1][1])
    ]


def _within(touched: Mapping[str, set[str]], other: Mapping[str, set[str]]) -> bool:
    return all(topics <= other.get(name, set()) for name, topics in touched.items())


def _saved(
    records: Mapping[str, dict[str, Any]],
    day: date,
    days: int,
    week: Capacity | None,
    began: Plan,
    until: date | None = None,
    finals: Mapping[str, tuple[str, str]] | None = None,
) -> Plan:
    """The plan on ``day`` after each of its saves in turn, from ``began``,
    the plan as the day began; ``until`` and ``finals`` as ``_at`` reads
    them."""
    result = began
    for stamp, touched in _saves(records, day):
        step = _Told(result, touched, day, began)
        stood = _at(records, day, stamp, until, finals)
        result = _planned(stood, day, days, week, step)
    return result


def _planned(
    records: Mapping[str, dict[str, Any]],
    today: date,
    days: int,
    week: Capacity | None,
    told: _Told | None,
) -> Plan:
    week = (week or capacity.of(records.values(), today)).resting(
        capacity.exam_days(records.values())
    )
    courses = [_Course.of(name, record) for name, record in records.items()]
    if told is not None:
        for course in courses:
            course.moving = set(told.touched.get(course.name, ()))
    done = capacity.Done(
        new=sum(
            capacity.first_day(course.replayed[key], course.record["topics"][key])
            == today
            for course in courses
            for key in course.replayed
        )
    )
    spent = 0
    if told is not None and told.morning is not None:
        spent = sum(
            1
            for course in courses
            for topic in told.morning.days[course.name][0]["reviews"]
            if course.replayed[topic].days.get(today.isoformat()) == progress.PROBE
        )
    for offset in range(days):
        day = today + timedelta(days=offset)
        rates = week.on(day)
        reviews_room: float = 0
        new_room: float = 0
        begun: int | None = None
        if week.studies(day):
            reviews_room = (
                _whole(week, day, "reviews") if rates.reviews.shown else math.inf
            )
            new_room = _whole(week, day, "new")
            if not rates.new.shown:
                begun = done.new if offset == 0 else 0
        if offset == 0:
            reviews_room = max(reviews_room - spent, 0)
            new_room = max(new_room - done.new, 0)
        for course in courses:
            if course.missed is None and course.ahead(today) and not course.ahead(day):
                course.missed = course.scoped
        reviews = (
            _reviews(courses, day, reviews_room, week)
            if told is None
            else _kept_reviews(courses, day, reviews_room, week, told)
        )
        for course in courses:
            for topic in reviews[course.name]:
                course.place(topic)
                course.reviewed(topic, day)
        starts = {course.name: list[str]() for course in courses}
        if told is not None:
            for course in courses:
                assert course.moving is not None
                for topic in told.kept(course.name, day, "new"):
                    if course.moves(topic):
                        continue
                    if topic in course.untaught and course.ready(topic):
                        course.start(topic, day, course.front(course.startable(day)))
                        course.why[topic] = told.plan.why[course.name][topic]
                        starts[course.name].append(topic)
                        new_room -= 1
                    else:
                        course.moving.add(topic)
        new = (
            _new(courses, day, max(new_room, 0), week, begun)
            if told is None or any(course.starts_moving() for course in courses)
            else _kept_new(courses, day, week)
        )
        for course in courses:
            course.days.append(
                {
                    "date": day.isoformat(),
                    "reviews": reviews[course.name],
                    "new": [*starts[course.name], *new[course.name]],
                }
            )
    late = {
        course.name: missed
        for course in courses
        if course.ahead(today)
        and (missed := course.scoped if course.missed is None else course.missed)
    }
    unreviewed = {
        course.name: missed
        for course in courses
        if (missed := _unreviewed(course, records[course.name], today))
    }
    if told is not None:
        for course in courses:
            course.held.update(told.untouched(course.name, told.plan.held))
            course.starts_after.update(
                told.untouched(course.name, told.plan.starts_after)
            )
    return Plan(
        {course.name: course.days for course in courses},
        late,
        {course.name: dict(course.held) for course in courses if course.held},
        unreviewed,
        {
            course.name: after
            for course in courses
            if (
                after := {
                    topic: names
                    for topic, names in course.starts_after.items()
                    if topic not in late.get(course.name, [])
                }
            )
        },
        {course.name: course.why for course in courses},
        {
            course.name: reasons
            for course in courses
            if (
                reasons := _reasons(
                    course,
                    week,
                    today,
                    late.get(course.name, []),
                    unreviewed.get(course.name, []),
                )
            )
        },
        {course.name: course.exam.final for course in courses if course.exam},
    )


def _reasons(
    course: _Course,
    week: Capacity,
    today: date,
    late: list[str],
    unreviewed: list[str],
) -> dict[str, Reason]:
    """Why the plan leaves each of ``late`` (``does_not_fit``) and
    ``unreviewed`` out (``Reason``)."""
    exam = course.exam
    if exam is None:
        return {}
    eve = exam.day - timedelta(days=1)
    reasons: dict[str, Reason] = {}
    no_day = not _study_days(week, today, eve)
    for topic in late:
        if no_day:
            reasons[topic] = "no_study_day"
        else:
            reasons[topic] = "full" if topic in course.ready_once else "not_ready"
    starts = {t: date.fromisoformat(d["date"]) for d in course.days for t in d["new"]}
    no_review_day = not _study_days(week, max(exam.final, today), eve)
    for topic in unreviewed:
        first = starts.get(topic)
        if first and first + timedelta(days=progress.FIRST_RETRIEVAL_DAYS) >= exam.day:
            reasons[topic] = "too_late"
        else:
            reasons[topic] = "no_study_day" if no_review_day else "full"
    return reasons


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
