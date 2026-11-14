"""One exam scope for every course: ``exam.leaves_out`` names the topics the
next exam does not examine, in a course with or without arcs. A topic it
leaves out stays on the path and starts after the exam's own; an excluded
topic never starts."""

from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from learning import agenda, arc_rules, capacity, progress, records, retrieval, schema
from learning.capacity import Capacity, Limit, Weekday
from learning.workspace import Workspace

MONDAY = date(2026, 1, 5)
EVERY_DAY = frozenset(range(7))
OUT = {"excluded": "Not in this year's syllabus"}

TOPICS: dict[str, dict[str, Any]] = {
    "a": {},
    "b": {"needs": ["a"]},
    "c": {"needs": ["b"]},
    "left": {"needs": ["b"]},
    "gone": {"needs": ["a"], **OUT},
}
ORDER = ["a", "b", "c", "left"]


def on(offset: int) -> date:
    return MONDAY + timedelta(days=offset)


def read(record: dict[str, Any], day: date) -> dict[str, Any]:
    return capacity.final_reviews({"c": record}, day)["c"]


def save(record: dict[str, Any], patch: dict[str, Any], day: date) -> dict[str, Any]:
    now = f"{day.isoformat()}T09:00:00+00:00"
    patched, outcome = schema.apply_patch(read(record, day), patch, today=day, now=now)
    if outcome.exam_moved:
        patched = capacity.replanned({"c": patched}, "c", day)
    scheduled, _ = progress.schedule(patched, outcome, day)
    return schema.validate_record(progress.begun(scheduled, day))


def course(exam: dict[str, Any]) -> dict[str, Any]:
    patch = {"topics": TOPICS, "path": {"order": ORDER}, "exam": exam}
    return save(schema.empty(), patch, MONDAY)


def exam(day: int, **extra: Any) -> dict[str, Any]:
    return {"date": on(day).isoformat(), **extra}


def week(reviews: float, new: float) -> Capacity:
    days = tuple(Weekday(1.0, Limit(reviews, True), Limit(new, True)) for _ in range(7))
    return Capacity(days, EVERY_DAY, 20.0)


def starts(record: dict[str, Any], day: date, days: int) -> dict[str, str]:
    """Each topic the plan starts, with its day."""
    result = agenda.plan({"c": read(record, day)}, day, days, week(10, 1))
    return {topic: item["date"] for item in result.days["c"] for topic in item["new"]}


def test_without_arcs_the_exam_examines_the_course_less_what_it_leaves_out() -> None:
    record = course(exam(10, leaves_out=["left"]))
    assert arc_rules.examined(record) == {"a", "b", "c"}
    assert arc_rules.examined(course(exam(10))) is None


def test_a_topic_the_exam_leaves_out_starts_after_it() -> None:
    planned = starts(course(exam(3, leaves_out=["left"])), MONDAY, 20)
    assert {"a", "b", "c"} <= set(planned)
    assert planned["left"] >= on(3).isoformat(), "it waits for the exam"


def test_it_starts_before_the_exam_only_once_nothing_examined_waits() -> None:
    planned = starts(course(exam(20, leaves_out=["left"])), MONDAY, 20)
    assert planned["left"] < on(20).isoformat()
    assert planned["left"] > max(planned[key] for key in ("a", "b", "c"))


def test_an_excluded_topic_never_starts_before_or_after_the_exam() -> None:
    record = course(exam(3, leaves_out=["left"]))
    assert "gone" not in starts(record, MONDAY, 30)
    assert "gone" not in starts(record, on(10), 30)


def test_it_is_not_in_the_exams_pace_final_review_or_readiness() -> None:
    record = course(exam(1, leaves_out=["left"]))
    plan = agenda.plan({"c": read(record, MONDAY)}, MONDAY, 5, week(10, 1))
    assert "left" not in plan.does_not_fit.get("c", [])
    taught = save(record, {"topics": {k: {"introduced": True} for k in ORDER}}, MONDAY)
    taught = read(taught, MONDAY)
    assert progress.exam_for(taught, "left") is None
    assert progress.exam_for(taught, "c") is not None
    assert progress.unready(taught, MONDAY) == {"a", "b", "c"}
    reviews = week(1, 1)
    whole = read(course(exam(40)), MONDAY)
    short = capacity.final_review_days(
        read(course(exam(40, leaves_out=["left", "c"])), MONDAY), [], reviews, MONDAY
    )
    long = capacity.final_review_days(whole, [], reviews, MONDAY)
    assert short is not None and long is not None and short < long


@pytest.fixture
def workspace(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, every_day: None
) -> Workspace:
    monkeypatch.setenv("LEARNING_TODAY", MONDAY.isoformat())
    return Workspace(tmp_path)


def test_standing_counts_only_what_the_exam_examines(workspace: Workspace) -> None:
    titled = {key: {**topic, "title": key.title()} for key, topic in TOPICS.items()}
    records.save(
        workspace,
        {
            "topics": titled,
            "path": {"order": ORDER},
            "exam": exam(10, leaves_out=["left"]),
        },
    )
    parts = retrieval.course_standing(workspace)["readiness"]["parts"]
    assert parts == [{"to_start": ["a", "b", "c"]}]


def refused(workspace: Workspace, patch: dict[str, Any], part: str) -> None:
    with pytest.raises(ValueError) as error:
        records.save(workspace, patch)
    assert part in str(error.value), str(error.value)


def test_leaves_out_names_live_topics_and_never_the_whole_course(
    workspace: Workspace,
) -> None:
    records.save(workspace, {"topics": TOPICS, "path": {"order": ORDER}})
    refused(
        workspace,
        {"exam": exam(10, leaves_out=["gone"])},
        'exam.leaves_out: "gone" is excluded',
    )
    refused(
        workspace,
        {"exam": exam(10, leaves_out=["nope"])},
        'exam.leaves_out: no topic "nope"',
    )
    refused(
        workspace,
        {"exam": exam(10, leaves_out=ORDER)},
        "exam.leaves_out holds every topic the course studies",
    )
    records.save(workspace, {"exam": exam(10, leaves_out=["left"])})
    assert records.load(workspace)["exam"]["leaves_out"] == ["left"]


def test_a_new_exam_date_says_what_the_new_exam_leaves_out(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "topics": TOPICS,
            "path": {"order": ORDER},
            "exam": exam(10, leaves_out=["left"]),
        },
    )
    refused(
        workspace,
        {"exam": {"date": on(40).isoformat()}},
        "exam.date changes and exam.leaves_out does not",
    )
    records.save(workspace, {"exam": {"date": on(40).isoformat(), "leaves_out": None}})
    record = records.load(workspace)
    assert "leaves_out" not in record["exam"]
    assert arc_rules.examined(record) is None
