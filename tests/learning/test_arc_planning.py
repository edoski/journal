"""The daily plan in a course with arcs: the next exam's scope, and the order
and reasons of new topics."""

from datetime import date, timedelta
from pathlib import Path
import re
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
TOPICS: dict[str, dict[str, Any]] = {
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
    """The plan its rules make from these records (``agenda.afresh``): the
    days a replay holds are ``test_agenda``'s."""
    return agenda.afresh(read(records, day), day, days, rates)


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


LEFT: dict[str, dict[str, Any]] = {
    "a1": {"arc": "a"},
    "a2": {"arc": "a", "needs": ["a1"]},
    "b1": {"arc": "b", "needs": ["a2"]},
    "b2": {"arc": "b", "needs": ["b1"]},
    "c1": {"arc": "c", "needs": ["a1"]},
    "c2": {"arc": "c", "needs": ["c1"]},
}


def test_after_an_exam_over_named_arcs_what_it_left_untaught_still_starts() -> None:
    record = spread(LEFT, "c1", exam=scoped(["a"], 2))
    result = plan({"c": record}, on(5), 40, week(10, 1))
    started = starts(result)
    assert {"a2", "b1", "b2", "c2"} <= set(started), "nothing waits on it forever"
    assert started.index("a2") < started.index("b1") < started.index("b2")


def test_after_an_exam_over_named_arcs_what_he_started_stands_on_comes_first() -> None:
    topics = {
        "a1": {"arc": "a"},
        "a2": {"arc": "a", "needs": ["a1"]},
        "b1": {"arc": "b", "needs": ["a1"]},
        "c1": {"arc": "c", "needs": ["a1"]},
        "c2": {"arc": "c", "needs": ["c1"]},
    }
    record = spread(topics, "c2", exam=scoped(["a"], 2))
    result = plan({"c": record}, on(5), 3, week(10, 1))
    assert result.days["c"][0]["new"] == ["c1"], "c2 stands on it"


def test_the_final_review_is_as_long_as_the_topics_the_exam_examines() -> None:
    reviews = week(2, 1)
    small = course(scoped(["a"], 40))
    whole = course(whole_course(40))
    short = capacity.final_review_days(small, [], reviews, MONDAY)
    long = capacity.final_review_days(whole, [], reviews, MONDAY)
    assert short is not None and long is not None and short < long


# --- a course that takes no questions ----------------------------------------

BRANCHES: dict[str, dict[str, Any]] = {
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


def test_a_course_switched_to_no_questions_shows_no_review_anywhere() -> None:
    record = taught(course(), ["a1", "b1"], on(-10))
    dates = {key: record["topics"][key]["review"]["due"] for key in ("a1", "b1")}
    silent = save(record, {"preferences": {"questions": "none"}}, on(-1))
    assert all("review" not in topic for topic in silent["topics"].values())
    assert progress.due(silent, MONDAY) == []
    when = plan({"c": silent}, MONDAY, 5, week(10, 1)).when("c", MONDAY, False)
    stored = silent["topics"]["a1"].get("review", {}).get("due")
    assert when.review("a1", stored) is None
    asked = save(silent, {"preferences": {"questions": "asked"}}, MONDAY)
    back = {key: asked["topics"][key]["review"]["due"] for key in ("a1", "b1")}
    assert back == dates, "asking again brings back the dates memory asks for"


# --- the window: the order new topics come in, and why -----------------------


def answer(topic: str) -> dict[str, Any]:
    return {"topics": [topic], "text": "q", "help": "none", "result": "correct"}


def evidence(record: dict[str, Any], solid: list[str], learning: str) -> dict[str, Any]:
    """``solid`` taught and answered right on a later day; ``learning`` taught
    yesterday, its first review pinned to day 3."""
    taught_ = {key: {"introduced": True} for key in solid}
    record = save(record, {"topics": taught_}, on(-10))
    record = save(record, {"observations": [answer(k) for k in solid]}, on(-9))
    far = {key: {"review": {"due": on(60).isoformat()}} for key in solid}
    record = save(record, {"topics": far}, on(-9))
    late = {"introduced": True, "review": {"due": on(3).isoformat()}}
    return save(
        record, {"topics": {learning: late}, "path": {"current": learning}}, on(-1)
    )


WINDOW: dict[str, dict[str, Any]] = {
    "a1": {"arc": "a"},
    "a2": {"arc": "a", "needs": ["a1"], "contrasts": ["a3"]},
    "a3": {"arc": "a"},
    "b1": {"arc": "b", "needs": ["a1"]},
    "c1": {"arc": "c", "needs": ["a1"]},
    "d1": {"arc": "d"},
}


def windowed() -> dict[str, Any]:
    patch: dict[str, Any] = {
        "arcs": {name: arc(name.upper()) for name in "abcd"},
        "topics": WINDOW,
        "path": {"order": list(WINDOW), "arcs": list("abcd")},
        "arc_change": REASON,
    }
    return evidence(save(schema.empty(), patch, MONDAY), ["a1"], "a3")


def test_new_topics_come_from_the_earliest_arc_left_and_the_next() -> None:
    result = plan({"c": windowed()}, MONDAY, 6, week(10, 1))
    days = {day["date"]: day["new"] for day in result.days["c"]}
    assert days[on(0).isoformat()] == ["b1"], "the next arc while A waits"
    assert days[on(1).isoformat()] == [], "C and D are two arcs on or more: they wait"
    assert days[on(3).isoformat()] == ["a2"]
    assert days[on(4).isoformat()] == ["c1"], "A is done, so C is the next arc"
    assert days[on(5).isoformat()] == ["d1"], "D needs nothing, yet keeps its place"
    why = result.when("c", MONDAY, True).why
    early = {"kind": "early", "behind": "a", "waiting_on": ["a3"]}
    assert why["b1"] == {"arc": "b", **early}
    assert why["a2"] == {"arc": "a", "kind": "after", "partners": ["a3"]}
    assert why["c1"] == {"arc": "c", "kind": "next"}
    assert why["d1"] == {"arc": "d", "kind": "next"}


def test_an_early_start_does_not_open_the_arc_after_it() -> None:
    record = save(windowed(), {"path": {"current": "b1"}}, MONDAY)
    result = plan({"c": record}, MONDAY, 3, week(10, 1))
    assert "c1" not in starts(result), "A, with topics left, still bounds the window"
    assert arcs.current(record) == "b", "You are here: the arc he studies ahead in"
    assert result.when("c", MONDAY, True).why["b1"]["behind"] == "a"


def test_each_independent_branch_moves_while_the_others_wait() -> None:
    topics = {
        "g1": {"arc": "g"},
        "g2": {"arc": "g", "needs": ["g1"]},
        "e1": {"arc": "e"},
        "e2": {"arc": "e", "needs": ["e1"]},
        "k1": {"arc": "k"},
    }
    patch: dict[str, Any] = {
        "arcs": {name: arc(name.upper()) for name in "gek"},
        "topics": topics,
        "path": {"order": list(topics), "arcs": list("gek")},
        "arc_change": REASON,
    }
    record = save(schema.empty(), patch, MONDAY)
    pinned = {"introduced": True, "review": {"due": on(3).isoformat()}}
    record = save(record, {"topics": {"g1": pinned, "e1": pinned}}, on(-1))
    result = plan({"c": record}, MONDAY, 1, week(10, 1))
    assert result.days["c"][0]["new"] == ["k1"]
    assert result.when("c", MONDAY, True).why["k1"]["kind"] == "early"


def test_without_arcs_a_topic_that_builds_on_nothing_waits_its_place() -> None:
    topics = {
        "x0": {},
        "x1": {},
        "x2": {"needs": ["x1"]},
        "x3": {},
        "x4": {"needs": ["x0"]},
    }
    record = save(
        schema.empty(), {"topics": topics, "path": {"order": list(topics)}}, MONDAY
    )
    record = evidence(record, ["x0"], "x1")
    result = plan({"c": record}, MONDAY, 6, week(10, 1))
    days = {day["date"]: day["new"] for day in result.days["c"]}
    assert days[on(0).isoformat()] == ["x4"], "it builds on what he has started"
    assert days[on(3).isoformat()] == ["x2"]
    assert days[on(4).isoformat()] == ["x3"], "it opens a new line: in its place"
    why = result.when("c", MONDAY, True).why
    assert why["x4"] == {"kind": "early", "waiting_on": ["x1"]}
    assert why["x2"] == {"kind": "after", "needs": ["x1"]}
    assert why["x3"] == {"kind": "next"}


def test_an_exams_pace_passes_the_window_only_when_holding_would_raise_it() -> None:
    topics = {**WINDOW, "c2": {"arc": "c", "needs": ["a1"]}}
    patch: dict[str, Any] = {
        "arcs": {name: arc(name.upper()) for name in "abcd"},
        "topics": topics,
        "path": {"order": list(topics), "arcs": list("abcd")},
        "arc_change": REASON,
    }
    record = evidence(save(schema.empty(), patch, MONDAY), ["a1"], "a3")
    near = save(record, {"exam": scoped(["a", "b", "c"], 5)}, MONDAY)
    first = plan({"c": near}, MONDAY, 2, week(10, 3))
    assert first.days["c"][1]["new"] == ["c1"], "three topics in three days"
    assert first.when("c", MONDAY, True).why["c1"] == {
        "arc": "c",
        "kind": "early",
        "behind": "a",
        "waiting_on": ["a3"],
        "exam": True,
    }
    far = save(record, {"exam": scoped(["a", "b", "c"], 40)}, MONDAY)
    calm = plan({"c": far}, MONDAY, 3, week(10, 3))
    assert "c1" not in starts(calm), "weeks to go: the pace holds for the material"


def test_an_exams_pace_passes_the_window_when_his_room_cannot_make_up_a_day() -> None:
    topics = {
        "a1": {"arc": "a"},
        "a2": {"arc": "a", "needs": ["a1"], "contrasts": ["a3"]},
        "a3": {"arc": "a"},
        "b1": {"arc": "b", "needs": ["a3"]},
        "c1": {"arc": "c", "needs": ["a1"]},
    }
    patch: dict[str, Any] = {
        "arcs": {name: arc(name.upper()) for name in "abc"},
        "topics": topics,
        "path": {"order": list(topics), "arcs": list("abc")},
        "arc_change": REASON,
        "exam": scoped(list("abc"), 14),
    }
    record = evidence(save(schema.empty(), patch, MONDAY), ["a1"], "a3")
    one = plan({"c": record}, MONDAY, 14, week(10, 1))
    assert starts(one) == ["a2", "b1", "c1"], "a topic a day makes up any day"
    half = plan({"c": record}, MONDAY, 14, week(10, 0.5))
    assert half.days["c"][0]["new"] == ["c1"], "half a topic a day cannot"
    assert half.when("c", MONDAY, True).why["c1"]["exam"] is True


def test_reviews_ignore_arcs() -> None:
    every = {key: {"introduced": True} for key in TOPICS}
    with_arcs = save(course(), {"topics": every}, on(-10))
    plain = {
        key: {k: v for k, v in t.items() if k != "arc"} for key, t in TOPICS.items()
    }
    without = save(schema.empty(), {"topics": plain, "path": {"order": ORDER}}, MONDAY)
    without = save(without, {"topics": every}, on(-10))
    rates = week(100, 0)
    one = plan({"c": with_arcs}, MONDAY, 30, rates).days["c"]
    other = plan({"c": without}, MONDAY, 30, rates).days["c"]
    assert [set(day["reviews"]) for day in one] == [
        set(day["reviews"]) for day in other
    ]


SPREAD: dict[str, dict[str, Any]] = {
    "a1": {"arc": "a"},
    "a2": {"arc": "a", "needs": ["a1"], "contrasts": ["a3"]},
    "a3": {"arc": "a"},
    "b1": {"arc": "b", "needs": ["a1"]},
    "c1": {"arc": "c", "needs": ["a1"]},
    "d1": {"arc": "d", "needs": ["a1"]},
}


def spread(topics: dict[str, Any], learning: str, **exam: Any) -> dict[str, Any]:
    names = sorted({topic["arc"] for topic in topics.values()})
    patch: dict[str, Any] = {
        "arcs": {name: arc(name.upper()) for name in names},
        "topics": topics,
        "path": {"order": list(topics), "arcs": names},
        "arc_change": REASON,
        **exam,
    }
    return evidence(save(schema.empty(), patch, MONDAY), ["a1"], learning)


def test_topics_outside_the_exam_read_the_window_from_where_he_is() -> None:
    def planned(record: dict[str, Any]) -> tuple[list[list[str]], dict[str, Any]]:
        result = plan({"c": record}, MONDAY, 6, week(10, 1))
        why = dict(result.when("c", MONDAY, True).why)
        return [day["new"] for day in result.days["c"]], why

    scoped_ = planned(spread(SPREAD, "a3", exam=scoped(["a"], 40)))
    assert scoped_ == planned(spread(SPREAD, "a3")), "as in a course with no exam"
    days, why = scoped_
    assert days[0] == ["b1"] and why["b1"]["kind"] == "early"
    started = [topic for day in days for topic in day]
    assert started.index("a2") < started.index("c1"), "C waits while A has topics"


# A graph algorithms course cut by its syllabus weeks: DFS is a chain, and the
# last week, minimum spanning trees, needs nothing from the weeks before it.
WEEKS: dict[str, dict[str, Any]] = {
    "rep": {"arc": "w1"},
    "bfs": {"arc": "w1", "needs": ["rep"]},
    "dfs": {"arc": "w2", "needs": ["rep"]},
    "parenthesis": {"arc": "w2", "needs": ["dfs"]},
    "white-path": {"arc": "w2", "needs": ["parenthesis"]},
    "cycles": {"arc": "w2", "needs": ["white-path"]},
    "kahn": {"arc": "w3", "needs": ["rep"]},
    "topo": {"arc": "w3", "needs": ["cycles"]},
    "dijkstra": {"arc": "w4", "needs": ["rep"]},
    "bellman-ford": {"arc": "w4", "needs": ["rep"]},
    "cut": {"arc": "w5"},
    "union-find": {"arc": "w5"},
    "kruskal": {"arc": "w5", "needs": ["cut", "union-find"]},
}


def test_a_new_course_studies_its_weeks_in_order_before_the_exam() -> None:
    names = ["w1", "w2", "w3", "w4", "w5"]
    patch: dict[str, Any] = {
        "arcs": {name: arc(name.upper()) for name in names},
        "topics": WEEKS,
        "path": {"order": list(WEEKS), "arcs": names},
        "arc_change": REASON,
        "exam": scoped(names, 40),
    }
    record = evidence(save(schema.empty(), patch, MONDAY), ["rep", "bfs"], "dfs")
    result = plan({"c": record}, MONDAY, 40, week(10, 1))
    started = starts(result)
    assert set(started) == set(WEEKS) - {"rep", "bfs", "dfs"}, "everything starts"
    week_of = {key: names.index(WEEKS[key]["arc"]) for key in started}
    for index, key in enumerate(started):
        front = min(week_of[later] for later in started[index:])
        assert week_of[key] - front < progress.NEW_TOPIC_ARCS, (key, started)
    exam = progress.exam_plan(read({"c": record}, MONDAY)["c"])
    assert exam is not None
    last = max(day["date"] for day in result.days["c"] if day["new"])
    assert last <= progress.last_new_day(exam).isoformat(), "ready for the exam"


def test_a_second_topic_on_one_day_stays_in_the_first_ones_arc() -> None:
    topics = {
        "a1": {"arc": "a"},
        "a2": {"arc": "a", "needs": ["a1"]},
        "b1": {"arc": "b", "needs": ["a1"]},
        "b2": {"arc": "b"},
        "c1": {"arc": "c", "needs": ["a1"]},
    }
    record = spread(topics, "a2")
    result = plan({"c": record}, MONDAY, 1, week(10, 2))
    assert result.days["c"][0]["new"] == ["b1", "b2"], "C1 shares B1's needs only"
    lighter = plan({"c": record}, MONDAY, 1, week(10, 1.5))
    assert lighter.days["c"][0]["new"] == ["b1"], "B2 is not related, C1 waits"


def test_a_second_topic_on_one_day_keeps_the_window() -> None:
    topics = {
        "a1": {"arc": "a"},
        "z": {"arc": "a"},
        "a2": {"arc": "a", "needs": ["a1"]},
        "a3": {"arc": "a", "needs": ["z"]},
        "b1": {"arc": "b", "needs": ["a3"]},
        "c1": {"arc": "c", "needs": ["a1"]},
    }
    result = plan({"c": spread(topics, "z")}, MONDAY, 6, week(10, 1.5))
    started = starts(result)
    assert result.days["c"][0]["new"] == ["a2"], "C is two arcs on: it waits"
    assert started.index("a3") < started.index("c1")


def test_a_topic_he_started_stands_on_reads_its_reason_from_where_he_is() -> None:
    topics = {
        "a1": {"arc": "a"},
        "a2": {"arc": "a", "needs": ["a1"]},
        "b1": {"arc": "b", "needs": ["a1"]},
        "c1": {"arc": "c", "needs": ["a1"]},
        "c2": {"arc": "c", "needs": ["c1"]},
    }
    result = plan({"c": spread(topics, "c2")}, MONDAY, 3, week(10, 1))
    assert result.days["c"][0]["new"] == ["c1"], "c2 stands on it"
    why = result.when("c", MONDAY, True).why["c1"]
    assert why["kind"] == "early" and why["behind"] == "a", "A still has a2"


def test_the_doctrine_names_every_field_of_a_starts_reason() -> None:
    doctrine = (
        Path(__file__).parents[2] / "learning/skills/tutor/references/arcs.md"
    ).read_text()
    lines = doctrine.splitlines()
    bullet = next(line for line in lines if "Why a topic comes now" in line)
    named = set(re.findall(r"`([a-z_]+)`", bullet))
    assert set(agenda.Why.__annotations__) - {"kind"} <= named
    assert {"next", "after", "early", "starts_why"} <= named
