"""A read of the plan does the same work however many days he has studied
(round 16, 18 Nov 2026): the replay remade the plan once for every save of
every day back to the last day that began afresh, and a learner who finishes
every day never begins afresh, so a read took 0.3 s after 7 study days, 4.7 s
after 56 and 17 s after 400. A read now begins from the plan as the last day
he studied ended, kept by that day's last read (``learning.told``), and the
kept plan gives what replaying every day gives."""

from collections.abc import Callable, Iterator
from datetime import date, timedelta
import json
from pathlib import Path
import random
from typing import Any

import pytest

from learning import agenda, arcs, capacity, progress, retrieval, schema, told

GOLDEN = Path(__file__).parent / "golden"
START = date(2026, 1, 5)


def _saved(record: dict[str, Any], patch: dict[str, Any], day: date, at: int) -> Any:
    """``record`` after one save of ``patch`` on ``day``, as a save stores it."""
    now = f"{day.isoformat()}T{9 + at // 60:02d}:{at % 60:02d}:00+00:00"
    seen = capacity.final_reviews({"c": record}, day)["c"]
    patched, outcome = schema.apply_patch(seen, patch, today=day, now=now)
    arcs.settle(seen, patched, patch, outcome, day)
    if outcome.exam_moved:
        patched = capacity.replanned({"c": patched}, "c", day)
    planned, _ = progress.schedule(patched, outcome, day)
    return schema.validate_record(progress.begun(planned, day))


def studied(days: int) -> dict[str, Any]:
    """A course he studied every day for ``days`` days, finishing each: every
    review due answered, the next topic started, one save an answer."""
    rng = random.Random(days)
    topics = {f"t{i:02d}": {"title": f"Topic {i}"} for i in range(40)}
    exam = (START + timedelta(days=days + 120)).isoformat()
    record = _saved(
        schema.empty(),
        {"topics": topics, "exam": {"date": exam, "arcs": None}},
        START,
        0,
    )
    for n in range(days):
        day = START + timedelta(days=n)
        seen = capacity.final_reviews({"c": record}, day)["c"]
        at = 1
        for item in progress.due(seen, day):
            answer = {"topics": [item["topic"]], "text": "q", "help": "none"}
            answer["result"] = "correct" if rng.random() < 0.85 else "incorrect"
            record = _saved(record, {"observations": [answer]}, day, at)
            at += 1
        untaught = [
            t
            for t in progress.path_order(record)
            if "introduced" not in record["topics"][t]
        ]
        if untaught:
            start = {
                "topics": [untaught[0]],
                "text": "q",
                "help": "none",
                "result": "correct",
            }
            patch = {
                "topics": {untaught[0]: {"introduced": True}},
                "observations": [start],
            }
            record = _saved(record, patch, day, at)
        elif at == 1:
            answer = {
                "topics": ["t00"],
                "text": "q",
                "help": "none",
                "result": "correct",
            }
            record = _saved(record, {"observations": [answer]}, day, at)
    return {"c": record}


def counted(read: Callable[[], Any], monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    """The plans a read makes and the days it replays."""
    work = {"plans": 0, "days": 0}
    with monkeypatch.context() as patch:
        for name, kind in (("_planned", "plans"), ("_day", "days")):
            original = getattr(agenda, name)

            def tally(
                *args: Any, _f: Any = original, _k: str = kind, **kwargs: Any
            ) -> Any:
                work[_k] += 1
                return _f(*args, **kwargs)

            patch.setattr(agenda, name, tally)
        read()
    return work


def evening(records: dict[str, dict[str, Any]], day: date) -> None:
    """Keep the plan as ``day`` ended, as that day's last read keeps it; here
    made afresh, since what is counted is the read after it."""
    readable = capacity.final_reviews(records, day)
    stored = {n: progress.begun(r, day) for n, r in readable.items()}
    plan = agenda.afresh(readable, day, agenda.MAX_DAYS)
    told.keep(
        stored,
        day,
        agenda.MAX_DAYS,
        agenda.Replay(plan, plan, None, None, since=day),
    )


def read(records: dict[str, dict[str, Any]], day: date) -> agenda.Replay:
    return retrieval.daily(capacity.final_reviews(records, day), day)


def test_a_read_does_the_same_work_after_7_56_or_224_study_days(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    work = {}
    for days in (7, 56, 224):
        records = studied(days)
        today = START + timedelta(days=days)
        evening(records, today - timedelta(days=1))
        work[days] = counted(lambda: read(records, today), monkeypatch)
    assert work[7] == work[56] == work[224] == {"plans": 1, "days": 1}, work


def test_without_a_kept_plan_the_read_replays_every_day_he_finished(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """What the check above guards against: with nothing kept, a read
    replays every day back to the first (``agenda.replay``)."""
    records = studied(7)
    today = START + timedelta(days=7)
    work = counted(lambda: read(records, today), monkeypatch)
    assert work["days"] == 8, work


def test_a_day_he_does_not_study_keeps_the_last_study_days_plan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A read on a day with no study (the app opened, nothing saved) begins
    from the last study day's kept plan and keeps it, so the day after, a
    day that begins afresh since that study day went by, does too."""
    records = studied(7)
    today = START + timedelta(days=7)
    evening(records, today - timedelta(days=1))
    assert counted(lambda: read(records, today), monkeypatch)["days"] == 1
    tomorrow = today + timedelta(days=1)
    work = [counted(lambda: read(records, tomorrow), monkeypatch) for _ in range(2)]
    assert work == [{"plans": 1, "days": 1}] * 2, work


def test_a_read_that_replays_keeps_the_last_study_days_plan_for_the_next(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A read with nothing kept (the first after an upgrade, or after an
    earlier day changed) replays once, even on a day that begins afresh, and
    the reads after it begin from what it kept."""
    records = studied(7)
    tomorrow = START + timedelta(days=8)
    first = counted(lambda: read(records, tomorrow), monkeypatch)
    second = counted(lambda: read(records, tomorrow), monkeypatch)
    assert first["days"] == 8 and second == {"plans": 1, "days": 1}, (first, second)


# Each world's checkpoints, read the next morning (the read that first begins
# from the kept plan), and two read later the same day, after saves of that day.
CHECKPOINTS = {
    "demo-world": ("seed", "day-done", "day-after", "lesson-review"),
    "round12-world": ("d9-end", "d10-end", "d17-post-poisson"),
    "demo-world-r14": ("slip", "lesson-mid"),
}
SAME_DAY = {("demo-world", "day-after"), ("round12-world", "d10-end")}


def _worlds() -> Iterator[tuple[str, dict[str, dict[str, Any]], date]]:
    for name, checkpoints in CHECKPOINTS.items():
        world = json.loads((GOLDEN / f"{name}.json").read_text(encoding="utf-8"))
        for checkpoint in checkpoints:
            courses = world["checkpoints"][checkpoint]
            found = {
                c: courses.get(c) or world["steady"].get(c)
                for c in {*courses, *world["steady"]}
            }
            records = {c: r for c, r in found.items() if r}
            last = date.fromisoformat(
                max(
                    o["date"]
                    for r in records.values()
                    for o in r["observations"].values()
                )
            )
            days = (last, last + timedelta(days=1))
            for today in days if (name, checkpoint) in SAME_DAY else days[1:]:
                yield f"{name} {checkpoint} {today}", records, today


WORLDS = list(_worlds())


def _within(plan: agenda.Plan, reach: date) -> dict[str, Any]:
    """The plan through ``reach``: past it the kept plan never reached, and
    the rules place each day afresh (``agenda._Told.covers``)."""
    days = {
        c: [d for d in found if d["date"] < reach.isoformat()]
        for c, found in plan.days.items()
    }
    rest = (
        plan.does_not_fit,
        plan.held,
        plan.unreviewed,
        plan.starts_after,
        plan.why,
        plan.reasons,
        plan.finals,
    )
    return {"days": days, "rest": rest}


@pytest.mark.parametrize("label", [label for label, _, _ in WORLDS])
def test_a_read_from_the_kept_plan_gives_the_replayed_plan(label: str) -> None:
    _, records, today = next(w for w in WORLDS if w[0] == label)
    stored = {
        n: progress.begun(r, today)
        for n, r in capacity.final_reviews(records, today).items()
    }
    replayed = agenda.replay(stored, today, agenda.MAX_DAYS)
    assert replayed.studied is not None
    the_evening = {
        n: progress.begun(agenda.as_of(r, today), replayed.studied)
        for n, r in capacity.final_reviews(records, today).items()
    }
    read(the_evening, replayed.studied)
    kept = told.load(stored, today, agenda.MAX_DAYS)
    assert kept is not None and kept.day == replayed.studied
    now = read(records, today)
    reach = replayed.studied + timedelta(days=agenda.MAX_DAYS)
    assert _within(now.now, reach) == _within(replayed.now, reach)
    assert _within(now.began, reach) == _within(replayed.began, reach)


def _demo() -> tuple[dict[str, dict[str, Any]], date]:
    _, records, today = next(
        w for w in WORLDS if w[0] == "demo-world day-after 2026-11-11"
    )
    return records, today


def _kept_evening(records: dict[str, dict[str, Any]], today: date) -> None:
    """The last day he studied before ``today`` read as it ended, which keeps
    its plan."""
    stored = {
        n: progress.begun(r, today)
        for n, r in capacity.final_reviews(records, today).items()
    }
    replayed = agenda.replay(stored, today, agenda.MAX_DAYS)
    assert replayed.studied is not None
    the_evening = {
        n: progress.begun(agenda.as_of(r, today), replayed.studied)
        for n, r in capacity.final_reviews(records, today).items()
    }
    read(the_evening, replayed.studied)


def _stored(
    records: dict[str, dict[str, Any]], today: date
) -> dict[str, dict[str, Any]]:
    return {
        n: progress.begun(r, today)
        for n, r in capacity.final_reviews(records, today).items()
    }


def test_a_change_to_an_earlier_day_replays_from_the_records() -> None:
    records, today = _demo()
    _kept_evening(records, today)
    assert told.load(_stored(records, today), today, agenda.MAX_DAYS) is not None
    course = next(c for c, r in records.items() if r["observations"])
    record = records[course]
    key, item = min(record["observations"].items(), key=lambda kv: kv[1]["date"])
    observations = {**record["observations"], key: {**item, "text": "edited"}}
    edited = {**records, course: {**record, "observations": observations}}
    assert told.load(_stored(edited, today), today, agenda.MAX_DAYS) is None


def test_a_topic_added_since_the_kept_day_is_planned_and_one_removed_is_not() -> None:
    records, today = _demo()
    _kept_evening(records, today)
    course = "real-analysis"  # no exam: a topic he can start is placed
    record = records[course]
    used = {t for o in record["observations"].values() for t in o["topics"]}
    used |= {t for task in record["tasks"].values() for t in task.get("topics", [])}
    gone = next(
        t
        for t, topic in record["topics"].items()
        if "introduced" not in topic and t not in used
    )
    topics = {
        k: {**v, "needs": [n for n in v.get("needs", []) if n != gone]}
        for k, v in record["topics"].items()
        if k != gone
    }
    topics["added"] = {"title": "Added since"}
    changed = {**records, course: {**record, "topics": topics}}
    if "order" in record.get("path", {}):
        order = [t for t in record["path"]["order"] if t != gone] + ["added"]
        changed[course]["path"] = {**record["path"], "order": order}
    assert told.load(_stored(changed, today), today, agenda.MAX_DAYS) is not None
    now = read(changed, today).now
    placed = {t for d in now.days[course] for t in (*d["reviews"], *d["new"])}
    assert gone not in placed
    assert "added" in placed


@pytest.mark.parametrize("content", ["not json", '{"ended": [{"day": 1}]}', "[]"])
def test_a_kept_file_that_cannot_be_read_is_made_again(content: str) -> None:
    records = studied(7)
    today = START + timedelta(days=7)
    told.path().parent.mkdir(parents=True, exist_ok=True)
    told.path().write_text(content, encoding="utf-8")
    stored = _stored(records, today)
    assert told.load(stored, today, agenda.MAX_DAYS) is None
    assert read(records, today).now == agenda.replay(stored, today, agenda.MAX_DAYS).now
    assert told.load(stored, today + timedelta(days=1), agenda.MAX_DAYS) is not None
