"""Properties of exam-aware scheduling over random course histories."""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from hypothesis import given, settings
from hypothesis import strategies as st

from learning import agenda, progress, schema

START = date(2026, 1, 5)
ACTIONS = ("introduce", "correct", "incorrect", "partial", "hint", "pin")
TOPICS = ("a", "b", "c", "d", "e")


def on(offset: int) -> date:
    return START + timedelta(days=offset)


def save(record: dict[str, Any], patch: dict[str, Any], day: date) -> dict[str, Any]:
    now = f"{day.isoformat()}T09:00:00+00:00"
    patched, outcome = schema.apply_patch(record, patch, today=day, now=now)
    planned, _ = progress.schedule(patched, outcome, day)
    return schema.validate_record(planned)


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
def test_no_review_is_ever_on_or_after_an_exam_ahead(
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
    for review in dates(record).values():
        assert review.get("due", "") < exam.day.isoformat()
    for day in agenda.plan_days(record, today, agenda.Settings(), 60):
        if day["date"] >= exam.day.isoformat():
            assert not day["reviews"] and not day["new"]


@settings(max_examples=150, deadline=None)
@given(
    steps, st.integers(1, 12), st.booleans(), st.one_of(st.none(), st.integers(-5, 60))
)
def test_the_daily_plan_never_exceeds_the_budget(
    events: list[Step], budget: int, weekends: bool, exam_day: int | None
) -> None:
    exam = None if exam_day is None else (len(events) // 2, exam_day)
    record, today = history(events, exam=exam)
    plan = agenda.Settings(budget=budget, weekends=weekends)
    for day in agenda.plan_days(record, today, plan, 45):
        assert len(day["reviews"]) + len(day["new"]) <= budget
        assert not set(day["reviews"]) & set(day["new"])


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
    assert dates(moved(once, end)) == dates(once)
    replayed = progress.replays(once)
    for key, review in dates(once).items():
        due = replayed[key].due
        assert review.get("due") == (due.isoformat() if due else None)


LADDER = (3, 7, 16, 35, 75, 160)
AFTER = {"missed": 1, "helped": 2}


def _expected(replayed: progress.Replay) -> date | None:
    """Today's ladder, as documented: a day after the learning day, then 1 day
    after a miss, 2 after help and 3, 7, 16, 35, 75, 160 for consecutive solids."""
    if not replayed.days:
        return None
    streak, expected = 0, None
    for day, verdict in replayed.verdicts:
        streak = streak + 1 if verdict == "solid" else 0
        if replayed.days[day] == progress.LEARNING:
            step = 1
        elif verdict == "solid":
            step = LADDER[min(streak, len(LADDER)) - 1]
        else:
            step = AFTER[verdict]
        expected = date.fromisoformat(day) + timedelta(days=step)
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
        expected = _expected(replayed[key])
        assert expected is not None and review["due"] == expected.isoformat()
