from datetime import date, timedelta
import math
from typing import Any

from learning import agenda, capacity, progress, schema
from learning.capacity import Capacity, Done, Limit, Weekday

# The final review these tests were written for; a save derives it from his
# pace (capacity.final_review_days), which other tests cover.
LEAD = 6


def planned(record: dict[str, Any]) -> dict[str, Any]:
    """The record read with the final review these tests were written for."""
    when = record.get("exam", {}).get("date")
    start = date.fromisoformat(when) - timedelta(days=LEAD) if when else None
    return progress.with_final_review(record, start)


MONDAY = date(2026, 1, 5)
WEEKDAYS = frozenset(range(5))
EVERY_DAY = frozenset(range(7))


def on(offset: int) -> date:
    return MONDAY + timedelta(days=offset)


def save(record: dict[str, Any], patch: dict[str, Any], day: date) -> dict[str, Any]:
    now = f"{day.isoformat()}T09:00:00+00:00"
    patched, outcome = schema.apply_patch(record, patch, today=day, now=now)
    scheduled, _ = progress.schedule(planned(patched), outcome, day)
    return schema.validate_record(scheduled)


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
    assert together.does_not_fit == {}
    last = progress.last_new_day(progress.exam_plan(planned(near))).isoformat()
    assert max(started(together.days["near"]).values()) <= last


def test_new_topics_finish_before_the_final_review_and_the_rest_does_not_fit() -> None:
    days = plan({"c": course(8, exam=28)}, 28, week(10, 2))
    last = progress.last_new_day(progress.Exam(on(28), on(22))).isoformat()
    assert max(started(days.days["c"]).values()) <= last
    assert days.does_not_fit == {}
    tight = plan({"c": course(20, exam=10)}, 10, week(10, 1))
    assert tight.does_not_fit["c"][-1] == "t19"
    assert set(tight.does_not_fit["c"]).isdisjoint(started(tight.days["c"]))


def test_the_plan_says_why_each_topic_it_cannot_start_does_not_fit() -> None:
    full = plan({"c": course(20, exam=10)}, 10, week(10, 1))
    late = full.does_not_fit["c"]
    assert {t: full.reasons["c"][t] for t in late} == dict.fromkeys(late, "full")
    chain = course(3, exam=2, needs={"t01": ["t00"], "t02": ["t01"]})
    waits = plan({"c": chain}, 2, week(10, 1, shown=False))
    assert waits.does_not_fit == {"c": ["t02"]}
    assert waits.reasons["c"]["t02"] == "not_ready", "t01 is solid only on the eve"
    monday_off = plan({"c": course(2, exam=1)}, 1, week(10, 1, frozenset({2, 3})))
    assert monday_off.reasons == {"c": {"t00": "no_study_day", "t01": "no_study_day"}}


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
    result = plan({"c": record}, 3, week(5, 3, frozenset(range(7))))
    days = result.days["c"]
    assert days[0]["new"] == ["t00"], "t02 builds on nothing: it waits its place"
    assert days[1]["new"] == ["t01", "t02"]
    why = result.when("c", MONDAY, True).why
    assert why["t01"] == {"kind": "after", "partners": ["t00"]}


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


def learned(record: dict[str, Any], day: date) -> dict[str, Any]:
    """Every topic taught on ``day``, its first retrieval the engine's date."""
    return save(
        record, {"topics": {key: {"introduced": True} for key in record["topics"]}}, day
    )


def test_a_review_beyond_todays_plan_takes_no_place_from_one_still_planned() -> None:
    records = {"a": learned(course(3), on(-2)), "b": learned(course(1), on(-2))}
    morning = plan(records, 2, week(2, 0)).days
    assert morning["a"][0]["reviews"] == ["t00"] and morning["b"][0]["reviews"] == [
        "t00"
    ]
    later = morning["a"][1]["reviews"][0]
    records["a"] = save(records["a"], {"observations": [answer(later)]}, MONDAY)
    after = plan(records, 2, week(2, 0)).days
    assert after["a"][0]["reviews"] == ["t00"] and after["b"][0]["reviews"] == ["t00"]


def test_a_review_on_todays_plan_answered_leaves_room_for_the_rest_only() -> None:
    record = learned(course(4), on(-1))
    morning = plan({"c": record}, 1, week(2, 0)).days["c"][0]["reviews"]
    first, second = morning
    record = save(record, {"observations": [answer(first)]}, MONDAY)
    assert plan({"c": record}, 1, week(2, 0)).days["c"][0]["reviews"] == [second]


def test_courses_without_an_exam_share_his_new_topic_room() -> None:
    together = plan(
        {"a": course(10), "b": course(10)}, 2, week(10, 3, frozenset(range(7)))
    )
    assert [len(day["new"]) for day in together.days["a"]] == [2, 2]
    assert [len(day["new"]) for day in together.days["b"]] == [1, 1]


def test_a_day_starts_one_new_topic_unless_his_rate_or_a_pace_needs_two() -> None:
    together = plan(
        {"a": course(10), "b": course(10)}, 4, week(10, 1.5, frozenset(range(7)))
    )
    per_day = [
        len(together.days["a"][n]["new"]) + len(together.days["b"][n]["new"])
        for n in range(4)
    ]
    assert per_day == [1, 1, 1, 1]
    assert {len(started(together.days[name])) for name in ("a", "b")} == {2}
    paced = plan({"c": course(4, exam=11)}, 1, week(10, 1.5, frozenset(range(7))))
    assert len(paced.days["c"][0]["new"]) == 2


def test_a_second_topic_on_one_day_is_one_that_belongs_with_the_first() -> None:
    record = course(4, exam=11, needs={"t00": ["t03"], "t02": ["t03"]})
    order = {"path": {"order": ["t03", "t00", "t01", "t02"]}}
    record = save(record, {**order, "topics": {"t03": {"introduced": True}}}, on(-9))
    record = save(record, {"observations": [answer("t03")]}, on(-8))
    together = plan({"c": record}, 1, week(10, 1.5, frozenset(range(7))))
    assert together.days["c"][0]["new"] == ["t00", "t02"]


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


def test_each_day_he_starts_fewer_than_the_plan_proposed_is_a_short_day() -> None:
    record = course(20, exam=9)
    proposed = []
    for offset in range(5):
        today = plan_for(record, on(offset))
        proposed.append(len(today["new"]))
        if today["new"]:
            first = {today["new"][0]: {"introduced": True}}
            record = save(record, {"topics": first}, on(offset))
    assert proposed[0] >= 2, "the pace needs several topics a day"
    days = capacity.activity([planned(record)], on(5))
    assert [days[on(offset)].new_short for offset in range(5)] == [
        count > 1 for count in proposed
    ], (proposed, days)
    assert [days[on(offset)].new_kept for offset in range(5)] == [
        count == 1 for count in proposed
    ], "a day he started what his limit proposed says nothing of it"


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


def titled(record: dict[str, Any], title: str) -> dict[str, Any]:
    return save(record, {"title": title}, MONDAY)


def test_a_review_a_full_day_leaves_out_is_held_and_says_why() -> None:
    exam = titled(solid(course(4, exam=3), on(-1)), "Probability")
    free = solid(course(2), on(-1))
    together = plan({"exam": exam, "free": free}, 10, week(2, 0, frozenset(range(7))))
    assert together.days["exam"][0]["reviews"] == ["t00", "t01"]
    assert together.days["free"][0]["reviews"] == []
    assert together.held["free"] == {"t00": "Probability", "t01": "Probability"}
    assert together.when("free", MONDAY, True).held == {
        "t00": "Probability",
        "t01": "Probability",
    }
    alone = plan(
        {"free": solid(course(4), on(-1))}, 10, week(2, 0, frozenset(range(7)))
    )
    assert alone.days["free"][1]["reviews"] == ["t02", "t03"]
    assert alone.held == {"free": {"t02": None, "t03": None}}


def test_a_nearer_exams_final_review_comes_before_a_later_courses_reviews() -> None:
    near = solid(course(8, exam=6), on(-1))
    far = solid(course(8, exam=40), on(-1))
    together = plan({"near": near, "far": far}, 7, week(2, 0, frozenset(range(7))))
    reviewed = {t for day in together.days["near"][:6] for t in day["reviews"]}
    assert reviewed == set(near["topics"])
    assert together.unreviewed == {}


def test_a_final_review_with_too_little_room_names_what_it_leaves() -> None:
    record = solid(course(6, exam=3), on(-1))
    recent = {"observations": [answer("t04"), answer("t05")]}
    record = save(record, recent, on(-5))
    record = save(
        record,
        {
            "topics": {
                t: {"review": {"due": on(0).isoformat()}} for t in record["topics"]
            }
        },
        MONDAY,
    )
    together = plan({"c": record}, 4, week(1, 0, frozenset(range(7))))
    assert together.unreviewed == {"c": ["t03", "t04", "t05"]}
    assert together.reasons == {"c": dict.fromkeys(["t03", "t04", "t05"], "full")}
    eve = plan({"c": course(1, exam=1)}, 2, week(10, 1, shown=False))
    assert eve.unreviewed == {"c": ["t00"]}
    assert eve.reasons == {"c": {"t00": "too_late"}}, "its first review is the exam day"


def test_a_course_with_no_exam_keeps_the_reviews_memory_needs_most() -> None:
    exam = solid(course(4, exam=40), MONDAY)
    free = solid(course(1), on(-1))
    free = save(
        free, {"topics": {"t00": {"review": {"due": on(-8).isoformat()}}}}, MONDAY
    )
    together = plan({"exam": exam, "free": free}, 1, week(2, 0, frozenset(range(7))))
    assert together.days["free"][0]["reviews"] == ["t00"]
    assert len(together.days["exam"][0]["reviews"]) == 1


def test_no_course_starves_another_of_reviews_while_its_exam_is_weeks_away() -> None:
    exam = solid(course(12, exam=60), MONDAY)
    free = solid(course(4), MONDAY)
    together = plan({"exam": exam, "free": free}, 14, week(2, 0, frozenset(range(7))))
    placed = {t for day in together.days["free"] for t in day["reviews"]}
    assert placed == set(free["topics"])


def test_a_review_the_final_review_repeats_waits_behind_a_course_with_no_exam() -> None:
    free = solid(course(1), on(-1))
    near = solid(course(1, exam=12), on(-2))
    near = save(near, {"preferences": {"final_review_days": "6"}}, MONDAY)
    together = plan({"exam": near, "free": free}, 1, week(1, 0, frozenset(range(7))))
    assert together.days["free"][0]["reviews"] == ["t00"]
    far = solid(course(1, exam=60), on(-2))
    together = plan({"exam": far, "free": free}, 1, week(1, 0, frozenset(range(7))))
    assert together.days["exam"][0]["reviews"] == ["t00"]


def test_a_review_a_competing_methods_start_waits_on_comes_first() -> None:
    exam = course(3, exam=40, contrasts={"t01": ["t00"]})
    exam = save(exam, {"topics": {"t00": {"introduced": True}}}, on(-3))
    exam = save(
        exam, {"topics": {"t00": {"review": {"due": on(-1).isoformat()}}}}, MONDAY
    )
    free = solid(course(1), on(-30))
    together = plan({"exam": exam, "free": free}, 1, week(1, 0, frozenset(range(7))))
    assert together.days["exam"][0]["reviews"] == ["t00"]


def test_competing_methods_due_together_are_reviewed_side_by_side() -> None:
    record = solid(course(2, contrasts={"t00": ["t01"]}), on(-1))
    record = save(
        record, {"topics": {"t00": {"review": {"due": on(-8).isoformat()}}}}, MONDAY
    )
    free = solid(course(1), on(-6))
    together = plan({"c": record, "free": free}, 1, week(2, 0, frozenset(range(7))))
    assert together.days["c"][0]["reviews"] == ["t00", "t01"]
    assert together.days["free"][0]["reviews"] == []


def test_a_pair_of_competing_methods_is_not_split_for_want_of_one_place() -> None:
    free = solid(course(3), on(-30))
    free = save(
        free, {"topics": {"t02": {"review": {"due": on(-2).isoformat()}}}}, MONDAY
    )
    pair = solid(course(2, contrasts={"t00": ["t01"]}), on(-5))
    together = plan({"free": free, "pair": pair}, 2, week(3, 0, frozenset(range(7))))
    assert together.days["free"][0]["reviews"] == ["t00", "t01", "t02"]
    assert together.days["pair"][0]["reviews"] == []
    assert together.days["pair"][1]["reviews"] == ["t00", "t01"]


def test_a_review_waits_a_short_while_for_its_competing_method() -> None:
    def days(partner_due: int) -> dict[str, str]:
        record = solid(course(2, contrasts={"t00": ["t01"]}), MONDAY)
        pins = {"t01": {"review": {"due": on(partner_due).isoformat()}}}
        record = save(record, {"topics": pins}, MONDAY)
        planned = plan({"c": record}, 7, week(10, 0, frozenset(range(7))))
        return {
            topic: day["date"] for day in planned.days["c"] for topic in day["reviews"]
        }

    assert days(2) == {"t00": on(2).isoformat(), "t01": on(2).isoformat()}
    assert days(5) == {"t00": on(0).isoformat(), "t01": on(5).isoformat()}


def test_a_topic_taught_topics_need_starts_before_the_rest() -> None:
    record = course(4, exam=40, needs={"t01": ["t00"], "t03": ["t02"]})
    record = save(record, {"topics": {"t03": {"introduced": True}}}, on(-3))
    near = course(6, exam=10)
    together = plan({"c": record, "near": near}, 2, week(5, 1, frozenset(range(7))))
    assert together.days["c"][0]["new"] == ["t02"]
    assert together.days["near"][0]["new"] == []


def test_a_topic_only_a_left_out_chapter_needs_waits_its_place_in_the_path() -> None:
    record = course(4, exam=40, needs={"t03": ["t02"]})
    record = save(record, {"topics": {"t03": {"excluded": "not examined"}}}, MONDAY)
    near = course(6, exam=10)
    together = plan({"c": record, "near": near}, 1, week(5, 1, frozenset(range(7))))
    assert together.days["c"][0]["new"] == []
    assert together.days["near"][0]["new"] == ["t00"]


def test_a_start_that_waits_for_nearer_exams_says_which() -> None:
    near = titled(course(4, exam=10), "Probability")
    far = course(4, exam=40)
    together = plan({"near": near, "far": far}, 20, week(5, 1, frozenset(range(7))))
    first = min(started(together.days["far"]).items(), key=lambda item: item[1])[0]
    assert together.starts_after["far"][first] == ["Probability"]
    assert together.when("far", MONDAY, True).starts_after[first] == ["Probability"]


def test_a_review_that_an_exams_next_topics_wait_on_comes_first() -> None:
    near = course(3, exam=12, needs={"t01": ["t00"], "t02": ["t00"]})
    near = save(near, {"topics": {"t00": {"introduced": True}}}, on(-1))
    far = course(2, exam=40)
    far = save(far, {"topics": {"t00": {"introduced": True}}}, on(-5))
    together = plan({"near": near, "far": far}, 1, week(1, 0, frozenset(range(7))))
    assert together.days["near"][0]["reviews"] == ["t00"]
    assert together.days["far"][0]["reviews"] == []


def test_the_final_review_is_as_long_as_his_pace_needs_for_every_topic() -> None:
    every = frozenset(range(7))
    record = course(16, exam=30)
    assert capacity.final_review_days(record, [], week(2, 0, every), MONDAY) == 8
    assert capacity.final_review_days(record, [], week(4, 0, every), MONDAY) == 4
    assert capacity.final_review_days(record, [], week(2, 0), MONDAY) == 12
    assert capacity.final_review_days(record, [], week(0, 0, every), MONDAY) == (
        progress.SHORTEST_FINAL_REVIEW
    )
    assert (
        capacity.final_review_days(course(16, exam=5), [], week(2, 0, every), MONDAY)
        == 5
    )
    assert capacity.final_review_days(course(16), [], week(2, 0, every), MONDAY) is None


def test_a_review_he_did_with_nothing_else_owed_does_not_start_a_final_review() -> None:
    record = course(30, exam=25)
    record = save(record, {"topics": {"t00": {"introduced": True}}}, on(-2))
    record = save(record, {"observations": [answer("t00")]}, on(-1))
    assert not capacity.of([record], MONDAY).on(MONDAY).reviews.shown
    stored = progress.with_final_review(record, None)
    read = capacity.final_reviews({"c": stored}, MONDAY)["c"]
    shortest = on(25 - progress.SHORTEST_FINAL_REVIEW).isoformat()
    assert read["exam"]["final_review"] == shortest, "one review is no pace"
    assert progress.begun(read, MONDAY)["exam"] == {"date": on(25).isoformat()}


def test_a_nearer_exams_final_review_lengthens_a_later_one_it_overlaps() -> None:
    every = frozenset(range(7))
    near = save(course(8, exam=27), {"exam": {"date": on(27).isoformat()}}, MONDAY)
    far = course(16, exam=30)
    alone = capacity.final_review_days(far, [], week(4, 0, every), MONDAY)
    beside = capacity.final_review_days(far, [near], week(4, 0, every), MONDAY)
    assert alone == 4 and beside is not None and beside > alone


def three_reviews_a_day() -> dict[str, Any]:
    """A course with no exam whose record shows three reviews on each of the
    last two weeks' days."""
    record = course(3)
    every = {key: {"introduced": True} for key in record["topics"]}
    record = save(record, {"topics": every}, on(-15))
    for offset in range(-14, 0):
        answers = [answer(key) for key in record["topics"]]
        record = save(record, {"observations": answers}, on(offset))
    return record


def test_an_exams_final_review_is_read_from_his_pace_without_a_save() -> None:
    stored = progress.with_final_review(course(12, exam=20), None)
    read = capacity.final_reviews(
        {"free": three_reviews_a_day(), "exam": stored}, MONDAY
    )
    # Twelve topics at the three reviews he does a day: four days.
    assert read["exam"]["exam"]["final_review"] == on(16).isoformat()
    assert progress.begun(read["exam"], MONDAY)["exam"] == {"date": on(20).isoformat()}
    begun = progress.with_final_review(stored, on(16))
    assert progress.begun(begun, on(16))["exam"]["final_review"] == on(16).isoformat()


def test_a_final_review_that_has_begun_keeps_its_start() -> None:
    stored = progress.with_final_review(course(12, exam=20), on(16))
    read = capacity.final_reviews({"exam": stored}, on(18))
    assert read["exam"]["exam"]["final_review"] == on(16).isoformat()
    unplanned = progress.with_final_review(stored, None)
    read = capacity.final_reviews({"exam": unplanned}, on(19))
    assert read["exam"]["exam"]["final_review"] == on(18).isoformat()


def test_the_engines_dates_follow_the_final_review_as_read() -> None:
    record = course(1, exam=20)
    record = save(record, {"topics": {"t00": {"introduced": True}}}, on(-40))
    for offset in (-39, -36, -29, -13):
        record = save(record, {"observations": [answer("t00")]}, on(offset))
    # Thirty-five days on would pass the exam: the final review, six days out.
    assert record["topics"]["t00"]["review"] == {
        "due": on(14).isoformat(),
        "by": "engine",
    }
    read = progress.redated(progress.with_final_review(record, on(16)), MONDAY)
    assert read["topics"]["t00"]["review"]["due"] == on(16).isoformat()


def reviews_by_date(result: agenda.Plan, name: str) -> dict[str, int]:
    return {day["date"]: len(day["reviews"]) for day in result.days[name]}


def test_a_plan_made_tomorrow_gives_each_date_the_room_todays_plan_gave_it() -> None:
    record = taught(course(40), on(-1))
    capacity_ = week(2.5, 0)
    today = reviews_by_date(agenda.plan({"c": record}, MONDAY, 14, capacity_), "c")
    tomorrow = agenda.plan({"c": record}, on(1), 13, capacity_)
    assert reviews_by_date(tomorrow, "c") == {
        day: count for day, count in today.items() if day > MONDAY.isoformat()
    }


def test_the_same_records_and_day_give_the_same_plan() -> None:
    first = solid(taught(course(8, exam=20), on(-1)), on(2))
    second = course(6, exam=12)
    third = taught(course(5), on(-2))
    records = {"a": first, "b": second, "c": third}
    capacity_ = week(2.5, 1.5)
    once = plan(records, 28, capacity_)
    again = plan(dict(reversed(list(records.items()))), 28, capacity_)
    assert once.days == again.days
    assert once.held == again.held and once.why == again.why


def test_a_save_that_changes_no_topic_moves_no_courses_days() -> None:
    first = taught(course(8, exam=20), on(-1))
    other = taught(course(6), on(-2))
    capacity_ = week(2.5, 1.5)
    before = plan({"a": first, "b": other}, 28, capacity_)
    noted = save(
        first,
        {
            "knowledge": {"notation": {"text": "Vectors are columns."}},
            "tasks": {"sheet": {"title": "Sheet 1", "step": "part (b)"}},
            "path": {"current": "t03"},
        },
        MONDAY,
    )
    after = plan({"a": noted, "b": other}, 28, capacity_)
    assert after.days == before.days


def test_a_first_review_comes_on_its_day_ahead_of_older_reviews_and_another_courses_final_review() -> (
    None
):
    near = solid(course(12, exam=5), MONDAY)
    backlog = solid(course(6), on(-5))
    fresh = save(course(3), {"topics": {"t00": {"introduced": True}}}, MONDAY)
    records = {"near": near, "backlog": backlog, "fresh": fresh}
    together = agenda.plan(records, MONDAY, 10, week(2, 0, EVERY_DAY))
    assert together.when("fresh", MONDAY, True).reviews["t00"] == on(1)
    assert "t00" not in together.held.get("fresh", {})
    assert together.days["near"][1]["reviews"], "its final review keeps the rest"


def test_among_first_reviews_what_he_learned_last_comes_first() -> None:
    stale = taught(course(4), on(-1))
    fresh = save(course(3), {"topics": {"t00": {"introduced": True}}}, MONDAY)
    together = agenda.plan(
        {"stale": stale, "fresh": fresh}, MONDAY, 10, week(1, 0, EVERY_DAY)
    )
    assert together.when("fresh", MONDAY, True).reviews["t00"] == on(1)


def test_a_night_with_nothing_saved_moves_no_estimate() -> None:
    history = {
        on(-n): Done(reviews=1 + n % 4, new=n % 2, reviews_short=n % 5 == 0)
        for n in range(1, 40)
    }
    history[MONDAY] = Done(reviews=6, new=1)
    tonight = capacity.estimate(history, MONDAY)
    assert (
        tonight.on(MONDAY).reviews.value
        > capacity.estimate(
            {day: done for day, done in history.items() if day < MONDAY}, MONDAY
        )
        .on(MONDAY)
        .reviews.value
    )
    assert capacity.estimate(history, on(1)) == tonight
    del history[MONDAY]
    skipped, before = (
        capacity.estimate(history, on(1)),
        capacity.estimate(history, MONDAY),
    )
    for kind in ("reviews", "new"):
        assert [getattr(day, kind) for day in skipped.weekdays] == [
            getattr(day, kind) for day in before.weekdays
        ]


def studied(record: dict[str, Any], first: int, last: int) -> dict[str, Any]:
    """Each day from ``first`` to ``last``, the reviews due answered right, as
    many as its weekday's number, so he stops short on some days and the plan
    learns his limits from the record; on ``last``, what its plan proposes."""
    for offset in range(first, last + 1):
        day = on(offset)
        due = progress.due(record, day, limit=0)
        count = 1 + day.weekday() % 3
        topics = [item["topic"] for item in due[:count]]
        if offset == last:
            topics = plan_for(record, day)["reviews"]
        if topics:
            record = save(record, {"observations": [answer(t) for t in topics]}, day)
    return record


def test_a_plan_made_tomorrow_from_the_same_record_gives_the_same_dates() -> None:
    record = studied(taught(course(24), on(-36)), -35, 0)
    first = agenda.plan({"c": record}, MONDAY, 40)
    assert first.when("c", MONDAY, True).reviews
    tomorrow = agenda.plan({"c": record}, on(1), 39)
    today = first.when("c", MONDAY, True).reviews
    assert tomorrow.when("c", on(1), True).reviews == {
        topic: day for topic, day in today.items() if day > MONDAY
    }


def test_a_fractional_pace_starts_on_some_days_and_leaves_the_rest_to_a_course_without_an_exam() -> (
    None
):
    exam = course(27, exam=60)
    end = progress.new_end(progress.exam_plan(planned(exam)), MONDAY)
    left = (end - MONDAY).days + 1
    assert 0.4 < 27 / left < 0.6, left
    together = plan({"exam": exam, "open": course(30)}, 28, week(10, 1, EVERY_DAY))
    paced = [len(day["new"]) for day in together.days["exam"]]
    others = [len(day["new"]) for day in together.days["open"]]
    assert 0.8 * 27 / left * 28 <= sum(paced) <= 1.2 * 27 / left * 28 + 1, paced
    assert [a + b for a, b in zip(paced, others, strict=True)] == [1] * 28


def test_the_plan_made_on_two_consecutive_days_gives_the_same_dates() -> None:
    capacity_ = week(10, 1, EVERY_DAY)
    records = {"exam": course(27, exam=60), "open": course(30)}
    first = plan(records, 28, capacity_)
    for name, days in first.days.items():
        if days[0]["new"]:
            begun = {topic: {"introduced": True} for topic in days[0]["new"]}
            records[name] = save(records[name], {"topics": begun}, MONDAY)
    tomorrow = agenda.plan(records, on(1), 27, capacity_)
    for name, days in first.days.items():
        assert started(tomorrow.days[name]) == started(days[1:]), name


def test_an_exam_course_beside_one_without_an_exam_starts_every_topic_before_its_final_review() -> (
    None
):
    chain = {f"t{index:02d}": [f"t{index - 1:02d}"] for index in range(1, 27, 3)}
    exam = course(27, exam=60, needs=chain)
    together = plan({"exam": exam, "open": course(30)}, 60, week(10, 1, EVERY_DAY))
    last = progress.last_new_day(progress.exam_plan(planned(exam))).isoformat()
    assert together.does_not_fit == {}
    assert len(started(together.days["exam"])) == 27
    assert max(started(together.days["exam"]).values()) <= last


def test_a_pace_never_leaves_a_topic_to_days_with_no_room_for_it() -> None:
    rates = (1.0, 0.6, 0.7, 1.6, 0.9, 1.0, 1.2)
    uneven = Capacity(
        tuple(Weekday(1.0, Limit(10, True), Limit(rate, True)) for rate in rates),
        EVERY_DAY,
        20.0,
    )
    exam = course(1, exam=12)
    last = progress.last_new_day(progress.exam_plan(planned(exam)))
    assert last == on(2), "Wednesday holds no new topic after Monday and Tuesday"
    days = plan({"c": exam, "open": course(10)}, 12, uneven)
    assert started(days.days["c"]) and max(started(days.days["c"]).values()) <= (
        last.isoformat()
    )


def behind(days: int, least: int) -> dict[str, Any]:
    """A course with a backlog: each day of the ``days`` before Monday he
    answered ``least`` due reviews or one more, a weekday's number
    alternating from week to week, fewer than were due, so his limit is
    shown, each weekday's is fractional, and more is always owed."""
    record = taught(course(40), on(-days - 1))
    for offset in range(-days, 0):
        day = on(offset)
        due = progress.due(record, day, limit=0)
        count = least + (offset // 7 + day.weekday()) % 2
        topics = [item["topic"] for item in due[:count]]
        record = save(record, {"observations": [answer(t) for t in topics]}, day)
    return record


def dates(result: agenda.Plan, after: date) -> dict[str, date]:
    found = result.when("c", after, True)
    return {
        **{("review", key): day for key, day in found.reviews.items() if day > after},
        **{("start", key): day for key, day in found.starts.items() if day > after},
    }


def test_a_night_after_he_did_exactly_todays_plan_keeps_every_date() -> None:
    """Round 8 (1 D1): a day he finished the plan his limit proposed, with
    a backlog still owed, read as a day he stopped short once it ended, so
    his limit fell and 22 dates moved overnight with nothing saved."""
    record = behind(35, 1)
    assert capacity.of([record], MONDAY).on(MONDAY).reviews.shown
    for offset in range(7):
        today = on(offset)
        proposed = plan_for(record, today)
        assert proposed["reviews"], "his limit proposes some of the backlog"
        answers = [answer(topic) for topic in proposed["reviews"]]
        record = save(record, {"observations": answers}, today)
        tonight = agenda.plan({"c": record}, today, 40)
        tomorrow = agenda.plan({"c": record}, today + timedelta(days=1), 39)
        assert dates(tomorrow, today) == dates(tonight, today), today


def test_part_of_todays_plan_done_moves_no_estimate() -> None:
    """Round 8 (1 D4): one review answered reshuffled 14 to 22 untold
    dates, as today's work counted as a finished day and a new day of study
    moved earlier days to another week's weight. On a Monday, a new week."""
    record = behind(35, 2)
    proposed = plan_for(record, MONDAY)["reviews"]
    assert len(proposed) >= 2
    before = capacity.of([record], MONDAY)
    one = save(record, {"observations": [answer(proposed[0])]}, MONDAY)

    def limits(week: Capacity) -> list[tuple[Limit, Limit]]:
        return [(weekday.reviews, weekday.new) for weekday in week.weekdays]

    after = capacity.of([one], MONDAY)
    assert limits(after) == limits(before)
    assert after.study_weekdays == before.study_weekdays
    every = save(one, {"observations": [answer(t) for t in proposed[1:]]}, MONDAY)
    assert limits(capacity.of([every], MONDAY)) == limits(before)


def test_a_topic_he_must_relearn_is_checked_within_days_like_a_first_review() -> None:
    """Round 8 (2 M4): a topic missed with confidence on its last two days
    waited 16 days behind first reviews, another course's final review and
    weeks-late reviews, though he had just shown he does not know it."""
    exam = course(3, exam=40)
    exam = save(exam, {"topics": {"t00": {"introduced": True}}}, on(-10))
    for offset in (-2, -1):
        exam = save(exam, {"observations": [answer("t00", "incorrect")]}, on(offset))
    assert progress.standings(exam)["t00"].get("relearn")
    backlog = solid(course(6), on(-5))
    near = solid(course(6, exam=6), on(-1))
    together = agenda.plan(
        {"exam": exam, "backlog": backlog, "near": near},
        MONDAY,
        14,
        week(1, 0, EVERY_DAY),
    )
    assert together.when("exam", MONDAY, True).reviews["t00"] == MONDAY


def test_an_exam_day_holds_nothing_of_any_course() -> None:
    """Round 8 (1 D7): the Probability exam's day took four Linear Algebra
    items, reviews its final review had held and new topics besides."""
    near = solid(course(6, exam=6), on(-1))
    other = solid(course(8), on(-1))
    fresh = course(6, exam=30)
    together = agenda.plan(
        {"near": near, "other": other, "fresh": fresh},
        MONDAY,
        10,
        week(2, 1, EVERY_DAY),
    )
    exam_day = on(6).isoformat()
    for name, days in together.days.items():
        held = [day for day in days if day["date"] == exam_day]
        assert held == [{"date": exam_day, "reviews": [], "new": []}], name


def test_a_first_review_weeks_late_does_not_take_another_courses_final_review() -> None:
    """Round 8 (1 §11): a first review two weeks late took the only place
    the day before the Probability exam, and its two-day final review
    reviewed one topic."""
    near = solid(course(4, exam=2), on(-1))
    stale = save(course(2), {"topics": {"t00": {"introduced": True}}}, on(-14))
    together = agenda.plan(
        {"near": near, "stale": stale}, MONDAY, 4, week(1, 0, EVERY_DAY)
    )
    assert [day["reviews"] for day in together.days["near"][:2]] == [["t00"], ["t01"]]
    assert together.when("stale", MONDAY, True).reviews["t00"] == on(3), (
        "after the exam's day, which holds nothing"
    )


def test_a_topic_that_does_not_fit_before_its_exam_names_the_exam_not_other_courses() -> (
    None
):
    """Round 8 (1 §11): Expectation, left out of the days before its exam,
    read "after Linear Algebra's and Real Analysis's new topics", a course
    with no exam among them. An exam that leaves a topic out plans the
    rest of the course after it."""
    exam = course(12, exam=6)
    exam = save(exam, {"exam": {"leaves_out": ["t11"]}}, MONDAY)
    other = course(20)
    together = agenda.plan({"exam": exam, "other": other}, MONDAY, 30, week(4, 1))
    late = together.does_not_fit["exam"]
    assert set(late) & set(started(together.days["exam"])), "started after it"
    assert not set(late) & set(together.starts_after.get("exam", {}))


def test_one_answer_today_moves_no_other_topics_day_in_any_course() -> None:
    """Round 9 (1 D4): one review answer moved about twelve days he had been
    told, in its own course and another, within the day."""
    records = {
        "algebra": studied(taught(course(24), on(-36)), -35, -1),
        "chance": studied(taught(course(16, exam=40), on(-30)), -29, -1),
    }
    before = agenda.plan(records, MONDAY, 60)
    told = {name: before.when(name, MONDAY, True) for name in records}
    for name, result in (("algebra", "partial"), ("chance", "correct")):
        topic = before.days[name][2]["reviews"][0]
        records[name] = save(
            records[name], {"observations": [answer(topic, result)]}, MONDAY
        )
        after = agenda.plan(records, MONDAY, 60)
        for other in records:
            now = after.when(other, MONDAY, True)
            kept = {k: v for k, v in now.reviews.items() if k != topic or other != name}
            assert kept == {
                k: v
                for k, v in told[other].reviews.items()
                if k != topic or other != name
            }, (name, other)
            assert now.starts == told[other].starts, (name, other)


def test_inside_a_final_review_its_topics_left_take_a_spare_start_before_a_course_without_an_exam() -> (
    None
):
    """Round 9 (1 D2): two days before the Probability exam, Real Analysis
    started Continuity while the head said there was no room for Geometric."""
    exam = course(2, exam=5)
    together = plan({"exam": exam, "open": course(10)}, 5, week(10, 1, EVERY_DAY))
    assert started(together.days["exam"]) == {
        "t00": on(0).isoformat(),
        "t01": on(1).isoformat(),
    }
    assert started(together.days["open"]) == {
        "t00": on(2).isoformat(),
        "t01": on(3).isoformat(),
        "t02": on(4).isoformat(),
    }


def saved_at(
    record: dict[str, Any], patch: dict[str, Any], day: date, clock: str
) -> dict[str, Any]:
    """``save`` at ``clock`` (HH:MM) on ``day``: the order of a day's saves."""
    now = f"{day.isoformat()}T{clock}:00+00:00"
    patched, outcome = schema.apply_patch(record, patch, today=day, now=now)
    scheduled, _ = progress.schedule(planned(patched), outcome, day)
    return schema.validate_record(scheduled)


def due_tomorrow() -> dict[str, Any]:
    """One topic answered right on two days, the engine's next step for it
    tomorrow."""
    record = save(course(1), {"topics": {"t00": {"introduced": True}}}, on(-3))
    record = save(record, {"observations": [answer("t00")]}, on(-3))
    record = save(record, {"observations": [answer("t00")]}, on(-2))
    assert record["topics"]["t00"]["review"]["due"] == on(1).isoformat()
    return record


def reviewed_on(result: agenda.Plan, name: str, topic: str) -> list[str]:
    return [day["date"] for day in result.days[name] if topic in day["reviews"]]


def test_a_save_that_leaves_a_topic_not_ready_takes_its_review_with_its_start() -> None:
    """Round 10 (1 M1): the Binomial answer left Poisson not ready, so its
    start moved from 11 to 18 Nov, while its first review stayed on 12 Nov,
    before its first lesson."""
    record = course(2, needs={"t01": ["t00"]})
    record = save(record, {"topics": {"t00": {"introduced": True}}}, on(-10))
    record = save(record, {"observations": [answer("t00")]}, on(-9))
    record = save(
        record, {"topics": {"t00": {"review": {"due": on(4).isoformat()}}}}, MONDAY
    )
    capacity_ = week(2, 1, EVERY_DAY)
    morning = plan({"c": record}, 10, capacity_)
    assert started(morning.days["c"])["t01"] == MONDAY.isoformat()
    assert reviewed_on(morning, "c", "t01")[0] == on(1).isoformat()
    slipped = saved_at(
        record, {"observations": [answer("t00", "incorrect")]}, MONDAY, "10:00"
    )
    after = plan({"c": slipped}, 10, capacity_)
    start = started(after.days["c"]).get("t01")
    reviews = reviewed_on(after, "c", "t01")
    assert start is None and not reviews or start is not None and min(reviews) > start


def test_a_day_told_at_a_save_holds_through_a_later_save_in_another_course() -> None:
    """Round 10 (1 M1, 3 M1): a save told Eigen Thu 12 Nov; the Binomial
    review's save an hour later, in Probability, moved it to Fri 20 Nov. A
    told day moves only for a save on its own topic."""
    other = due_tomorrow()
    fresh = course(1)
    capacity_ = week(1, 0, EVERY_DAY)
    first = saved_at(
        fresh,
        {"topics": {"t00": {"introduced": True}}, "observations": [answer("t00")]},
        MONDAY,
        "10:00",
    )
    told = plan({"fresh": first, "other": other}, 10, capacity_)
    assert reviewed_on(told, "fresh", "t00")[0] == on(1).isoformat()
    early = saved_at(other, {"observations": [answer("t00")]}, MONDAY, "11:00")
    later = plan({"fresh": first, "other": early}, 10, capacity_)
    assert reviewed_on(later, "fresh", "t00")[0] == on(1).isoformat()


def test_a_night_after_a_finished_day_keeps_every_day_he_was_told() -> None:
    """Round 10 (1 M2): a finished day with unchanged rates moved 19 dates
    overnight, as the next morning planned afresh and dropped what the
    day's saves had held. The night moves nothing but what its day left."""
    other = due_tomorrow()
    first = saved_at(
        course(1),
        {"topics": {"t00": {"introduced": True}}, "observations": [answer("t00")]},
        MONDAY,
        "10:00",
    )
    records = {"fresh": first, "other": other}
    capacity_ = week(1, 0, EVERY_DAY)
    tonight = agenda.plan(records, MONDAY, 10, capacity_)
    assert tonight.days["fresh"][0] == {
        "date": MONDAY.isoformat(),
        "reviews": [],
        "new": [],
    }
    assert tonight.days["other"][0]["reviews"] == []
    tomorrow = agenda.plan(records, on(1), 9, capacity_)
    assert tomorrow.days == {name: days[1:] for name, days in tonight.days.items()}


def test_inside_a_final_review_the_review_its_next_topic_waits_on_comes_first() -> None:
    """Round 10 (1 M4): two days before the Probability exam, its final
    review checked Total probability first, so Expectation, waiting on
    Random variables, started the day before the exam, too late for a
    review, and Linear Algebra took the day's new topic."""
    exam = course(3, exam=3, needs={"t02": ["t00"]})
    exam = save(
        exam,
        {"topics": {"t00": {"introduced": True}, "t01": {"introduced": True}}},
        on(-12),
    )
    exam = save(exam, {"observations": [answer("t01", "partial")]}, on(-6))
    exam = save(exam, {"observations": [answer("t00", "partial")]}, on(-2))
    together = agenda.afresh({"exam": planned(exam)}, MONDAY, 6, week(1, 1, EVERY_DAY))
    assert together.days["exam"][0]["reviews"] == ["t00"]
    assert started(together.days["exam"]) == {"t02": MONDAY.isoformat()}
    assert reviewed_on(together, "exam", "t02")[0] < on(3).isoformat()
