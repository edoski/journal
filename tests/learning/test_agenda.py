from datetime import date, timedelta
from typing import Any

import pytest

from learning import agenda, schema

MONDAY = date(2026, 1, 5)
NOW = "2026-01-05T09:00:00+00:00"


def on(offset: int) -> date:
    return MONDAY + timedelta(days=offset)


def course(
    topics: int, *, exam: int | None = None, preferences: dict[str, str] | None = None
) -> dict[str, Any]:
    handles = [f"t{index:02d}" for index in range(topics)]
    patch: dict[str, Any] = {
        "topics": {key: {} for key in handles},
        "path": {"order": handles},
    }
    if exam is not None:
        patch["exam"] = {"date": on(exam).isoformat()}
    if preferences:
        patch["preferences"] = preferences
    return schema.apply_patch(schema.empty(), patch, today=MONDAY, now=NOW)[0]


def plan(record: dict[str, Any], days: int, **settings: Any) -> list[dict[str, Any]]:
    return agenda.plan_days(
        record,
        MONDAY,
        agenda.settings(record["preferences"]),
        days,
        **settings,
    )


def introduced(days: list[dict[str, Any]]) -> dict[str, str]:
    return {topic: day["date"] for day in days for topic in day["new"]}


def test_new_topics_are_paced_from_today_to_finish_before_the_final_review() -> None:
    days = plan(course(20, exam=56), 56)
    taught = introduced(days)
    assert len(taught) == 20
    last = on(56 - 6 - agenda.NEW_BEFORE_FINAL).isoformat()
    assert max(taught.values()) <= last
    assert days[0]["new"] == ["t00"]
    assert all(date.fromisoformat(day).weekday() < 5 for day in taught.values())


def test_weekends_take_new_topics_when_the_learner_wants_them() -> None:
    record = course(20, exam=56, preferences={"new_topics_on_weekends": "yes"})
    weekdays = {
        date.fromisoformat(day).weekday()
        for day in introduced(plan(record, 56)).values()
    }
    assert 5 in weekdays or 6 in weekdays


def test_a_day_the_journal_leaves_without_study_takes_no_new_topic() -> None:
    off = on(1)
    days = plan(course(20, exam=56), 7, study_day=lambda day: day != off)
    assert days[1]["new"] == []
    assert days[2]["new"]


def test_the_plan_keeps_to_the_budget_and_carries_the_rest() -> None:
    record = course(12, preferences={"daily_topics": "3"})
    due = {key: {"review": {"due": on(-1).isoformat()}} for key in record["topics"]}
    record = schema.apply_patch(record, {"topics": due}, today=MONDAY, now=NOW)[0]
    days = plan(record, 4)
    assert [len(day["reviews"]) + len(day["new"]) for day in days] == [3, 3, 3, 3]
    assert sorted(topic for day in days for topic in day["reviews"]) == sorted(
        record["topics"]
    )


def test_the_exam_day_and_after_propose_nothing() -> None:
    days = plan(course(5, exam=3), 6)
    assert [bool(day["reviews"] or day["new"]) for day in days[3:]] == [False] * 3


def test_with_no_exam_one_new_topic_a_study_day() -> None:
    days = plan(course(10), 7)
    assert [len(day["new"]) for day in days] == [1, 1, 1, 1, 1, 0, 0]
    assert days[1]["reviews"] == ["t00"]


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ({}, agenda.Settings(8, False)),
        (
            {"daily_topics": "12 topics", "new_topics_on_weekends": "Yes"},
            agenda.Settings(12, True),
        ),
        ({"daily_topics": "lots"}, agenda.Settings(8, False)),
    ],
)
def test_settings_read_the_preferences(
    values: dict[str, str], expected: agenda.Settings
) -> None:
    assert agenda.settings(values) == expected


def test_a_late_start_is_capped_at_a_teachable_pace() -> None:
    days = plan(course(30, exam=14), 14)
    assert max(len(day["new"]) for day in days) == agenda.NEW_PER_DAY
    assert len(introduced(days)) < 30


def test_after_the_exam_the_plan_waits_for_a_new_date() -> None:
    record = course(5, exam=-1)
    assert all(not day["reviews"] and not day["new"] for day in plan(record, 7))
