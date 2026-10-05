"""Derived progress: verdicts, standings, the review ladder, due lists, path order.

Pure functions over a validated course record (``schema.validate_record``).
Each counted day of a topic gets one verdict (``solid``, ``helped`` or
``missed``); levels, lapses and the next expected review are replayed from the
verdicts. Nothing here is stored except the reviews ``schedule`` sets.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
import heapq
from itertools import groupby
from typing import Any

from learning.schema import PatchResult, number, unaided

LADDER = (3, 7, 16, 35, 75, 160)
INTERVALS = {"missed": 1, "helped": 2}
FIRST_RETRIEVAL_DAYS = 1
RETAINED_VERDICTS = 2
EXAM_SHARE = 3
SCHEDULING_KINDS = frozenset({"attempt", "exam"})
DUE_LIMIT = 5
RUNUP_DAYS = 21
RECENT_SOLID_DAYS = 14
WEEK_DAYS = 7
# Grades from worst to best.
GRADES = ("missed", "helped", "solid")
LEARNING, PROBE, PRACTICE = "learning", "probe", "practice"

Attempt = tuple[str, dict[str, Any]]


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
    expected review day after the last verdict.
    """

    verdicts: list[tuple[str, str]] = field(default_factory=list)
    days: dict[str, str] = field(default_factory=dict)
    expected: date | None = None
    streak: int = 0


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
            if item["kind"] in SCHEDULING_KINDS:
                history.attempts.append((key, item))
    for history in histories.values():
        history.attempts.sort(
            key=lambda pair: (pair[1]["date"], place[pair[0]], number(pair[0]))
        )
    return histories


def grade(observation: dict[str, Any]) -> str:
    """``solid`` (correct, unaided, certain), ``helped`` or ``missed``."""
    result = observation["result"]
    if result == "incorrect":
        return "missed"
    if result == "correct" and unaided(observation) and "uncertain" not in observation:
        return "solid"
    return "helped"


def _unaided_miss(observation: dict[str, Any]) -> bool:
    return unaided(observation) and observation["result"] == "incorrect"


def _probe(items: list[dict[str, Any]]) -> str:
    """The first try's grade, lowered only by a later unaided incorrect."""
    if any(_unaided_miss(item) for item in items[1:]):
        return "missed"
    return grade(items[0])


def _best(items: list[dict[str, Any]]) -> str:
    return max((grade(item) for item in items), key=GRADES.index)


def interval(verdict: str, streak: int) -> int:
    """Days from a verdict to the next expected review; ``solid`` climbs the ladder."""
    if verdict == "solid":
        return LADDER[min(max(streak, 1), len(LADDER)) - 1]
    return INTERVALS[verdict]


def review_day(base: date, days: int, exam: date | None) -> date:
    """``base + days``, pulled in before a later exam; always after ``base``.

    With the exam the next day the review lands on the exam day itself.
    """
    if exam is None or exam <= base:
        return base + timedelta(days=days)
    days = min(days, max(1, (exam - base).days // EXAM_SHARE))
    pulled = min(base + timedelta(days=days), exam - timedelta(days=1))
    return max(base + timedelta(days=1), pulled)


def replay(topic: dict[str, Any], attempts: list[Attempt], exam: date | None) -> Replay:
    """Classify each attempted day and replay the verdicts in day order.

    The learning day (the earlier of ``introduced`` and the first attempt) takes
    its best grade. A later day on or after the expected review, or any day with
    an ``exam``, is a probe: the first try counts, lowered only by a later unaided
    incorrect. Any other day is practice: only an unaided incorrect counts.
    """
    result = Replay()
    days = [item["date"] for _, item in attempts]
    if "introduced" in topic:
        days.append(topic["introduced"])
    if not days:
        return result
    learning = min(days)
    result.expected = review_day(
        date.fromisoformat(learning), FIRST_RETRIEVAL_DAYS, exam
    )
    for day, group in groupby(attempts, key=lambda pair: pair[1]["date"]):
        items = [item for _, item in group]
        verdict: str | None
        if any(item["kind"] == "exam" for item in items) or (
            day != learning and day >= result.expected.isoformat()
        ):
            result.days[day], verdict = PROBE, _probe(items)
        elif day == learning:
            result.days[day], verdict = LEARNING, _best(items)
        else:
            missed = any(_unaided_miss(item) for item in items)
            result.days[day], verdict = PRACTICE, "missed" if missed else None
        if verdict is None:
            continue
        result.verdicts.append((day, verdict))
        result.streak = result.streak + 1 if verdict == "solid" else 0
        result.expected = review_day(
            date.fromisoformat(day), interval(verdict, result.streak), exam
        )
    return result


def _transferred(attempts: list[Attempt], replayed: Replay) -> bool:
    missed = {day for day, verdict in replayed.verdicts if verdict == "missed"}
    return any(
        item.get("transfer") and grade(item) == "solid" and item["date"] not in missed
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


def _choice_errors(attempts: list[Attempt], replayed: Replay) -> dict[str, int]:
    """Wrongly chosen methods since the last ``solid`` verdict, with their counts."""
    since = max(
        (day for day, verdict in replayed.verdicts if verdict == "solid"), default=""
    )
    errors = Counter(
        item["chose"]
        for _, item in attempts
        if "chose" in item and item["date"] > since
    )
    return dict(sorted(errors.items()))


def _standing(
    topic: dict[str, Any], history: _History, exam: date | None
) -> dict[str, Any]:
    attempts = history.attempts
    replayed = replay(topic, attempts, exam)
    result: dict[str, Any] = {
        "level": _level(topic, attempts, replayed),
        "attempts": len(attempts),
        "unaided_days": sum(verdict == "solid" for _, verdict in replayed.verdicts),
    }
    if attempts:
        key, item = attempts[-1]
        last = {"id": key, "date": item["date"], "result": item["result"]}
        result["last"] = {**last, "unaided": unaided(item)}
    if _lapsed(replayed):
        result["lapsed"] = True
    errors = _choice_errors(attempts, replayed)
    if errors:
        result["choice_errors"] = errors
    judged = topic.get("judged")
    if judged is not None and history.latest > judged:
        result["stale"] = True
    return result


def replays(record: dict[str, Any]) -> dict[str, Replay]:
    """Every topic's replayed verdicts and next expected review."""
    histories = _histories(record["observations"])
    exam = _exam(record)
    return {
        key: replay(topic, histories.get(key, _History()).attempts, exam)
        for key, topic in record["topics"].items()
    }


def standings(record: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Every topic's standing, in one pass over the observations."""
    histories = _histories(record["observations"])
    exam = _exam(record)
    return {
        key: _standing(topic, histories.get(key, _History()), exam)
        for key, topic in record["topics"].items()
    }


def standing(record: dict[str, Any], topic: str) -> dict[str, Any]:
    """One topic's standing."""
    return standings(record)[topic]


# --- scheduling ---------------------------------------------------------------


def _exam(record: dict[str, Any]) -> date | None:
    value = record.get("exam", {}).get("date")
    return date.fromisoformat(value) if value else None


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
    exam = _exam(record)
    for key in changes.tutor_reviews:
        review = record["topics"].get(key, {}).get("review", {})
        if "due" not in review:
            continue
        due = date.fromisoformat(review["due"])
        if exam is not None and exam > today and due >= exam:
            moved = max(today, exam - timedelta(days=1))
            scheduled.notes.append(
                f"{key}: review moved from {due.isoformat()} to {moved.isoformat()}, "
                "before the exam"
            )
            due = moved
        scheduled.reviews[key] = _with_review(record, key, due, "tutor")


def _touched(record: dict[str, Any], changes: PatchResult) -> list[str]:
    """Topics of the attempts and exams this save added."""
    topics: dict[str, None] = {}
    for key in changes.observations:
        item = record["observations"][key]
        if item["kind"] in SCHEDULING_KINDS:
            topics.update(dict.fromkeys(item["topics"]))
    return list(topics)


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


def _reschedule(
    record: dict[str, Any],
    changes: PatchResult,
    histories: dict[str, _History],
    scheduled: Scheduled,
) -> None:
    """Set the next expected review where this save created or changed a verdict.

    A practice day that leaves the verdicts unchanged moves a review due on or
    before it to the expected day, so a topic cannot stay due forever.
    """
    new = set(changes.observations)
    before = _histories(
        {key: item for key, item in record["observations"].items() if key not in new}
    )
    exam = _exam(record)
    for key in _touched(record, changes):
        if key in changes.tutor_reviews:
            continue
        topic = record["topics"][key]
        after = replay(topic, histories[key].attempts, exam)
        previous = replay(topic, before.get(key, _History()).attempts, exam)
        days = {item["date"] for name, item in histories[key].attempts if name in new}
        changed = after.verdicts != previous.verdicts
        if after.expected is not None and (
            changed or _practice_moved(topic, days, after)
        ):
            scheduled.reviews[key] = _with_review(record, key, after.expected, "engine")


def _first_retrievals(
    record: dict[str, Any],
    changes: PatchResult,
    histories: dict[str, _History],
    scheduled: Scheduled,
) -> None:
    exam = _exam(record)
    for key in changes.introduced:
        topic = record["topics"].get(key)
        if (
            topic is None
            or histories.get(key, _History()).attempts
            or "due" in topic.get("review", {})
        ):
            continue
        base = date.fromisoformat(topic["introduced"])
        due = review_day(base, FIRST_RETRIEVAL_DAYS, exam)
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

    Tutor-set dates on or after the exam move to the day before it. A topic whose
    verdicts this save created or changed is due on its next expected review day,
    unless the same patch dated its review; a practice day leaves the date alone
    unless the review was already due by then. Newly introduced topics without
    attempts or a date get a first retrieval. Gap or note judged on an earlier
    day than the new evidence gets a note. Self-reports never reschedule.
    """
    result = {**record, "topics": dict(record["topics"])}
    scheduled = Scheduled()
    histories = _histories(result["observations"])
    _clamp_tutor_dates(result, changes, today, scheduled)
    _reschedule(result, changes, histories, scheduled)
    _first_retrievals(result, changes, histories, scheduled)
    _stale_notes(result, changes, histories, scheduled)
    return result, scheduled


# --- lists ------------------------------------------------------------------


def path_order(record: dict[str, Any]) -> list[str]:
    """Topics in prerequisite order, ties broken by ``path.order`` then handle."""
    topics = record["topics"]
    position = {
        key: index for index, key in enumerate(record.get("path", {}).get("order", []))
    }

    def rank(key: str) -> tuple[int, int, str]:
        return (0, position[key], key) if key in position else (1, 0, key)

    waiting: dict[str, int] = {}
    dependents: dict[str, list[str]] = defaultdict(list)
    for key, topic in topics.items():
        needs = [need for need in topic.get("needs", ()) if need in topics]
        waiting[key] = len(needs)
        for need in needs:
            dependents[need].append(key)
    ready = [rank(key) for key, count in waiting.items() if count == 0]
    heapq.heapify(ready)
    order: list[str] = []
    while ready:
        key = heapq.heappop(ready)[2]
        order.append(key)
        for dependent in dependents[key]:
            waiting[dependent] -= 1
            if waiting[dependent] == 0:
                heapq.heappush(ready, rank(dependent))
    return order


def _ranked(record: dict[str, Any], order: list[str] | None) -> dict[str, int]:
    return {key: index for index, key in enumerate(order or path_order(record))}


def contrasts(record: dict[str, Any]) -> dict[str, list[str]]:
    """Competing methods, symmetric: a topic's own list, then topics that list it."""
    topics = record["topics"]
    partners = {key: list(topic.get("contrasts", ())) for key, topic in topics.items()}
    for key, topic in topics.items():
        for other in topic.get("contrasts", ()):
            if key not in partners[other]:
                partners[other].append(key)
    return partners


def _due_items(
    record: dict[str, Any], today: date, current: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    items = []
    for key, topic in record["topics"].items():
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
        for name in ("prompt", "points"):
            if name in review:
                item[name] = review[name]
        if "gap" in topic:
            item["gap"] = topic["gap"]
        items.append(item)
    return items


def unready(record: dict[str, Any], today: date) -> set[str]:
    """Within the exam run-up, topics without a ``solid`` verdict in 14 days."""
    exam = _exam(record)
    if exam is None or not 0 <= (exam - today).days <= RUNUP_DAYS:
        return set()
    recent = (today - timedelta(days=RECENT_SOLID_DAYS)).isoformat()
    return {
        key
        for key, replayed in replays(record).items()
        if not any(
            verdict == "solid" and day > recent for day, verdict in replayed.verdicts
        )
    }


def _interleaved(
    record: dict[str, Any], chosen: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Prerequisites first; each topic followed by its first ready competing method."""
    topics = record["topics"]
    partners = contrasts(record)
    pending = {item["topic"]: item for item in chosen}
    placed: list[dict[str, Any]] = []

    def ready(key: str) -> bool:
        return all(need not in pending for need in topics[key].get("needs", ()))

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


def due(
    record: dict[str, Any],
    today: date,
    *,
    levels: dict[str, dict[str, Any]] | None = None,
    order: list[str] | None = None,
    limit: int = DUE_LIMIT,
) -> list[dict[str, Any]]:
    """Reviews due on or before ``today``: today's review first, then the rest.

    Priority: lapsed topics, then (within 21 days of the exam) topics without a
    recent ``solid`` verdict, then the most overdue, then path order. The first
    ``limit`` by priority are today's review, ordered so prerequisites come first
    and competing methods sit together; the rest follow by priority.
    """
    current = levels or standings(record)
    rank = _ranked(record, order)
    behind = unready(record, today)
    items = _due_items(record, today, current)
    items.sort(
        key=lambda item: (
            not current[item["topic"]].get("lapsed"),
            item["topic"] not in behind,
            -item["overdue"],
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
    """The last seven days: level changes, first tries, attempts, wrong methods."""
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
    for item in effective(record["observations"]).values():
        if item["date"] < first or item["kind"] not in SCHEDULING_KINDS:
            continue
        attempts["unaided" if unaided(item) else "assisted"] += 1
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
    return result
