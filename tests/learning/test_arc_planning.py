"""The daily plan in a course with arcs: the next exam's scope, and the order
and reasons of new topics."""

from datetime import date, timedelta
from typing import Any

from learning import agenda, arcs, capacity, progress, schema
from learning.capacity import Capacity, Limit, Weekday

MONDAY = date(2026, 1, 5)
EVERY_DAY = frozenset(range(7))
REASON = {"reason": "the syllabus's units"}


def on(offset: int) -> date:
    return MONDAY + timedelta(days=offset)


def read(records: dict[str, dict[str, Any]], day: date) -> dict[str, dict[str, Any]]:
    """The records as the plan reads them: each exam's final review from his pace."""
    return capacity.final_reviews(records, day)


def save(record: dict[str, Any], patch: dict[str, Any], day: date) -> dict[str, Any]:
    """One save as ``records.save`` makes it, without the file."""
    now = f"{day.isoformat()}T09:00:00+00:00"
    before = read({"c": record}, day)["c"]
    patched, outcome = schema.apply_patch(before, patch, today=day, now=now)
    arcs.settle(before, patched, patch, outcome, day)
    if outcome.exam_moved:
        patched = capacity.replanned({"c": patched}, "c", day)
    scheduled, _ = progress.schedule(patched, outcome, day)
    return schema.validate_record(progress.begun(scheduled, day))


def arc(title: str) -> dict[str, str]:
    return {"title": title, "question": f"What is {title}?", "purpose": f"Use {title}."}


# Four arcs: a chain from A to C, and D, which needs nothing from the others.
TOPICS = {
    "a1": {"arc": "a"},
    "a2": {"arc": "a", "needs": ["a1"]},
    "b1": {"arc": "b", "needs": ["a1"]},
    "b2": {"arc": "b", "needs": ["b1"]},
    "c1": {"arc": "c", "needs": ["b1"]},
    "c2": {"arc": "c", "needs": ["c1"]},
    "d1": {"arc": "d"},
    "d2": {"arc": "d", "needs": ["d1"]},
}
ORDER = ["a1", "a2", "b1", "b2", "c1", "c2", "d1", "d2"]


def course(
    exam: dict[str, Any] | None = None, topics: dict[str, Any] | None = None
) -> dict[str, Any]:
    patch: dict[str, Any] = {
        "arcs": {name: arc(name.upper()) for name in "abcd"},
        "topics": topics or TOPICS,
        "path": {"order": ORDER, "arcs": list("abcd")},
        "arc_change": REASON,
    }
    if exam is not None:
        patch["exam"] = exam
    return save(schema.empty(), patch, MONDAY)


def taught(record: dict[str, Any], keys: list[str], day: date) -> dict[str, Any]:
    return save(record, {"topics": {key: {"introduced": True} for key in keys}}, day)


def week(reviews: float, new: float) -> Capacity:
    days = tuple(Weekday(1.0, Limit(reviews, True), Limit(new, True)) for _ in range(7))
    return Capacity(days, EVERY_DAY, 20.0)


def plan(
    records: dict[str, dict[str, Any]], day: date, days: int, rates: Capacity
) -> agenda.Plan:
    return agenda.plan(read(records, day), day, days, rates)


def starts(result: agenda.Plan, name: str = "c") -> list[str]:
    return [topic for day in result.days[name] for topic in day["new"]]


def whole_course(day: int) -> dict[str, Any]:
    return {"date": on(day).isoformat(), "arcs": None}


def scoped(arcs_: list[str], day: int, **extra: Any) -> dict[str, Any]:
    return {"date": on(day).isoformat(), "arcs": arcs_, **extra}


# --- the exam's scope --------------------------------------------------------


def test_a_topic_outside_the_exams_arcs_is_scheduled_as_with_no_exam() -> None:
    record = taught(course(scoped(["a", "b"], 30)), ORDER, on(-20))
    record = read({"c": record}, MONDAY)["c"]
    exam = progress.exam_plan(record)
    assert exam is not None
    assert progress.exam_for(record, "a1") == exam
    assert progress.exam_for(record, "c1") is None
    replayed = progress.replays(record)
    assert all(
        progress.replays({**record, "exam": {}})[key] == replayed[key]
        for key in ("c1", "c2", "d1", "d2")
    )


def test_the_pace_and_what_does_not_fit_hold_only_the_exams_scope() -> None:
    record = course(scoped(["a", "b"], 3))
    result = plan({"c": record}, MONDAY, 10, week(10, 1))
    assert set(result.does_not_fit["c"]) <= {"a1", "a2", "b1", "b2"}
    first = starts(result)[:2]
    assert set(first) <= {"a1", "a2", "b1", "b2"}


def test_the_final_review_holds_only_what_the_exam_examines() -> None:
    record = taught(course(scoped(["a", "b"], 12)), ORDER, on(-20))
    pins = {key: {"review": {"due": on(9).isoformat()}} for key in ORDER}
    record = save(record, {"topics": pins}, MONDAY)
    result = plan({"c": record}, MONDAY, 13, week(1, 0))
    assert not set(result.unreviewed.get("c", [])) - {"a1", "a2", "b1", "b2"}
    exam = progress.exam_plan(read({"c": record}, MONDAY)["c"])
    assert exam is not None
    final_days = [
        day
        for day in result.days["c"]
        if exam.final.isoformat() <= day["date"] < exam.day.isoformat()
    ]
    reviewed = [topic for day in final_days for topic in day["reviews"]]
    examined = [topic for topic in reviewed if topic in {"a1", "a2", "b1", "b2"}]
    assert reviewed[: len(examined)] == examined, "examined topics first"


def test_the_exams_untaught_prerequisites_join_its_pace_and_then_leave_it() -> None:
    record = course(scoped(["c", "d"], 40))
    untaught = list(ORDER)
    scope = progress.exam_topics(record, untaught)
    assert scope == frozenset({"c1", "c2", "d1", "d2", "b1", "a1"})
    result = plan({"c": record}, MONDAY, 39, week(10, 1))
    order = starts(result)
    assert order.index("a1") < order.index("b1") < order.index("c1")
    assert scope is not None and scope <= set(order), "every scoped topic starts"
    assert "a1" not in result.unreviewed.get("c", [])
    record = read({"c": taught(record, ["a1"], MONDAY)}, MONDAY)["c"]
    assert progress.exam_for(record, "a1") is None
    later = frozenset({"c1", "c2", "d1", "d2", "b1"})
    assert progress.exam_topics(record, ["a2", "b1", "b2"]) == later


def test_a_topic_the_exam_leaves_out_stays_out_of_its_pace() -> None:
    record = course(scoped(["a", "b"], 3, leaves_out=["b2"]))
    assert progress.exam_topics(record, ORDER) == frozenset({"a1", "a2", "b1"})
    result = plan({"c": record}, MONDAY, 10, week(10, 1))
    assert "b2" not in result.does_not_fit.get("c", [])


def test_a_gate_outside_the_scope_keeps_the_exams_deadline() -> None:
    near = taught(course(scoped(["c", "d"], 8)), ["a1", "a2", "b1"], on(-1))
    far = taught(course(whole_course(30)), ["a1", "a2", "b1", "b2", "c1"], on(-1))
    result = plan({"near": near, "far": far}, MONDAY, 1, week(1, 0))
    assert result.days["near"][0]["reviews"] == ["b1"]


def test_after_an_exam_over_named_arcs_the_rest_of_the_course_still_starts() -> None:
    record = course(scoped(["a"], 2))
    record = taught(record, ["a1", "a2"], MONDAY)
    later = on(5)
    result = plan({"c": record}, later, 20, week(10, 1))
    assert {"b1", "d1"} <= set(starts(result))
    whole = course(whole_course(2))
    whole = taught(whole, ["a1", "a2"], MONDAY)
    assert starts(plan({"c": whole}, later, 20, week(10, 1))) == []


def test_the_final_review_is_as_long_as_the_topics_the_exam_examines() -> None:
    reviews = week(2, 1)
    small = course(scoped(["a"], 40))
    whole = course(whole_course(40))
    short = capacity.final_review_days(small, [], reviews, MONDAY)
    long = capacity.final_review_days(whole, [], reviews, MONDAY)
    assert short is not None and long is not None and short < long


# --- a course that takes no questions ----------------------------------------

BRANCHES = {
    "gtm-site": {"arc": "gtm"},
    "gtm-ops": {"arc": "gtm", "needs": ["gtm-site"]},
    "eve-api": {"arc": "eve"},
    "eve-ops": {"arc": "eve", "needs": ["eve-api"]},
}


def branches() -> dict[str, Any]:
    patch = {
        "preferences": {"questions": "none"},
        "arcs": {"gtm": arc("GTM"), "eve": arc("Eve")},
        "topics": BRANCHES,
        "path": {"order": list(BRANCHES), "arcs": ["gtm", "eve"]},
        "arc_change": REASON,
    }
    return save(schema.empty(), patch, MONDAY)


def test_a_course_that_takes_no_questions_builds_on_what_was_taught() -> None:
    record = taught(branches(), ["gtm-site"], MONDAY)
    assert "review" not in record["topics"]["gtm-site"], "no first retrieval"
    result = plan({"c": record}, on(1), 10, week(10, 1))
    assert set(starts(result)) == {"gtm-ops", "eve-api", "eve-ops"}
    assert all(not day["reviews"] for day in result.days["c"]), "nothing falls due"
