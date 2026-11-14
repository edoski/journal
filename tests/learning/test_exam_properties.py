"""Properties of exam-aware scheduling over random course histories."""

from dataclasses import dataclass
import math
from datetime import date, timedelta
from typing import Any

from hypothesis import example, given, settings
from hypothesis import strategies as st

from learning import agenda, capacity, progress, schema
from learning.capacity import Capacity, Limit, Weekday

# The final review these tests were written for; a save derives it from his
# pace (capacity.final_review_days), which other tests cover.
LEAD = 6


def planned(record: dict[str, Any]) -> dict[str, Any]:
    """The record read with the final review these tests were written for."""
    when = record.get("exam", {}).get("date")
    start = date.fromisoformat(when) - timedelta(days=LEAD) if when else None
    return progress.with_final_review(record, start)


START = date(2026, 1, 5)
ACTIONS = ("introduce", "correct", "incorrect", "partial", "hint", "pin")
TOPICS = ("a", "b", "c", "d", "e")


def on(offset: int) -> date:
    return START + timedelta(days=offset)


def save(record: dict[str, Any], patch: dict[str, Any], day: date) -> dict[str, Any]:
    now = f"{day.isoformat()}T09:00:00+00:00"
    patched, outcome = schema.apply_patch(record, patch, today=day, now=now)
    scheduled, _ = progress.schedule(planned(patched), outcome, day)
    return schema.validate_record(scheduled)


def answer(topic: str, action: str) -> dict[str, Any]:
    result = {"correct": "correct", "hint": "correct", "partial": "partial"}
    return {
        "topics": [topic],
        "text": f"{action} on {topic}",
        "help": "Hint" if action == "hint" else "none",
        "result": result.get(action, "incorrect"),
    }


@dataclass(frozen=True)
class Step:
    gap: int
    topic: str
    action: str


steps = st.lists(
    st.builds(
        Step,
        st.integers(0, 6),
        st.sampled_from(TOPICS),
        st.sampled_from(ACTIONS),
    ),
    max_size=25,
)


def history(
    events: list[Step],
    *,
    pins: bool = True,
    exam: tuple[int, int] | None = None,
    preferences: dict[str, str] | None = None,
) -> tuple[dict[str, Any], date]:
    """A course built by saves, one per step. ``exam`` is (set before step,
    days after that step's day); a step past the end sets it after the last."""
    first: dict[str, Any] = {
        "topics": {key: {} for key in TOPICS},
        "path": {"order": list(TOPICS)},
    }
    if preferences:
        first["preferences"] = preferences
    record = save(schema.empty(), first, START)
    day = START
    for index, step in enumerate(events):
        day += timedelta(days=step.gap)
        if exam is not None and index == exam[0]:
            record = _set_exam(record, day, exam[1])
        if step.action == "introduce":
            patch: dict[str, Any] = {"topics": {step.topic: {"introduced": True}}}
        elif step.action == "pin":
            if not pins:
                continue
            due = (day + timedelta(days=step.gap * 7)).isoformat()
            patch = {"topics": {step.topic: {"review": {"due": due}}}}
        else:
            patch = {"observations": [answer(step.topic, step.action)]}
        record = save(record, patch, day)
    if exam is not None and exam[0] >= len(events):
        record = _set_exam(record, day, exam[1])
    return record, day


def _set_exam(record: dict[str, Any], day: date, after: int) -> dict[str, Any]:
    when = (day + timedelta(days=after)).isoformat()
    return save(record, {"exam": {"date": when}}, day)


def dates(record: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {key: topic.get("review", {}) for key, topic in record["topics"].items()}


@settings(max_examples=200, deadline=None)
@given(steps, st.integers(0, 25), st.integers(1, 90), st.integers(1, 14))
def test_no_review_is_ever_on_the_exam_day_and_reviews_go_on_after_it(
    events: list[Step], set_on: int, after: int, lead: int
) -> None:
    record, today = history(
        events,
        exam=(set_on, after),
        preferences={"final_review_days": str(lead)},
    )
    exam = progress.exam_plan(record)
    if exam is None or exam.day <= today:
        return
    engine = [
        review["due"]
        for review in dates(record).values()
        if review.get("by") == "engine" and "due" in review
    ]
    assert exam.day.isoformat() not in engine
    horizon = (exam.day - today).days + 1
    days = agenda.plan({"c": record}, today, horizon, every_day(5, 2)).days["c"]
    assert not days[-1]["reviews"] and not days[-1]["new"]


def every_day(reviews: float, new: float) -> Capacity:
    """He studies every day and has shown these limits."""
    rates = Weekday(1.0, Limit(reviews, shown=True), Limit(new, shown=True))
    return Capacity(tuple(rates for _ in range(7)), frozenset(range(7)), 0.0)


weeks = st.builds(
    lambda rates, study: Capacity(
        tuple(
            Weekday(
                1.0 if day in study else 0.0,
                Limit(r, shown=True),
                Limit(n, shown=True),
            )
            for day, (r, n) in enumerate(rates)
        ),
        frozenset(study),
        10.0,
    ),
    st.lists(st.tuples(st.floats(0, 12), st.floats(0, 3)), min_size=7, max_size=7),
    st.sets(st.integers(0, 6), min_size=1),
)


def _study_week(rates: list[tuple[float, float]], study: set[int]) -> Capacity:
    return Capacity(
        tuple(
            Weekday(
                1.0 if day in study else 0.0, Limit(r, shown=True), Limit(n, shown=True)
            )
            for day, (r, n) in enumerate(rates)
        ),
        frozenset(study),
        10.0,
    )


@settings(max_examples=150, deadline=None)
@given(steps, steps, weeks, st.one_of(st.none(), st.integers(-5, 60)))
@example(
    first=[],
    second=[],
    week=_study_week(
        [(0, 0), (0, 0.1), (0, 0), (0, 0), (0, 1.0), (0, 0), (0, 0)], {1, 4}
    ),
    exam_day=None,
)
def test_the_plan_never_exceeds_his_capacity_or_touches_a_day_off(
    first: list[Step], second: list[Step], week: Capacity, exam_day: int | None
) -> None:
    exam = None if exam_day is None else (len(first) // 2, exam_day)
    one, today = history(first, exam=exam)
    two, _ = history(second)
    together = agenda.plan({"one": one, "two": two}, today, 45, week)
    for offset in range(45):
        day = today + timedelta(days=offset)
        planned = [days[offset] for days in together.days.values()]
        rate = week.on(day)
        reviews = sum(len(entry["reviews"]) for entry in planned)
        new = sum(len(entry["new"]) for entry in planned)
        assert reviews <= math.ceil(rate.reviews.value)
        assert new <= math.ceil(rate.new.value)
        if not week.studies(day):
            assert reviews == new == 0
        for entry in planned:
            assert not set(entry["reviews"]) & set(entry["new"])


@settings(max_examples=100, deadline=None)
@given(
    st.sets(st.integers(0, 6), min_size=1),
    st.integers(0, 15),
    st.integers(0, 3),
    st.integers(5, 12),
)
def test_the_estimate_converges_to_a_steady_learner(
    study: set[int], reviews: int, new: int, weeks_seen: int
) -> None:
    today = START + timedelta(weeks=weeks_seen)
    days = {
        day: capacity.Done(reviews, new)
        for day in (START + timedelta(days=n) for n in range(weeks_seen * 7))
        if day.weekday() in study
    }
    learned = capacity.estimate(days, today)
    assert learned.study_weekdays == frozenset(study)
    for day in study:
        rates = learned.weekdays[day]
        assert not rates.reviews.shown and not rates.new.shown
        assert math.isclose(rates.reviews.value, reviews)
        assert math.isclose(rates.new.value, max(new, capacity.PRIOR_NEW))


@settings(max_examples=150, deadline=None)
@given(
    steps,
    st.one_of(st.none(), st.integers(-5, 90)),
    st.integers(-5, 90),
    st.integers(-5, 90),
)
def test_moving_the_exam_twice_converges_to_moving_it_once(
    events: list[Step], start: int | None, middle: int, end: int
) -> None:
    exam = None if start is None else (len(events) // 2, start)
    record, today = history(events, pins=False, exam=exam)

    def moved(base: dict[str, Any], to: int) -> dict[str, Any]:
        return _set_exam(base, today, to)

    once = moved(record, end)
    twice = moved(moved(record, middle), end)
    assert dates(twice) == dates(once)
    assert progress.replays(twice) == progress.replays(once)
    week = every_day(5, 2)
    assert agenda.plan({"c": twice}, today, 30, week) == agenda.plan(
        {"c": once}, today, 30, week
    )
    assert dates(moved(once, end)) == dates(once)
    replayed = progress.replays(once)
    for key, review in dates(once).items():
        due = replayed[key].due
        assert review.get("due") == (due.isoformat() if due else None)


LADDER = (3, 7, 16, 35, 75, 160)
AFTER = {"missed": 1, "helped": 2}


def _expected(replayed: progress.Replay, introduced: str | None) -> date | None:
    """Today's ladder, as documented: a day after the learning day, then 1 day
    after a miss, 2 after help and 3, 7, 16, 35, 75, 160 for consecutive solids,
    a solid answered late adding the days it was late."""
    if not replayed.days:
        return None
    first = min([*replayed.days, *([introduced] if introduced else [])])
    streak, expected = 0, date.fromisoformat(first) + timedelta(days=1)
    for day, verdict in replayed.verdicts:
        streak = streak + 1 if verdict == "solid" else 0
        answered = date.fromisoformat(day)
        if replayed.days[day] == progress.LEARNING:
            step = 1
        elif verdict == "solid":
            late = max((answered - expected).days, 0)
            step = LADDER[min(streak, len(LADDER)) - 1] + late
        else:
            step = AFTER[verdict]
        expected = answered + timedelta(days=step)
    return expected


@settings(max_examples=150, deadline=None)
@given(steps, st.integers(1, 14))
def test_with_no_exam_scheduling_is_todays_ladder(
    events: list[Step], lead: int
) -> None:
    record, today = history(events)
    with_lead, _ = history(events, preferences={"final_review_days": str(lead)})
    assert dates(with_lead) == dates(record)
    replayed = progress.replays(record)
    stripped = {
        **record,
        "observations": {
            key: {name: value for name, value in item.items() if name != "due_topics"}
            for key, item in record["observations"].items()
        },
    }
    assert progress.replays(stripped) == replayed
    for key, review in dates(record).items():
        if review.get("by") != "engine" or not replayed[key].verdicts:
            continue
        expected = _expected(replayed[key], record["topics"][key].get("introduced"))
        assert expected is not None and review["due"] == expected.isoformat()


@st.composite
def arc_cut_courses(draw: st.DrawFn) -> dict[str, Any]:
    """A random prerequisite graph, cut into arcs at random boundaries of one
    of its topological orders (so no topic needs a later arc), with
    ``path.order`` shuffled."""
    count = draw(st.integers(2, 14))
    keys = [f"t{index:02d}" for index in range(count)]
    needs = {
        key: sorted(
            draw(st.sets(st.sampled_from(keys[:index]), max_size=3)) if index else ()
        )
        for index, key in enumerate(keys)
    }
    cuts = sorted(draw(st.sets(st.integers(1, count - 1), max_size=count - 1)))
    bounds = [0, *cuts, count]
    arcs = [f"arc{index}" for index in range(len(bounds) - 1)]
    home = {
        key: arcs[next(i for i in range(len(arcs)) if bounds[i] <= n < bounds[i + 1])]
        for n, key in enumerate(keys)
    }
    order = draw(st.permutations(keys))
    return {
        "topics": {key: {"needs": needs[key], "arc": home[key]} for key in keys},
        "arcs": {arc: {} for arc in arcs},
        "path": {"order": list(order), "arcs": arcs},
    }


@settings(max_examples=300, deadline=None)
@given(arc_cut_courses())
def test_the_path_runs_arc_by_arc_in_prerequisite_order(
    record: dict[str, Any],
) -> None:
    order = progress.path_order(record)
    arcs = record["path"]["arcs"]
    assert sorted(order) == sorted(record["topics"])
    seen: set[str] = set()
    for key in order:
        assert set(record["topics"][key]["needs"]) <= seen, "prerequisites first"
        seen.add(key)
    chapters = [arcs.index(record["topics"][key]["arc"]) for key in order]
    assert chapters == sorted(chapters), "every topic of an arc before the next arc's"
    within = [key for key in record["path"]["order"] if key in order]
    for arc in arcs:
        mine = [key for key in order if record["topics"][key]["arc"] == arc]
        stored = [key for key in within if key in mine]
        free = all(not record["topics"][key]["needs"] for key in mine)
        if free:
            assert mine == stored, "path.order breaks ties inside an arc"
