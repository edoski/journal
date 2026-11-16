"""A lesson he has begun counts as started, on the records of round 12's
daily-loop evaluation: two Poisson sessions whose answers were all
predictions, so the topic is not taught yet, left the plan putting its
first lesson on Sat 14 Nov, "moved from 9 Nov, yesterday's plan was not
finished", and on 17 Nov the course head said there was no room before the
exam to start it (round 12, 1 D3)."""

from datetime import date
import json
from pathlib import Path
from typing import Any

import pytest

from learning import capacity, progress
from tests.learning.test_one_plan import World, planned_days, within

ROUND12 = json.loads(
    (Path(__file__).parent / "golden" / "round12-world.json").read_text(
        encoding="utf-8"
    )
)


def world(
    tmp_path: Path,
    checkpoint: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> World:
    """The world at ``checkpoint``, with its own registry, so two worlds in
    one test never plan each other's courses."""
    monkeypatch.setenv("HOME", str(tmp_path / checkpoint / "home"))
    return World(tmp_path / checkpoint, checkpoint, monkeypatch, capsys, ROUND12)


def starts(course: dict[str, Any]) -> dict[str, str]:
    return {
        topic: day["date"]
        for day in reversed(course["plan"]["days"])
        for topic in day["new"]
    }


def test_a_begun_lesson_goes_on_the_next_study_day(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The evening after the second Poisson lesson, Poisson goes on the next
    day, and its review the day after, never as a first lesson days later."""
    days = world(tmp_path, "d10-end", monkeypatch, capsys)
    plan = days.plan("2026-11-10")["probability"]
    assert starts(plan)["poisson"] == "2026-11-11"
    assert plan["plan"]["why"]["poisson"] == {"kind": "begun"}
    reviews = [d["date"] for d in plan["plan"]["days"] if "poisson" in d["reviews"]]
    assert reviews[0] == "2026-11-12"
    shown = next(
        t
        for t in days.maps("2026-11-10")["probability"]["topics"]
        if t["topic"] == "poisson"
    )
    assert (shown["starts"], shown["starts_why"], shown.get("moved")) == (
        "2026-11-11",
        {"kind": "begun"},
        None,
    )


def test_a_night_after_a_begun_lesson_moves_no_day(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """9 Nov held Poisson's start and he began its lesson: the next morning
    every day he was told the evening before stands, Poisson's included
    (round 12, 1 N2's three moves: Poisson's start 9 to 14 Nov and its review
    10 to 18 Nov)."""
    evening = world(tmp_path, "d9-end", monkeypatch, capsys).plan("2026-11-09")
    morning = world(tmp_path, "d10", monkeypatch, capsys).plan("2026-11-10")
    untaught = {("probability", "poisson")}
    told = {
        key: day
        for key, day in within(planned_days(evening, untaught), "2026-12-08").items()
        if day >= "2026-11-10" or key == ("probability", "new", "poisson")
    }
    now = within(planned_days(morning, untaught), "2026-12-08")
    assert told[("probability", "new", "poisson")] == "2026-11-10"
    assert now == told


def test_the_exam_run_up_carries_a_begun_lesson_on(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Two days before the Probability exam, the Poisson lesson he began on
    9 Nov goes on that day and is reviewed the next, so nothing says there is
    no room to start it."""
    plan = world(tmp_path, "d17", monkeypatch, capsys).plan("2026-11-17")
    course = plan["probability"]["plan"]
    assert starts(plan["probability"])["poisson"] == "2026-11-17"
    assert "poisson" not in course.get("does_not_fit", [])
    assert "poisson" not in course.get("reasons", {})
    first = [d["date"] for d in course["days"] if "poisson" in d["reviews"]]
    assert first[0] == "2026-11-18"


def test_a_begun_lesson_is_started_the_day_he_began_it() -> None:
    """His week learns from the day he began a lesson, never the day of its
    first answer that counts, so the day he began it shows no start owed."""
    stored = ROUND12["checkpoints"]["d10-end"]["probability"]
    record = capacity.final_reviews({"p": stored}, date(2026, 11, 10))["p"]
    replayed = progress.replays(record)["poisson"]
    lesson = progress.lessons(record)["poisson"]
    first = capacity.first_day(replayed, record["topics"]["poisson"], lesson)
    assert first == date(2026, 11, 9)
