from datetime import date, timedelta
import math
from typing import Any

from learning import agenda, capacity, progress, schema
from learning.capacity import Capacity, Weekday

MONDAY = date(2026, 1, 5)
WEEKDAYS = frozenset(range(5))


def on(offset: int) -> date:
    return MONDAY + timedelta(days=offset)


def save(record: dict[str, Any], patch: dict[str, Any], day: date) -> dict[str, Any]:
    now = f"{day.isoformat()}T09:00:00+00:00"
    patched, outcome = schema.apply_patch(record, patch, today=day, now=now)
    planned, _ = progress.schedule(patched, outcome, day)
    return schema.validate_record(planned)


def course(
    topics: int,
    *,
    exam: int | None = None,
    needs: dict[str, list[str]] | None = None,
    contrasts: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    handles = [f"t{index:02d}" for index in range(topics)]
    patch: dict[str, Any] = {
        "topics": {
            key: {
                **({"needs": needs[key]} if needs and key in needs else {}),
                **(
                    {"contrasts": contrasts[key]}
                    if contrasts and key in contrasts
                    else {}
                ),
            }
            for key in handles
        },
        "path": {"order": handles},
    }
    if exam is not None:
        patch["exam"] = {"date": on(exam).isoformat()}
    return save(schema.empty(), patch, MONDAY)


def taught(record: dict[str, Any], due: date) -> dict[str, Any]:
    """Every topic taught ten days ago and due on ``due``."""
    every = {key: {"introduced": True} for key in record["topics"]}
    record = save(record, {"topics": every}, on(-10))
    pins = {key: {"review": {"due": due.isoformat()}} for key in record["topics"]}
    return save(record, {"topics": pins}, MONDAY)


def week(reviews: float, new: float, study: frozenset[int] = WEEKDAYS) -> Capacity:
    days = tuple(
        Weekday(1.0 if day in study else 0.0, reviews, new) for day in range(7)
    )
    return Capacity(days, study, 20.0)


def answer(topic: str, result: str = "correct") -> dict[str, Any]:
    return {"topics": [topic], "text": "q", "help": "none", "result": result}


def plan(
    records: dict[str, dict[str, Any]], days: int, capacity_: Capacity
) -> agenda.Plan:
    return agenda.plan(records, MONDAY, days, capacity_)


def started(days: list[dict[str, Any]]) -> dict[str, str]:
    return {topic: day["date"] for day in days for topic in day["new"]}


def test_a_day_holds_what_he_completes_on_that_weekday_and_carries_the_rest() -> None:
    record = taught(course(12), on(-1))
    days = plan({"c": record}, 7, week(2.5, 0)).days["c"]
    assert [len(day["reviews"]) for day in days[:4]] == [3, 2, 3, 2]
    assert [len(day["reviews"]) for day in days[5:]] == [0, 0]
    assert {t for day in days for t in day["reviews"]} == set(record["topics"])


def test_nothing_is_planned_on_a_day_he_does_not_study() -> None:
    record = course(10, exam=30)
    days = plan({"c": record}, 28, week(5, 2)).days["c"]
    for day in days:
        if date.fromisoformat(day["date"]).weekday() >= 5:
            assert not day["reviews"] and not day["new"]


def test_courses_share_one_day_and_the_nearest_exam_starts_first() -> None:
    near, far = course(6, exam=20), course(6, exam=40)
    together = plan({"near": near, "far": far}, 40, week(4, 1))
    for offset in range(40):
        reviews = sum(len(days[offset]["reviews"]) for days in together.days.values())
        new = sum(len(days[offset]["new"]) for days in together.days.values())
        assert reviews <= 4 and new <= 1
    assert together.days["near"][0]["new"] == ["t00"]
    assert together.days["far"][0]["new"] == []
    assert max(started(together.days["near"]).values()) < min(
        started(together.days["far"]).values()
    )


def test_new_topics_finish_before_the_final_review_and_the_rest_does_not_fit() -> None:
    days = plan({"c": course(8, exam=28)}, 28, week(10, 2))
    last = agenda.last_new_day(progress.Exam(on(28), on(22))).isoformat()
    assert max(started(days.days["c"]).values()) <= last
    assert days.does_not_fit == {}
    tight = plan({"c": course(20, exam=10)}, 10, week(10, 1))
    assert tight.does_not_fit["c"][-1] == "t19"
    assert set(tight.does_not_fit["c"]).isdisjoint(started(tight.days["c"]))


def test_a_topic_waits_for_its_prerequisites_to_be_solid() -> None:
    record = course(3, needs={"t01": ["t00"], "t02": ["t01"]})
    days = plan({"c": record}, 7, week(5, 3, frozenset(range(7)))).days["c"]
    assert started(days) == {
        "t00": on(0).isoformat(),
        "t01": on(1).isoformat(),
        "t02": on(2).isoformat(),
    }


def test_a_competing_method_waits_until_the_first_is_solid() -> None:
    record = course(3, exam=30, contrasts={"t00": ["t01"]})
    days = plan({"c": record}, 3, week(5, 3, frozenset(range(7)))).days["c"]
    assert days[0]["new"] == ["t00", "t02"]
    assert days[1]["new"] == ["t01"]


def test_the_final_review_spreads_over_the_study_days_by_what_each_holds() -> None:
    record = course(10, exam=60)
    for offset, topic in enumerate(record["topics"]):
        record = save(record, {"topics": {topic: {"introduced": True}}}, on(offset))
    days = plan({"c": record}, 60, week(30, 0)).days["c"]
    final = [
        day for day in days if on(54).isoformat() <= day["date"] < on(60).isoformat()
    ]
    counts = [len(day["reviews"]) for day in final]
    studied = [d for d in final if date.fromisoformat(d["date"]).weekday() < 5]
    assert sum(counts) == 10
    assert max(counts) <= math.ceil(10 / len(studied))
    assert all(
        not day["reviews"]
        for day in final
        if date.fromisoformat(day["date"]).weekday() >= 5
    )


def test_the_exam_day_holds_nothing_and_reviews_go_on_after_it() -> None:
    record = course(3, exam=10)
    for topic in record["topics"]:
        record = save(record, {"topics": {topic: {"introduced": True}}}, MONDAY)
    record = save(
        record, {"observations": [answer(t) for t in record["topics"]]}, on(1)
    )
    days = plan({"c": record}, 60, week(10, 1, frozenset(range(7)))).days["c"]
    assert not days[10]["reviews"] and not days[10]["new"]
    after = [t for day in days[11:] for t in day["reviews"]]
    assert sorted(set(after)) == sorted(record["topics"])


def test_after_the_exam_its_reviews_come_after_every_other_course() -> None:
    passed = taught(course(4, exam=-3), on(-1))
    current = taught(course(4, exam=20), on(-1))
    first = plan({"passed": passed, "current": current}, 1, week(5, 0)).days
    assert len(first["current"][0]["reviews"]) == 4
    assert len(first["passed"][0]["reviews"]) == 1


def test_capacity_is_learned_from_the_days_he_studied() -> None:
    days = {
        on(offset): capacity.Done(reviews=8, new=2)
        for offset in range(28)
        if on(offset).weekday() in (0, 2, 4)
    }
    learned = capacity.estimate(days, on(28))
    assert learned.study_weekdays == frozenset({0, 2, 4})
    assert 7 < learned.on(on(28)).reviews <= 8
    assert 1.5 < learned.on(on(28)).new <= 2


def test_with_no_record_the_prior_holds_every_day() -> None:
    cold = capacity.estimate({}, MONDAY)
    assert cold.study_weekdays == frozenset(range(7))
    assert cold.on(MONDAY) == Weekday(1.0, capacity.PRIOR_REVIEWS, capacity.PRIOR_NEW)


def test_today_holds_only_what_is_left_after_what_he_already_did() -> None:
    record = course(6, exam=40)
    record = save(record, {"topics": {"t00": {"introduced": True}}}, MONDAY)
    days = plan({"c": record}, 2, week(5, 1)).days["c"]
    assert days[0]["new"] == []
    assert days[1]["new"] == ["t01"]


def test_courses_without_an_exam_share_his_new_topic_room() -> None:
    together = plan(
        {"a": course(10), "b": course(10)}, 2, week(10, 3, frozenset(range(7)))
    )
    assert [len(day["new"]) for day in together.days["a"]] == [2, 2]
    assert [len(day["new"]) for day in together.days["b"]] == [1, 1]


def test_a_pinned_date_on_an_untaught_topic_does_not_unlock_what_needs_it() -> None:
    record = course(3, needs={"t01": ["t00"]})
    pin = {"t00": {"review": {"due": on(2).isoformat()}}}
    record = save(record, {"topics": pin}, MONDAY)
    days = plan({"c": record}, 4, week(5, 1, frozenset(range(7)))).days["c"]
    first = started(days)
    assert first["t00"] == on(0).isoformat()
    assert first["t01"] >= on(1).isoformat()
    assert "t00" not in days[0]["reviews"]


def test_the_days_before_his_first_record_are_not_days_off() -> None:
    days = {on(offset): capacity.Done(4, 1) for offset in range(-10, 0)}
    assert capacity.estimate(days, MONDAY).study_weekdays == frozenset(range(7))
    yesterday = capacity.estimate({on(-1): capacity.Done(4, 1)}, MONDAY)
    assert 6 in yesterday.study_weekdays
