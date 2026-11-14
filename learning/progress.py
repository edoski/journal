"""Derived progress: verdicts, standings, the review ladder, due lists, path order.

Pure functions over a validated course record (``schema.validate_record``).
Each counted day of a topic gets one verdict (``solid``, ``helped`` or
``missed``); levels, lapses and the next expected review are replayed from the
verdicts. Nothing here is stored except the reviews ``schedule`` sets.

An exam bounds the course's schedule: every review before it lands no later
than the final review, and a review that would fall on or after the exam, or
that follows a ``solid`` answer from the final review on, moves to its spaced
date after the exam (at the earliest the day after it), where the course's
reviews go on. The final review starts ``final_review_days`` before the exam
when the learner set that course preference; otherwise on the day the plan
reads from his pace whenever the record is read (``capacity.final_reviews``),
which the exam keeps as ``final_review`` once that day has come
(``begun``). A record read without the plan has no final review to go by.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Callable, Collection
from dataclasses import dataclass, field
from datetime import date, timedelta
import heapq
from itertools import groupby
from typing import Any

from learning import arc_rules, preferences
from learning.schema import PatchResult, number, unaided

LADDER = (3, 7, 16, 35, 75, 160)
INTERVALS = {"missed": 1, "helped": 2}
FIRST_RETRIEVAL_DAYS = 1
RETAINED_VERDICTS = 2
# Two misses in a row: the second rules out a slip, so asking again would only
# repeat the failure.
RELEARN_MISSES = 2
# The shortest final review: a topic missed on its first day comes back after
# the miss interval and is answered again before the exam.
SHORTEST_FINAL_REVIEW = INTERVALS["missed"] + 1
SCHEDULING_KINDS = frozenset({"attempt", "exam"})


def counts(observation: dict[str, Any]) -> bool:
    """An answer that counts for levels and reviews: an attempt or an exam,
    except a prediction made before its step was taught (``predicted``).
    Before the teaching a wrong guess is expected, so it says nothing about
    what is held, and a right one is not yet recall of what was taught; it
    stays in the history as what happened."""
    return observation["kind"] in SCHEDULING_KINDS and not observation.get("predicted")


DUE_LIMIT = 5
RUNUP_DAYS = 21
RECENT_SOLID_DAYS = 14
WEEK_DAYS = 7
# Grades from worst to best.
GRADES = ("missed", "helped", "solid")
# Levels that rest on an unaided solid answer.
SECURE = frozenset({"independent", "retained", "transferred"})
LEARNING, PROBE, PRACTICE = "learning", "probe", "practice"

Attempt = tuple[str, dict[str, Any]]


@dataclass(frozen=True)
class Exam:
    """The exam day and the day its final review falls due."""

    day: date
    final: date


# The last new topic needs its first retrieval and one solid review before the
# final review: the ladder's first two steps.
NEW_BEFORE_FINAL = FIRST_RETRIEVAL_DAYS + LADDER[0]


def last_new_day(exam: Exam) -> date:
    """The day by which the path's new topics should all be introduced."""
    return exam.final - timedelta(days=NEW_BEFORE_FINAL)


def new_end(exam: Exam, day: date) -> date:
    """The last day the course takes new topics, seen from ``day`` before its
    exam: the last new-topic day; once that has passed, the day before the
    final review; once that has passed too, the day before the exam, since a
    topic started late is better known at the exam than one never started, and
    a nearer exam's last topics come before a later exam's pace."""
    last = last_new_day(exam)
    if day <= last:
        return last
    if day < exam.final:
        return exam.final - timedelta(days=1)
    return exam.day - timedelta(days=1)


def _lead(record: dict[str, Any]) -> int:
    """The course preference's final review length; 0 when unset."""
    return preferences.count(record["preferences"], preferences.FINAL_REVIEW_DAYS, 0)


def exam_plan(record: dict[str, Any]) -> Exam | None:
    """The course's exam with its final review: ``final_review_days`` before
    it by the course preference, else from the day the plan reads
    (``capacity.final_reviews``)."""
    value = record.get("exam", {}).get("date")
    if not value:
        return None
    day = date.fromisoformat(value)
    if lead := _lead(record):
        return Exam(day, day - timedelta(days=lead))
    start = record["exam"].get("final_review")
    if start is None:
        raise LookupError(
            f"the final review before the exam on {value} is read with the plan "
            "(capacity.final_reviews); this record was read without it"
        )
    return Exam(day, date.fromisoformat(start))


def examining(record: dict[str, Any]) -> Callable[[str], Exam | None]:
    """Each topic's exam: the course's, for a topic the next exam examines;
    None for one outside the arcs it names (``arc_rules.examined``), which is
    scheduled as in a course with no exam. The set reads no evidence, so a
    topic keeps its exam, or its lack of one, as he is taught."""
    exam = exam_plan(record)
    examined = arc_rules.examined(record)
    if exam is None or examined is None:
        return lambda key: exam
    return lambda key: exam if key in examined else None


def exam_for(record: dict[str, Any], key: str) -> Exam | None:
    """The exam that examines ``key``, else None (``examining``)."""
    return examining(record)(key)


def exam_topics(
    record: dict[str, Any], untaught: Collection[str]
) -> frozenset[str] | None:
    """What the next exam needs started: the topics it examines and every
    ``untaught`` topic they need, directly or through others. None when the
    exam names no arcs (the whole course). An untaught prerequisite of an
    examined topic is not examined itself, but the exam's topics cannot start
    without it, so its start keeps the exam's pace; once taught it leaves
    this set, and its reviews never had the exam's."""
    examined = arc_rules.examined(record)
    if examined is None:
        return None
    waiting = set(untaught)
    scope, stack = set(examined), list(examined)
    while stack:
        for need in needs(record, stack.pop()):
            if need in waiting and need not in scope:
                scope.add(need)
                stack.append(need)
    return frozenset(scope)


def unplanned(record: dict[str, Any]) -> bool:
    """An exam whose final review the plan has yet to read: no course
    preference sets its length and it has not begun."""
    exam = record.get("exam", {})
    return "date" in exam and not _lead(record) and "final_review" not in exam


def with_final_review(record: dict[str, Any], start: date | None) -> dict[str, Any]:
    """The record with its final review starting on ``start``, or with none
    read yet (``None``)."""
    exam = {k: v for k, v in record.get("exam", {}).items() if k != "final_review"}
    if start is not None:
        exam["final_review"] = start.isoformat()
    return {**record, "exam": exam}


def begun(record: dict[str, Any], today: date) -> dict[str, Any]:
    """The record as a save stores it: the final review's start only once it
    has come and no course preference sets it.

    Until then the start is read from his pace on every read, so it follows
    the evidence. Once a day of the final review has come, its start is
    history: the plan never starts it before the day it reads it, and his
    pace, the path and the other exams it is read from keep changing, so no
    later read could find the day again; yet an answer given in it counts as
    the final review's (a ``solid`` one sends the next review past the exam)
    and must stay counted.
    """
    start = record.get("exam", {}).get("final_review")
    if start is None or (not _lead(record) and start <= today.isoformat()):
        return record
    return with_final_review(record, None)


def redated(record: dict[str, Any], today: date) -> dict[str, Any]:
    """The record with every date the engine set re-derived from its final
    review as now read, while the exam is ahead: what each save would set.
    A tutor's date stands."""
    exam = exam_plan(record)
    if exam is None or exam.day <= today:
        return record
    exam_of = examining(record)
    histories = _histories(record["observations"])
    topics = dict(record["topics"])
    for key, topic in topics.items():
        review = topic.get("review", {})
        if review.get("by") != "engine":
            continue
        attempts = histories.get(key, _History()).attempts
        due = replay(key, topic, attempts, exam_of(key)).due
        if due is not None and due.isoformat() != review.get("due"):
            topics[key] = {**topic, "review": {**review, "due": due.isoformat()}}
    return {**record, "topics": topics}


@dataclass
class _History:
    """A topic's effective attempts in day order and its latest evidence day."""

    attempts: list[Attempt] = field(default_factory=list)
    latest: str = ""


@dataclass
class Replay:
    """A topic's counted days replayed in order.

    ``verdicts`` holds one ``(day, grade)`` per counted day; ``days`` classifies
    every attempted day as learning, probe or practice; ``expected`` is the next
    expected review day after the last verdict, and ``due`` the date the engine
    stores for it: after the exam when that day is on or after an exam still
    ahead of the verdict. ``schedule`` keeps each ``(day, due)`` the replay set,
    so what was due on any past day can be read back.
    """

    verdicts: list[tuple[str, str]] = field(default_factory=list)
    days: dict[str, str] = field(default_factory=dict)
    expected: date | None = None
    due: date | None = None
    streak: int = 0
    schedule: list[tuple[date, date]] = field(default_factory=list)

    def expect(
        self, base: date, days: int, exam: Exam | None, *, solid: bool = False
    ) -> None:
        self.expected = review_day(base, days, exam)
        self.due = kept(base, self.expected, exam, solid=solid)
        self.schedule.append((base, self.due))


@dataclass
class Scheduled:
    """Reviews a save set or moved, and the notes that explain them."""

    reviews: dict[str, dict[str, str]] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


def corrected(observations: dict[str, Any]) -> set[str]:
    """Observations superseded by a later correction."""
    return {
        target for item in observations.values() for target in item.get("corrects", ())
    }


def effective(observations: dict[str, Any]) -> dict[str, Any]:
    """Observations that no other observation corrects."""
    superseded = corrected(observations)
    return {key: item for key, item in observations.items() if key not in superseded}


def positions(observations: dict[str, Any]) -> dict[str, int]:
    """Order within a day: a correction takes the place of what it replaced."""
    result: dict[str, int] = {}
    for key in sorted(observations, key=number):
        targets = observations[key].get("corrects", ())
        result[key] = min([number(key), *(result[target] for target in targets)])
    return result


def _histories(observations: dict[str, Any]) -> dict[str, _History]:
    histories: dict[str, _History] = defaultdict(_History)
    place = positions(observations)
    for key, item in effective(observations).items():
        for topic in item["topics"]:
            history = histories[topic]
            history.latest = max(history.latest, item["date"])
            if counts(item):
                history.attempts.append((key, item))
    for history in histories.values():
        history.attempts.sort(
            key=lambda pair: (pair[1]["date"], place[pair[0]], number(pair[0]))
        )
    return histories


def grade(observation: dict[str, Any]) -> str:
    """``solid`` (correct, unaided, certain, not a guess), ``helped`` or ``missed``."""
    result = observation["result"]
    if result == "incorrect":
        return "missed"
    if (
        result == "correct"
        and unaided(observation)
        and "uncertain" not in observation
        and observation.get("sure") != "guess"
    ):
        return "solid"
    return "helped"


def confident_error(observation: dict[str, Any]) -> bool:
    """An incorrect answer the learner was confident in."""
    return (
        observation["result"] == "incorrect" and observation.get("sure") == "confident"
    )


def _unaided_miss(observation: dict[str, Any]) -> bool:
    return unaided(observation) and observation["result"] == "incorrect"


def _probe(items: list[dict[str, Any]]) -> str:
    """The first try's grade, lowered only by a later unaided incorrect."""
    if any(_unaided_miss(item) for item in items[1:]):
        return "missed"
    return grade(items[0])


def _learned(items: list[dict[str, Any]]) -> str:
    """The learning day's best grade, at most ``helped``: success on the day a
    topic is learned is not yet evidence it is held, so ``solid`` takes a
    later day."""
    best = max((grade(item) for item in items), key=GRADES.index)
    return "helped" if best == "solid" else best


def late_days(answered: date, expected: date, exam: Exam | None) -> int:
    """Days a review was answered after its expected day, credited only with
    no exam ahead: before an exam the time left to it sets the gaps."""
    if exam is not None and answered < exam.day:
        return 0
    return max((answered - expected).days, 0)


def interval(verdict: str, streak: int, late: int = 0) -> int:
    """Days from a verdict to the next expected review; ``solid`` climbs the
    ladder, plus the days the review was answered late: recall after a longer
    gap is stronger evidence, so the next gap grows by as much."""
    if verdict == "solid":
        return LADDER[min(max(streak, 1), len(LADDER)) - 1] + max(late, 0)
    return INTERVALS[verdict]


def review_day(base: date, days: int, exam: Exam | None) -> date:
    """``base + days``, or the final review day when that comes first.

    From the final review day on, the ladder runs as without an exam; a review
    it puts on or after the exam is dropped by ``Replay.expect``.
    """
    natural = base + timedelta(days=days)
    if exam is None or base >= exam.final:
        return natural
    return min(natural, exam.final)


def kept(base: date, expected: date, exam: Exam | None, *, solid: bool = False) -> date:
    """The review the engine stores. With an exam still ahead of ``base``, a
    review on or after the exam, or after a ``solid`` answer from the final
    review on, goes to its spaced date after the exam, the day after it at the
    earliest; a miss or a helped answer still comes back before the exam."""
    if exam is None or base >= exam.day:
        return expected
    if (solid and base >= exam.final) or expected >= exam.day:
        return max(expected, exam.day + timedelta(days=1))
    return expected


def replay(
    key: str, topic: dict[str, Any], attempts: list[Attempt], exam: Exam | None
) -> Replay:
    """Classify each attempted day and replay the verdicts in day order.

    A learning day (the earlier of ``introduced`` and the first attempt, and the
    ``introduced`` day itself) takes its best grade, at most ``helped``, and the
    next day is its first retrieval. A later day on or after the expected review,
    a day the engine had the topic due when its answer was saved (``due_topics``,
    so moving the exam never uncounts a review), or any day with an ``exam``, is a
    probe: the first try counts, lowered only by a later unaided incorrect. Any other day is practice: only an unaided
    incorrect counts. With no exam ahead, a ``solid`` probe answered after its
    expected day adds the days it was late to the next interval.
    """
    result = Replay()
    days = [item["date"] for _, item in attempts]
    if "introduced" in topic:
        days.append(topic["introduced"])
    if not days:
        return result
    learning = {min(days), topic.get("introduced", min(days))}
    result.expect(date.fromisoformat(min(days)), FIRST_RETRIEVAL_DAYS, exam)
    for day, group in groupby(attempts, key=lambda pair: pair[1]["date"]):
        items = [item for _, item in group]
        verdict: str | None
        assert result.due is not None
        was_due = any(key in item.get("due_topics", ()) for item in items)
        if any(item["kind"] == "exam" for item in items) or (
            day not in learning and (day >= result.due.isoformat() or was_due)
        ):
            result.days[day], verdict = PROBE, _probe(items)
        elif day in learning:
            result.days[day], verdict = LEARNING, _learned(items)
        else:
            missed = any(_unaided_miss(item) for item in items)
            result.days[day], verdict = PRACTICE, "missed" if missed else None
        if verdict is None:
            continue
        result.verdicts.append((day, verdict))
        result.streak = result.streak + 1 if verdict == "solid" else 0
        late = late_days(date.fromisoformat(day), result.due, exam)
        days_on = (
            FIRST_RETRIEVAL_DAYS
            if result.days[day] == LEARNING
            else interval(verdict, result.streak, late)
        )
        result.expect(date.fromisoformat(day), days_on, exam, solid=verdict == "solid")
    return result


def _transferred(attempts: list[Attempt], replayed: Replay) -> bool:
    """A ``solid`` transfer on a day neither missed nor a learning day, after
    an earlier ``solid`` day: applying an idea in a new setting is evidence
    beyond holding it only once it is held, so one answer flagged as transfer
    never lifts a topic on its own."""
    solid = [day for day, verdict in replayed.verdicts if verdict == "solid"]
    missed = {day for day, verdict in replayed.verdicts if verdict == "missed"}
    return bool(solid) and any(
        item.get("transfer")
        and grade(item) == "solid"
        and item["date"] > solid[0]
        and item["date"] not in missed
        and replayed.days.get(item["date"]) != LEARNING
        for _, item in attempts
    )


def _level(topic: dict[str, Any], attempts: list[Attempt], replayed: Replay) -> str:
    if not attempts:
        return "introduced" if "introduced" in topic else "new"
    grades = [verdict for _, verdict in replayed.verdicts]
    if all(verdict == "missed" for verdict in grades):
        return "attempted"
    if "solid" not in grades:
        return "assisted"
    if _transferred(attempts, replayed):
        return "transferred"
    if grades.count("solid") >= RETAINED_VERDICTS:
        return "retained"
    return "independent"


def _lapsed(replayed: Replay) -> bool:
    grades = [verdict for _, verdict in replayed.verdicts]
    return bool(grades) and grades[-1] != "solid" and "solid" in grades[:-1]


def _relearn(replayed: Replay) -> bool:
    """Missed on the last two counted days: re-teach it and check what it needs
    rather than ask it again."""
    grades = [verdict for _, verdict in replayed.verdicts]
    return grades[-RELEARN_MISSES:] == ["missed"] * RELEARN_MISSES


def _since_solid(attempts: list[Attempt], replayed: Replay) -> list[dict[str, Any]]:
    """Attempts dated after the last ``solid`` verdict's day."""
    since = max(
        (day for day, verdict in replayed.verdicts if verdict == "solid"), default=""
    )
    return [item for _, item in attempts if item["date"] > since]


RIGHT = ("unaided", "helped", "guess", "uncertain", "partial")


def _answered(item: dict[str, Any]) -> str | None:
    if item["result"] == "partial":
        return "partial"
    if item["result"] != "correct":
        return None
    if not unaided(item):
        return "helped"
    if item.get("sure") == "guess":
        return "guess"
    return "uncertain" if "uncertain" in item else "unaided"


def _right(attempts: list[Attempt]) -> str | None:
    """How the learner has best answered a topic not yet solid, the first of
    ``RIGHT`` any attempt shows: right with no help (on the day it was
    learned), with help, as a guess, on doubtful evidence, or partly."""
    found = {_answered(item) for _, item in attempts}
    return next((kind for kind in RIGHT if kind in found), None)


def _standing(
    key: str, topic: dict[str, Any], history: _History, exam: Exam | None
) -> dict[str, Any]:
    attempts = history.attempts
    replayed = replay(key, topic, attempts, exam)
    result: dict[str, Any] = {
        "level": _level(topic, attempts, replayed),
        "attempts": len(attempts),
        "unaided_days": sum(verdict == "solid" for _, verdict in replayed.verdicts),
    }
    if result["level"] == "assisted":
        result["right"] = _right(attempts)
    if attempts:
        key, item = attempts[-1]
        last = {"id": key, "date": item["date"], "result": item["result"]}
        result["last"] = {**last, "unaided": unaided(item)}
    if _lapsed(replayed):
        result["lapsed"] = True
    if _relearn(replayed):
        result["relearn"] = True
    recent = _since_solid(attempts, replayed)
    errors = Counter(item["chose"] for item in recent if "chose" in item)
    if errors:
        result["choice_errors"] = dict(sorted(errors.items()))
    confident = sum(map(confident_error, recent))
    if confident:
        result["confident_errors"] = confident
    judged = topic.get("judged")
    if judged is not None and history.latest > judged:
        result["stale"] = True
    fixes = _repaired(topic, attempts, result)
    if fixes:
        result["repaired"] = True
        if not any(unaided(item) for item in fixes):
            result["repaired_with_help"] = True
    return result


_MISTAKES = ("lapsed", "choice_errors", "confident_errors")


def _repaired(
    topic: dict[str, Any], attempts: list[Attempt], standing: dict[str, Any]
) -> list[dict[str, Any]]:
    """A mistake answered right since: the correct answers after the newest
    incorrect one, else after the newest partial one, with the gap, if any,
    not diagnosed on a later day than the first of them; none when it is not
    repaired. A partial answer after the repair leaves it standing: its gap is
    what is left to check. It stays weak until a later day's unaided answer
    settles it. A repair whose answers all had help is ``repaired_with_help``:
    help may have carried it, so the mistake is not shown fixed on his own."""
    results = [item["result"] for _, item in attempts]
    wrong = next(
        (
            at
            for result in ("incorrect", "partial")
            for at in reversed(range(len(results)))
            if results[at] == result
        ),
        -1,
    )
    fixes = [item for _, item in attempts[wrong + 1 :] if item["result"] == "correct"]
    if not fixes:
        return []
    if "gap" in topic:
        return fixes if str(topic.get("judged", "")) <= str(fixes[0]["date"]) else []
    return fixes if any(flag in standing for flag in _MISTAKES) else []


def replays(record: dict[str, Any]) -> dict[str, Replay]:
    """Every topic's replayed verdicts and next expected review."""
    histories = _histories(record["observations"])
    exam_of = examining(record)
    return {
        key: replay(key, topic, histories.get(key, _History()).attempts, exam_of(key))
        for key, topic in record["topics"].items()
    }


def standings(record: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Every topic's standing, in one pass over the observations."""
    histories = _histories(record["observations"])
    exam_of = examining(record)
    return {
        key: _standing(key, topic, histories.get(key, _History()), exam_of(key))
        for key, topic in record["topics"].items()
    }


def standing(record: dict[str, Any], topic: str) -> dict[str, Any]:
    """One topic's standing."""
    return standings(record)[topic]


# --- scheduling ---------------------------------------------------------------


def _with_review(
    record: dict[str, Any], topic: str, due: date, by: str
) -> dict[str, str]:
    entry = record["topics"][topic]
    review = {**entry.get("review", {}), "due": due.isoformat(), "by": by}
    record["topics"][topic] = {**entry, "review": review}
    return {"due": review["due"], "by": by}


def _clamp_tutor_dates(
    record: dict[str, Any], changes: PatchResult, today: date, scheduled: Scheduled
) -> None:
    exam_of = examining(record)
    for key in changes.tutor_reviews:
        review = record["topics"].get(key, {}).get("review", {})
        if "due" not in review:
            continue
        due = date.fromisoformat(review["due"])
        exam = exam_of(key)
        if exam is not None and exam.day > today and due >= exam.day:
            moved = max(today, exam.day - timedelta(days=1))
            scheduled.notes.append(
                f"{key}: review moved from {due.isoformat()} to {moved.isoformat()}, "
                "before the exam"
            )
            due = moved
        scheduled.reviews[key] = _with_review(record, key, due, "tutor")


def _engine_due(topic: dict[str, Any], day: str) -> bool:
    review = topic.get("review", {})
    return bool(review.get("by") == "engine" and review.get("due", day) <= day)


def _stamp_due(record: dict[str, Any], changes: PatchResult) -> None:
    """Record on each new answer which of its topics the engine had due when it
    was saved; a tutor's pin keeps its own rule (``replay``).

    A correction keeps what it corrects had, since it takes that answer's day,
    and stays the item of the arc check its target was (``checkpoint``).
    """
    observations = record["observations"] = dict(record["observations"])
    for key in changes.observations:
        item = observations[key]
        if not counts(item):
            continue
        inherited = {
            topic
            for target in item.get("corrects", ())
            for topic in observations.get(target, {}).get("due_topics", ())
        }
        due = {
            topic
            for topic in item["topics"]
            if _engine_due(record["topics"][topic], item["date"])
        }
        stamped = [topic for topic in item["topics"] if topic in due | inherited]
        if stamped:
            item = observations[key] = {**item, "due_topics": stamped}
        checkpoint = next(
            (
                observations[target]["checkpoint"]
                for target in item.get("corrects", ())
                if "checkpoint" in observations.get(target, {})
            ),
            None,
        )
        if checkpoint is not None and "checkpoint" not in item:
            observations[key] = {**item, "checkpoint": checkpoint}


def _after_exam(key: str, replayed: Replay, exam: Exam | None) -> str | None:
    """A note when a verdict before the exam sent the next review past it."""
    if exam is None or not replayed.verdicts or replayed.due is None:
        return None
    if replayed.verdicts[-1][0] >= exam.day.isoformat() or replayed.due <= exam.day:
        return None
    return f"{key}: next review {replayed.due.isoformat()}, after the exam"


def _resync(
    record: dict[str, Any],
    histories: dict[str, _History],
    today: date,
    scheduled: Scheduled,
) -> None:
    """Re-derive every engine date after the exam or its final review moved.

    Each engine date becomes the replayed one, so moving the exam and moving
    it back restores the dates. A tutor date on or after an exam still ahead is
    handed to the engine.
    """
    exam_of = examining(record)
    for key, topic in list(record["topics"].items()):
        exam = exam_of(key)
        review = topic.get("review", {})
        stored = review.get("due")
        if review.get("by") == "tutor" and not (
            exam is not None and exam.day > today and stored >= exam.day.isoformat()
        ):
            continue
        target = replay(key, topic, histories.get(key, _History()).attempts, exam).due
        if target is not None and target.isoformat() != stored:
            scheduled.reviews[key] = _with_review(record, key, target, "engine")
            scheduled.notes.append(
                f"{key}: review moved to {target.isoformat()}, after the exam moved"
            )


def _attempt_ids(history: _History) -> list[str]:
    return [key for key, _ in history.attempts]


def _clear_due(record: dict[str, Any], topic: str) -> None:
    entry = record["topics"][topic]
    review = {
        name: value
        for name, value in entry.get("review", {}).items()
        if name not in ("due", "by")
    }
    record["topics"][topic] = (
        {**entry, "review": review}
        if review
        else {name: value for name, value in entry.items() if name != "review"}
    )


def _practice_moved(
    topic: dict[str, Any],
    days: set[str],
    replayed: Replay,
) -> bool:
    """A practice day without a verdict on or after the stored due date."""
    due = topic.get("review", {}).get("due")
    return due is not None and any(
        replayed.days.get(day) == PRACTICE and due <= day for day in days
    )


def _restamped(
    record: dict[str, Any],
    key: str,
    history: _History,
    exam: Exam | None,
    changes: PatchResult,
    scheduled: Scheduled,
) -> None:
    """A topic marked introduced after its answers: the learning day moved, so
    an engine date follows the replay."""
    topic = record["topics"][key]
    review = topic.get("review", {})
    if key not in changes.introduced or not history.attempts:
        return
    if review.get("by") != "engine":
        return
    due = replay(key, topic, history.attempts, exam).due
    if due is not None and due.isoformat() != review.get("due"):
        scheduled.reviews[key] = _with_review(record, key, due, "engine")
        scheduled.notes.append(
            f"{key}: review moved to {due.isoformat()}, its learning day moved"
        )


def _reschedule(
    record: dict[str, Any],
    changes: PatchResult,
    histories: dict[str, _History],
    scheduled: Scheduled,
) -> None:
    """Set the next expected review where this save created or changed a verdict.

    A topic is replayed when this save changed the attempts that count for it:
    a new attempt, or one a correction superseded. A practice day that leaves
    the verdicts unchanged moves a review due on or before it to the expected
    day, so a topic cannot stay due forever. A correction that leaves a topic
    no attempts clears the date the engine had set for it.
    """
    new = set(changes.observations)
    observations = record["observations"]
    before = _histories(
        {key: item for key, item in observations.items() if key not in new}
    )
    named = {topic for key in new for topic in observations[key]["topics"]}
    exam_of = examining(record)
    for key, topic in list(record["topics"].items()):
        exam = exam_of(key)
        now, then = histories.get(key, _History()), before.get(key, _History())
        if key in changes.tutor_reviews:
            continue
        if _attempt_ids(now) == _attempt_ids(then):
            _restamped(record, key, now, exam, changes, scheduled)
            continue
        after = replay(key, topic, now.attempts, exam)
        previous = replay(key, topic, then.attempts, exam)
        days = {item["date"] for name, item in now.attempts if name in new}
        changed = after.verdicts != previous.verdicts
        if after.due is None:
            if topic.get("review", {}).get("by") == "engine":
                _clear_due(record, key)
                scheduled.notes.append(
                    f"{key}: review date cleared, a correction left it no attempts"
                )
        elif changed or _practice_moved(topic, days, after):
            scheduled.reviews[key] = _with_review(record, key, after.due, "engine")
            note = _after_exam(key, after, exam)
            if key not in named:
                scheduled.notes.append(
                    f"{key}: review moved to {after.due.isoformat()} after a correction"
                )
            elif note is not None:
                scheduled.notes.append(note)


def _first_retrievals(
    record: dict[str, Any],
    changes: PatchResult,
    histories: dict[str, _History],
    scheduled: Scheduled,
) -> None:
    exam_of = examining(record)
    for key in changes.introduced:
        topic = record["topics"].get(key)
        if (
            topic is None
            or histories.get(key, _History()).attempts
            or "due" in topic.get("review", {})
        ):
            continue
        due = replay(key, topic, [], exam_of(key)).due
        assert due is not None
        scheduled.reviews[key] = _with_review(record, key, due, "engine")
        scheduled.notes.append(
            f"{key}: first retrieval scheduled for {due.isoformat()}, after it was "
            "introduced"
        )


def _stale_notes(
    record: dict[str, Any],
    changes: PatchResult,
    histories: dict[str, _History],
    scheduled: Scheduled,
) -> None:
    added: dict[str, list[str]] = defaultdict(list)
    for key in changes.observations:
        for topic in record["observations"][key]["topics"]:
            added[topic].append(key)
    for topic, keys in added.items():
        entry = record["topics"][topic]
        judged_on = entry.get("judged")
        if judged_on is None or judged_on >= histories[topic].latest:
            continue
        judged = [name for name in ("gap", "note") if name in entry]
        if judged:
            which = " and ".join(judged)
            verb, pronoun = ("were", "them") if len(judged) > 1 else ("was", "it")
            scheduled.notes.append(
                f"{topic}: {which} {verb} judged before {', '.join(keys)}; revise or "
                f"clear {pronoun} if the diagnosis changed"
            )


def schedule(
    record: dict[str, Any], changes: PatchResult, today: date
) -> tuple[dict[str, Any], Scheduled]:
    """Apply a save's engine consequences; returns the new record and what moved.

    The record is read with the plan (``capacity.final_reviews``), so its
    final review is the one every view shows. A save that moves the exam or
    its final review re-derives every engine date.
    Tutor-set dates on or after the exam move to the day before it. A topic whose
    verdicts this save created or changed is due on its next expected review day,
    unless the same patch dated its review; a practice day leaves the date alone
    unless the review was already due by then. Newly introduced topics without
    attempts or a date get a first retrieval. Gap or note judged on an earlier
    day than the new evidence gets a note. A self-report adds no verdict, but
    any observation that supersedes an attempt replays that attempt's topics.
    """
    result = {**record, "topics": dict(record["topics"])}
    _stamp_due(result, changes)
    scheduled = Scheduled()
    histories = _histories(result["observations"])
    if changes.exam_moved:
        _resync(result, histories, today, scheduled)
    _clamp_tutor_dates(result, changes, today, scheduled)
    _reschedule(result, changes, histories, scheduled)
    _first_retrievals(result, changes, histories, scheduled)
    _stale_notes(result, changes, histories, scheduled)
    return result, scheduled


# --- lists ------------------------------------------------------------------


def excluded(record: dict[str, Any]) -> set[str]:
    """Topics the course leaves out (``excluded``): off the plan, history kept."""
    return {key for key, topic in record["topics"].items() if "excluded" in topic}


def needs(record: dict[str, Any], key: str) -> list[str]:
    """A topic's prerequisites that the course still studies."""
    topics = record["topics"]
    return [
        need
        for need in topics[key].get("needs", ())
        if need in topics and "excluded" not in topics[need]
    ]


def _placed(
    topics: Collection[str], links: dict[str, list[str]], stored: list[str]
) -> dict[str, float]:
    """Each topic's place in the order: its index in ``stored``; a topic outside
    it goes just before the first stored topic that builds on it, else just
    after its last placed prerequisite, else at the end."""
    place: dict[str, float] = {
        key: float(index) for index, key in enumerate(stored) if key in topics
    }
    dependents: dict[str, list[str]] = defaultdict(list)
    for key in topics:
        for need in links[key]:
            dependents[need].append(key)

    def first_dependent(key: str) -> float | None:
        seen, stack, found = {key}, list(dependents[key]), []
        while stack:
            other = stack.pop()
            if other in seen:
                continue
            seen.add(other)
            if other in place:
                found.append(place[other])
            stack.extend(dependents[other])
        return min(found, default=None)

    end = float(len(stored))
    unplaced = [key for key in topics if key not in place]
    for key in unplaced:
        if (anchor := first_dependent(key)) is not None:
            place[key] = anchor - 0.5
    pending = [key for key in unplaced if key not in place]
    while pending:
        progressed = False
        for key in list(pending):
            if any(need in pending for need in links[key]):
                continue
            after = [place[need] for need in links[key]]
            place[key] = max(after) + 0.5 if after else end
            pending.remove(key)
            progressed = True
        if not progressed:
            for key in pending:
                place[key] = end
            break
    return place


def path_order(record: dict[str, Any], *, everything: bool = False) -> list[str]:
    """Topics in prerequisite order, arc by arc, ties broken by their place
    then handle.

    In a course with arcs, every topic of one arc comes before the next arc's:
    no topic needs a later arc (``arc_rules``, H2), so while an earlier arc
    has a topic left, one of them is always ready. The place is the topic's
    index in ``path.order``, and a topic outside it is placed where its
    prerequisites put it (``_placed``), so a topic added later never drops to
    the end. Excluded topics are left out unless ``everything``.
    """
    topics = {
        key
        for key, topic in record["topics"].items()
        if everything or "excluded" not in topic
    }
    links = {
        key: [need for need in record["topics"][key].get("needs", ()) if need in topics]
        for key in topics
    }
    stored = _placed(topics, links, record.get("path", {}).get("order", []))
    chapter = {arc: index for index, arc in enumerate(arc_rules.order(record))}
    place = {
        key: (chapter.get(record["topics"][key].get("arc"), 0), stored[key])
        for key in topics
    }
    waiting: dict[str, int] = {}
    dependents: dict[str, list[str]] = defaultdict(list)
    for key in topics:
        waiting[key] = len(links[key])
        for need in links[key]:
            dependents[need].append(key)
    ready = [(place[key], key) for key, count in waiting.items() if count == 0]
    heapq.heapify(ready)
    order: list[str] = []
    while ready:
        key = heapq.heappop(ready)[1]
        order.append(key)
        for dependent in dependents[key]:
            waiting[dependent] -= 1
            if waiting[dependent] == 0:
                heapq.heappush(ready, (place[dependent], dependent))
    return order


def path_health(record: dict[str, Any]) -> dict[str, list[str]]:
    """What a half-built path leaves undone, per studied topic: no title, no
    place in ``path.order``, no link to any other topic (with two or more
    topics), no reference to where it is taught; and each arc whose stored
    title a save would now refuse (``arc_names``). Empty when nothing is."""
    topics = record["topics"]
    order = path_order(record)
    stored = set(record.get("path", {}).get("order", []))
    partners = contrasts(record)
    linked: set[str] = set()
    for key in order:
        prerequisites = needs(record, key)
        if prerequisites or partners[key]:
            linked.update((key, *prerequisites, *partners[key]))
    health = {
        "untitled": [key for key in order if "title" not in topics[key]],
        "unplaced": [key for key in order if key not in stored],
        "unlinked": [key for key in order if key not in linked]
        if len(order) > 1
        else [],
        "unreferenced": [key for key in order if not topics[key].get("refs")],
        "arc_names": arc_rules.misnamed(record),
    }
    return {name: keys for name, keys in health.items() if keys}


def _ranked(record: dict[str, Any], order: list[str] | None) -> dict[str, int]:
    return {key: index for index, key in enumerate(order or path_order(record))}


def contrasts(
    record: dict[str, Any], *, everything: bool = False
) -> dict[str, list[str]]:
    """Competing methods, symmetric: a topic's own list, then topics that list it.

    An excluded partner is left out unless ``everything``."""
    topics = record["topics"]
    left_out = set() if everything else excluded(record)
    partners: dict[str, list[str]] = {
        key: [other for other in topic.get("contrasts", ()) if other not in left_out]
        for key, topic in topics.items()
    }
    for key, topic in topics.items():
        if key in left_out:
            continue
        for other in topic.get("contrasts", ()):
            if other not in left_out and key not in partners[other]:
                partners[other].append(key)
    return partners


def _due_items(
    record: dict[str, Any], today: date, current: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    items = []
    for key, topic in record["topics"].items():
        if "excluded" in topic:
            continue
        review = topic.get("review", {})
        when = review.get("due")
        if when is None or when > today.isoformat():
            continue
        item: dict[str, Any] = {"topic": key}
        if "title" in topic:
            item["title"] = topic["title"]
        item["due"] = when
        item["overdue"] = (today - date.fromisoformat(when)).days
        item["level"] = current[key]["level"]
        if current[key].get("relearn"):
            item["relearn"] = True
        for name in ("prompt", "points"):
            if name in review:
                item[name] = review[name]
        if "gap" in topic:
            item["gap"] = topic["gap"]
        items.append(item)
    return items


def unready(
    record: dict[str, Any],
    today: date,
    replayed_: dict[str, Replay] | None = None,
) -> set[str]:
    """Within the exam run-up, taught topics it examines without a ``solid``
    verdict in 14 days.

    ``replayed_`` is the record's ``replays`` when the caller already has them."""
    exam = exam_plan(record)
    if exam is None or not 0 <= (exam.day - today).days <= RUNUP_DAYS:
        return set()
    examined = arc_rules.examined(record)
    recent = (today - timedelta(days=RECENT_SOLID_DAYS)).isoformat()
    return {
        key
        for key, replayed in (replayed_ or replays(record)).items()
        if "excluded" not in record["topics"][key]
        if examined is None or key in examined
        if replayed.days or "introduced" in record["topics"][key]
        if not any(
            verdict == "solid" and day > recent for day, verdict in replayed.verdicts
        )
    }


def _interleaved(
    record: dict[str, Any], chosen: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Prerequisites first; each topic followed by its first ready competing method."""
    partners = contrasts(record)
    pending = {item["topic"]: item for item in chosen}
    placed: list[dict[str, Any]] = []

    def ready(key: str) -> bool:
        return all(need not in pending for need in needs(record, key))

    def place(key: str) -> None:
        placed.append(pending.pop(key))

    while pending:
        key = next(key for key in pending if ready(key))
        place(key)
        partner = next(
            (other for other in partners[key] if other in pending and ready(other)),
            None,
        )
        if partner is not None:
            place(partner)
    return placed


def late_share(item: dict[str, Any], standing: dict[str, Any]) -> float:
    """Days overdue as a share of the interval that set the date: two days late
    on a one-day interval matters more than ten on a 160-day one. Each step of
    the ladder is set for the same recall, and forgetting runs in proportion to
    the interval, so an equal share is an equal loss of recall."""
    last = standing.get("last", {}).get("date")
    gap = (
        (date.fromisoformat(item["due"]) - date.fromisoformat(last)).days if last else 0
    )
    return float(item["overdue"]) / max(gap, FIRST_RETRIEVAL_DAYS)


def due(
    record: dict[str, Any],
    today: date,
    *,
    levels: dict[str, dict[str, Any]] | None = None,
    order: list[str] | None = None,
    limit: int = DUE_LIMIT,
    replayed: dict[str, Replay] | None = None,
) -> list[dict[str, Any]]:
    """Reviews due on or before ``today``: today's review first, then the rest.

    Priority: topics to re-teach (``relearn``), then lapsed ones, then (within
    21 days of the exam) topics without a recent ``solid`` verdict, then the
    largest share of their own interval overdue, then path order. The first
    ``limit`` by priority are today's review, ordered so prerequisites come first
    and competing methods sit together; the rest follow by priority.
    """
    current = levels or standings(record)
    rank = _ranked(record, order)
    behind = unready(record, today, replayed)
    items = _due_items(record, today, current)
    items.sort(
        key=lambda item: (
            not current[item["topic"]].get("relearn"),
            not current[item["topic"]].get("lapsed"),
            item["topic"] not in behind,
            -late_share(item, current[item["topic"]]),
            rank[item["topic"]],
        )
    )
    return _interleaved(record, items[:limit]) + items[limit:]


def upcoming(
    record: dict[str, Any], today: date, days: int, *, order: list[str] | None = None
) -> list[dict[str, Any]]:
    """Reviews due after ``today`` and within ``days`` days."""
    rank = _ranked(record, order)
    start, end = today.isoformat(), (today + timedelta(days=days)).isoformat()
    items = [
        {"topic": key, "due": topic["review"]["due"]}
        for key, topic in record["topics"].items()
        if "excluded" not in topic
        if start < topic.get("review", {}).get("due", "") <= end
    ]
    items.sort(key=lambda item: (item["due"], rank[item["topic"]]))
    return items


# --- the week -------------------------------------------------------------------


def as_of(record: dict[str, Any], day: date) -> dict[str, Any]:
    """The record as it stood before ``day``: earlier observations and teaching."""
    cutoff = day.isoformat()
    topics = {
        key: {name: value for name, value in topic.items() if name != "introduced"}
        if topic.get("introduced", "") >= cutoff
        else topic
        for key, topic in record["topics"].items()
    }
    observations = {
        key: item
        for key, item in record["observations"].items()
        if item["date"] < cutoff
    }
    return {**record, "topics": topics, "observations": observations}


def week(record: dict[str, Any], today: date) -> dict[str, Any]:
    """The last seven days: level changes, first tries, attempts, errors."""
    start = today - timedelta(days=WEEK_DAYS - 1)
    first = start.isoformat()
    before = standings(as_of(record, start))
    after = standings(record)
    levels = {
        key: {"from": before[key]["level"], "to": standing["level"]}
        for key, standing in after.items()
        if before[key]["level"] != standing["level"]
    }
    probes = [
        verdict
        for replayed in replays(record).values()
        for day, verdict in replayed.verdicts
        if day >= first and replayed.days[day] == PROBE
    ]
    attempts = {"unaided": 0, "assisted": 0}
    errors: list[dict[str, str]] = []
    confident = 0
    for item in effective(record["observations"]).values():
        if item["date"] < first or not counts(item):
            continue
        attempts["unaided" if unaided(item) else "assisted"] += 1
        confident += confident_error(item)
        if "chose" in item:
            errors.extend(
                {"topic": topic, "chose": item["chose"]} for topic in item["topics"]
            )
    result: dict[str, Any] = {}
    if levels:
        result["levels"] = levels
    if probes:
        result["probes"] = {"total": len(probes), "solid": probes.count("solid")}
    if any(attempts.values()):
        result["attempts"] = attempts
    if errors:
        result["choice_errors"] = errors
    if confident:
        result["confident_errors"] = confident
    return result
