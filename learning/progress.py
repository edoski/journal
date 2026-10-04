"""Derived progress: standings, the review ladder, due lists and the path order.

Pure functions over a validated course record (``schema.validate_record``).
Standings are computed on read and never stored; ``schedule`` is the only
function that changes a record, and only its reviews.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
import heapq
from typing import Any

from learning.schema import PatchResult, number, unaided

LADDER = (3, 7, 16, 35, 75, 160)
INCORRECT_DAYS = 1
HELPED_DAYS = 2
FIRST_RETRIEVAL_DAYS = 1
RETAINED_DAYS = 2
RETAINED_SPAN = 2
EXAM_SHARE = 3
SCHEDULING_KINDS = frozenset({"attempt", "exam"})


@dataclass
class _History:
    """A topic's effective attempts in (date, id) order and its latest evidence day."""

    attempts: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    latest: str = ""


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


def _histories(record: dict[str, Any]) -> dict[str, _History]:
    histories: dict[str, _History] = defaultdict(_History)
    for key, item in effective(record["observations"]).items():
        for topic in item["topics"]:
            history = histories[topic]
            history.latest = max(history.latest, item["date"])
            if item["kind"] in SCHEDULING_KINDS:
                history.attempts.append((key, item))
    for history in histories.values():
        history.attempts.sort(key=lambda pair: (pair[1]["date"], number(pair[0])))
    return histories


def _unaided_days(attempts: list[tuple[str, dict[str, Any]]]) -> list[str]:
    return sorted(
        {
            item["date"]
            for _, item in attempts
            if item.get("result") == "correct" and unaided(item)
        }
    )


def streak_days(attempts: list[tuple[str, dict[str, Any]]]) -> int:
    """Distinct days of unaided correct attempts since the last unaided miss.

    ``attempts`` are a topic's effective attempts in (date, id) order. The review
    ladder climbs on this current streak, so a lapse restarts it.
    """
    days: set[str] = set()
    for _, item in attempts:
        if not unaided(item):
            continue
        if item.get("result") == "correct":
            days.add(item["date"])
        else:
            days.clear()
    return len(days)


def _level(topic: dict[str, Any], attempts: list[tuple[str, dict[str, Any]]]) -> str:
    if not attempts:
        return "introduced" if "introduced" in topic else "new"
    correct = [item for _, item in attempts if item.get("result") == "correct"]
    if not correct:
        return "attempted"
    alone = [item for item in correct if unaided(item)]
    if not alone:
        return "assisted"
    if any(item.get("transfer") for item in alone):
        return "transferred"
    days = _unaided_days(attempts)
    span = (date.fromisoformat(days[-1]) - date.fromisoformat(days[0])).days
    if len(days) >= RETAINED_DAYS and span >= RETAINED_SPAN:
        return "retained"
    return "independent"


def _lapsed(attempts: list[tuple[str, dict[str, Any]]]) -> bool:
    alone = [item for _, item in attempts if unaided(item)]
    return (
        bool(alone)
        and alone[-1].get("result") != "correct"
        and any(item.get("result") == "correct" for item in alone[:-1])
    )


def _standing(topic: dict[str, Any], history: _History) -> dict[str, Any]:
    attempts = history.attempts
    result: dict[str, Any] = {
        "level": _level(topic, attempts),
        "attempts": len(attempts),
        "unaided_days": len(_unaided_days(attempts)),
    }
    if attempts:
        key, item = attempts[-1]
        last = {"id": key, "date": item["date"], "result": item["result"]}
        result["last"] = {**last, "unaided": unaided(item)}
    if _lapsed(attempts):
        result["lapsed"] = True
    judged = topic.get("judged")
    if judged is not None and history.latest > judged:
        result["stale"] = True
    return result


def standings(record: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Every topic's standing, in one pass over the observations."""
    histories = _histories(record)
    return {
        key: _standing(topic, histories.get(key, _History()))
        for key, topic in record["topics"].items()
    }


def standing(record: dict[str, Any], topic: str) -> dict[str, Any]:
    """One topic's standing."""
    return standings(record)[topic]


# --- the review ladder --------------------------------------------------------


def interval(attempt: dict[str, Any], streak: int) -> int:
    """Days until the next retrieval after ``attempt``.

    ``streak`` is the current run of unaided-correct days (``streak_days``).
    """
    result = attempt.get("result")
    if result == "correct" and unaided(attempt):
        return LADDER[min(max(streak, 1), len(LADDER)) - 1]
    if result in ("correct", "partial"):
        return HELPED_DAYS
    return INCORRECT_DAYS


def review_day(base: date, days: int, exam: date | None) -> date:
    """``base + days``, pulled in before a later exam; always after ``base``.

    With the exam the next day the review lands on the exam day itself.
    """
    if exam is None or exam <= base:
        return base + timedelta(days=days)
    days = min(days, max(1, (exam - base).days // EXAM_SHARE))
    pulled = min(base + timedelta(days=days), exam - timedelta(days=1))
    return max(base + timedelta(days=1), pulled)


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


def _new_attempt_topics(record: dict[str, Any], changes: PatchResult) -> list[str]:
    superseded = corrected(record["observations"])
    topics: dict[str, None] = {}
    for key in changes.observations:
        item = record["observations"][key]
        if key not in superseded and item["kind"] in SCHEDULING_KINDS:
            topics.update(dict.fromkeys(item["topics"]))
    return list(topics)


def _climb_ladder(
    record: dict[str, Any],
    changes: PatchResult,
    histories: dict[str, _History],
    scheduled: Scheduled,
) -> None:
    exam = _exam(record)
    for key in _new_attempt_topics(record, changes):
        if key in changes.tutor_reviews:
            continue
        attempts = histories[key].attempts
        _, newest = attempts[-1]
        days = interval(newest, streak_days(attempts))
        due = review_day(date.fromisoformat(newest["date"]), days, exam)
        scheduled.reviews[key] = _with_review(record, key, due, "engine")


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

    Tutor-set dates on or after the exam move to the day before it. Topics that
    gained an effective attempt or exam climb the ladder from their newest
    attempt, by their current unaided streak, unless the same patch dated their
    review. Gap or note judged on an earlier day than the new evidence gets a
    note. Newly introduced topics
    without attempts or a date get a first retrieval. Self-reports never
    reschedule.
    """
    result = {**record, "topics": dict(record["topics"])}
    scheduled = Scheduled()
    histories = _histories(result)
    _clamp_tutor_dates(result, changes, today, scheduled)
    _climb_ladder(result, changes, histories, scheduled)
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


def due(
    record: dict[str, Any],
    today: date,
    *,
    levels: dict[str, dict[str, Any]] | None = None,
    order: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Reviews due on or before ``today``, by due day then path order."""
    current = levels or standings(record)
    rank = _ranked(record, order)
    items = []
    for key, topic in record["topics"].items():
        when = topic.get("review", {}).get("due")
        if when is None or when > today.isoformat():
            continue
        item: dict[str, Any] = {"topic": key}
        if "title" in topic:
            item["title"] = topic["title"]
        item["due"] = when
        item["overdue"] = (today - date.fromisoformat(when)).days
        item["level"] = current[key]["level"]
        if "prompt" in topic["review"]:
            item["prompt"] = topic["review"]["prompt"]
        if "gap" in topic:
            item["gap"] = topic["gap"]
        items.append(item)
    items.sort(key=lambda item: (item["due"], rank[item["topic"]]))
    return items


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
