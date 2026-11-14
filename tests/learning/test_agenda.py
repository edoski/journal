from datetime import date, timedelta
import math
from typing import Any

from learning import agenda, capacity, progress, schema
from learning.capacity import Capacity, Done, Limit, Weekday

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


def week(
    reviews: float,
    new: float,
    study: frozenset[int] = WEEKDAYS,
    *,
    shown: bool = True,
) -> Capacity:
    """His week, with these limits shown or, with ``shown`` false, as the most
    he has shown he does."""
    days = tuple(
        Weekday(1.0 if day in study else 0.0, Limit(reviews, shown), Limit(new, shown))
        for day in range(7)
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
    last = progress.last_new_day(progress.Exam(on(28), on(22))).isoformat()
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
    assert learned.on(on(28)).reviews == Limit(8.0)
    assert learned.on(on(28)).new == Limit(2.0)


def test_with_no_record_the_prior_holds_every_day() -> None:
    cold = capacity.estimate({}, MONDAY)
    assert cold.study_weekdays == frozenset(range(7))
    assert cold.on(MONDAY) == Weekday(1.0, Limit(0.0), Limit(capacity.PRIOR_NEW))


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


def every_day(done: Done, days: int = 28) -> dict[date, Done]:
    return {on(offset - days): done for offset in range(days)}


def test_a_learner_who_finishes_every_plan_is_never_held_back() -> None:
    learned = capacity.estimate(every_day(Done(reviews=2, new=1)), MONDAY)
    assert learned.on(MONDAY).reviews == Limit(2.0)
    record = taught(course(12), on(-1))
    days = plan({"c": record}, 1, learned).days["c"]
    assert len(days[0]["reviews"]) == 12


def test_stopping_short_shows_a_limit_the_plan_keeps_to() -> None:
    learned = capacity.estimate(every_day(Done(reviews=4, reviews_short=True)), MONDAY)
    assert learned.on(MONDAY).reviews == Limit(4.0, shown=True)
    record = taught(course(12), on(-1))
    days = plan({"c": record}, 3, learned).days["c"]
    assert [len(day["reviews"]) for day in days] == [4, 4, 4]


def test_a_day_finished_below_the_limit_leaves_it_and_doing_more_raises_it() -> None:
    days = every_day(Done(reviews=6, reviews_short=True))
    light = {**days, **{on(-7 * n): Done(reviews=1) for n in range(1, 4)}}
    assert capacity.estimate(light, MONDAY).on(MONDAY).reviews.value == 6
    more = {**days, **{on(-7 * n): Done(reviews=12) for n in range(1, 4)}}
    assert capacity.estimate(more, MONDAY).on(MONDAY).reviews.value > 6


def test_until_he_shows_a_limit_each_exam_gets_its_pace() -> None:
    open_ = plan({"c": course(20, exam=10)}, 10, week(10, 1, shown=False))
    assert open_.does_not_fit == {}
    assert len(open_.days["c"][0]["new"]) > 1
    held = plan({"c": course(20, exam=10)}, 10, week(10, 1))
    assert len(held.days["c"][0]["new"]) == 1
    assert held.does_not_fit["c"]


def test_a_day_he_left_owed_work_is_a_day_he_stopped_short() -> None:
    record = course(4, exam=10)
    record = save(record, {"topics": {"t00": {"introduced": True}}}, MONDAY)
    record = save(record, {"topics": {"t01": {"introduced": True}}}, on(1))
    record = save(record, {"observations": [answer("t00")]}, on(2))
    done = capacity.activity([record], on(3))
    assert done[MONDAY].new_short
    assert done[on(2)].reviews_short
    every = save(record, {"observations": [answer("t01")]}, on(2))
    assert not capacity.activity([every], on(3))[on(2)].reviews_short


def test_a_day_he_answered_no_review_shows_no_review_limit() -> None:
    record = course(4, exam=20)
    record = save(record, {"topics": {"t00": {"introduced": True}}}, MONDAY)
    record = save(record, {"topics": {"t01": {"introduced": True}}}, on(2))
    record = save(record, {"topics": {"t02": {"introduced": True}}}, on(3))
    done = capacity.activity([record], on(4))
    assert done[on(2)].reviews == 0 and not done[on(2)].reviews_short
    week = capacity.of([record], on(4))
    assert not week.on(on(4)).reviews.shown
    assert plan_for(record, on(4))["reviews"]


def test_doing_exactly_what_the_plan_proposes_never_shows_a_limit() -> None:
    record = course(12, exam=40, needs={"t03": ["t02"]})
    for offset in range(21):
        if offset % 7 == 5:
            continue
        today = plan_for(record, on(offset))
        patch: dict[str, Any] = {}
        if today["new"]:
            patch["topics"] = {topic: {"introduced": True} for topic in today["new"]}
        if today["reviews"]:
            patch["observations"] = [answer(topic) for topic in today["reviews"]]
        if patch:
            record = save(record, patch, on(offset))
    learned = capacity.of([record], on(21))
    assert not learned.on(on(21)).reviews.shown
    assert not learned.on(on(21)).new.shown


def plan_for(record: dict[str, Any], day: date) -> dict[str, Any]:
    first: dict[str, Any] = agenda.plan({"c": record}, day, 1).days["c"][0]
    return first


def study(skipped: set[int], weeks: int = 4) -> dict[date, Done]:
    """Every day of ``weeks`` weeks up to yesterday, but the given offsets."""
    return {
        on(offset): Done(reviews=3)
        for offset in range(-7 * weeks, 0)
        if offset not in skipped
    }


def test_a_skip_leaves_a_weekday_and_a_run_of_skips_turns_it_off() -> None:
    wednesdays = [offset for offset in range(-28, 0) if on(offset).weekday() == 2]
    once = capacity.estimate(study({wednesdays[-1]}), MONDAY)
    assert 2 in once.study_weekdays
    run = capacity.estimate(study(set(wednesdays[-3:])), MONDAY)
    assert 2 not in run.study_weekdays


def test_a_day_off_stays_off_until_he_studies_on_it() -> None:
    wednesdays = {offset for offset in range(-70, 0) if on(offset).weekday() == 2}
    off = capacity.estimate(study(wednesdays, weeks=10), MONDAY)
    assert 2 not in off.study_weekdays
    back = study(wednesdays - {max(wednesdays)}, weeks=10)
    assert 2 in capacity.estimate(back, MONDAY).study_weekdays


def test_a_nearer_exam_keeps_its_topics_ahead_of_a_later_exams_pace() -> None:
    chain = {f"t{index:02d}": [f"t{index - 1:02d}"] for index in range(1, 5)}
    near, far = course(5, exam=8, needs=chain), course(20, exam=40)
    together = plan({"near": near, "far": far}, 40, week(10, 1, frozenset(range(7))))
    assert "near" not in together.does_not_fit
    assert max(started(together.days["near"]).values()) < on(8).isoformat()


def solid(record: dict[str, Any], due: date) -> dict[str, Any]:
    """Every topic taught, answered right on its own, and due on ``due``."""
    every = {key: {"introduced": True} for key in record["topics"]}
    record = save(record, {"topics": every}, on(-10))
    record = save(record, {"observations": [answer(t) for t in every]}, on(-9))
    pins = {key: {"review": {"due": due.isoformat()}} for key in record["topics"]}
    return save(record, {"topics": pins}, MONDAY)


def test_a_review_left_out_while_a_nearer_exams_reviews_fill_the_evening_is_held() -> (
    None
):
    exam = solid(course(4, exam=20), on(-1))
    free = solid(course(2), on(-1))
    together = plan({"exam": exam, "free": free}, 10, week(2, 0, frozenset(range(7))))
    assert together.days["exam"][0]["reviews"] == ["t00", "t01"]
    assert together.days["free"][0]["reviews"] == []
    assert together.held == {"free": {"t00", "t01"}}
    assert together.when("free", MONDAY, True).held == frozenset({"t00", "t01"})
    assert together.when("exam", MONDAY, True).held == frozenset()


def test_a_review_that_waits_only_on_its_own_course_is_not_held() -> None:
    free = solid(course(4), on(-1))
    together = plan({"free": free}, 10, week(2, 0, frozenset(range(7))))
    assert together.days["free"][0]["reviews"] == ["t00", "t01"]
    assert together.days["free"][1]["reviews"] == ["t02", "t03"]
    assert together.held == {}
