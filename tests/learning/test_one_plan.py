"""One plan: on the demo world's own records, every verb gives each topic the
day the daily plan gives it (round 11: the topic page, the course head and the
exam panel said Eigen Thu 12 Nov while Home, the calendar and the tutor said
Mon 16)."""

from datetime import date, timedelta
import io
import json
from pathlib import Path
import sys
from typing import Any

import pytest

from learning import planning, retrieval
from learning.__main__ import main
from learning.workspace import initialize

WORLD = json.loads(
    (Path(__file__).parent / "golden" / "demo-world.json").read_text(encoding="utf-8")
)
COURSES = ("calculus", "linear-algebra", "probability", "real-analysis")
EXAMS = ("linear-algebra", "probability")
WINDOW = 30

Days = dict[tuple[str, str, str], str]


class World:
    """The four courses at one checkpoint, each in its own workspace."""

    def __init__(
        self,
        root: Path,
        checkpoint: str,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        self.monkeypatch, self.capsys = monkeypatch, capsys
        self.roots: dict[str, Path] = {}
        for name in COURSES:
            folder = root / name
            folder.mkdir(parents=True)
            initialize(folder)
            record = WORLD["checkpoints"][checkpoint].get(name) or WORLD["steady"][name]
            (folder / ".study" / "course.json").write_text(json.dumps(record))
            self.roots[name] = folder
        monkeypatch.setenv("VAULT_DIR", str(root / "vault"))
        # Each verb replays the same days; one replay per input keeps the test
        # quick, and a verb that read another plan would still disagree.
        made: dict[str, Any] = {}
        replay = retrieval.daily

        def daily(readable: Any, today: date) -> Any:
            key = json.dumps([today.isoformat(), readable], sort_keys=True)
            if key not in made:
                made[key] = replay(readable, today)
            return made[key]

        monkeypatch.setattr(retrieval, "daily", daily)
        monkeypatch.setattr(planning, "daily", daily)

    def run(self, name: str, *args: str, day: str) -> Any:
        self.monkeypatch.setenv("LEARNING_TODAY", day)
        self.monkeypatch.setattr(sys, "stdin", io.StringIO(""))
        assert main(["--workspace", str(self.roots[name]), *args]) == 0
        return json.loads(self.capsys.readouterr().out)

    def plan(self, day: str) -> dict[str, dict[str, Any]]:
        found = self.run(COURSES[0], "plan", "--all", "--days", str(WINDOW), day=day)
        return {Path(course["workspace"]).name: course for course in found["courses"]}

    def maps(self, day: str) -> dict[str, dict[str, Any]]:
        return {name: self.run(name, "map", day=day) for name in COURSES}


def planned_days(
    plan: dict[str, dict[str, Any]], untaught: set[tuple[str, str]]
) -> Days:
    """Each topic's first review and first start in the plan's days; an
    untaught topic's reviews follow its start, so only its start counts."""
    found: Days = {}
    for name, course in plan.items():
        for day in (course.get("plan") or {}).get("days", []):
            for kind in ("reviews", "new"):
                for topic in day[kind]:
                    if kind == "reviews" and (name, topic) in untaught:
                        continue
                    found.setdefault((name, kind, topic), day["date"])
    return found


def within(found: Days, last: str) -> Days:
    return {key: when for key, when in found.items() if when <= last}


def map_days(maps: dict[str, dict[str, Any]]) -> Days:
    found: Days = {}
    for name, shown in maps.items():
        for topic in shown["topics"]:
            if topic.get("starts"):
                found[(name, "new", topic["topic"])] = topic["starts"]
            elif topic.get("review"):
                found[(name, "reviews", topic["topic"])] = topic["review"]
    return found


def untaught_of(maps: dict[str, dict[str, Any]]) -> set[tuple[str, str]]:
    return {
        (name, topic["topic"])
        for name, shown in maps.items()
        for topic in shown["topics"]
        if topic.get("starts")
    }


def final_review(exam_day: str, days: int) -> str:
    return (date.fromisoformat(exam_day) - timedelta(days=days)).isoformat()


@pytest.mark.parametrize(
    ("checkpoint", "day"),
    [
        ("seed", "2026-11-08"),
        ("lesson-review", "2026-11-09"),
        ("day-done", "2026-11-10"),
        ("day-after", "2026-11-17"),
    ],
)
def test_every_verb_gives_each_topic_the_plan_s_day(
    checkpoint: str,
    day: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    world = World(tmp_path, checkpoint, monkeypatch, capsys)
    plan, maps = world.plan(day), world.maps(day)
    last = (date.fromisoformat(day) + timedelta(days=WINDOW - 1)).isoformat()
    untaught = untaught_of(maps)
    planned = planned_days(plan, untaught)

    # The topic page, the course head and rows, the exam panel (map) against
    # Home and the calendar (plan).
    assert within(map_days(maps), last) == planned
    for name in EXAMS:
        exam, course = maps[name]["exam"], plan[name]
        days = course.get("plan") or {}
        assert exam.get("unreviewed", []) == days.get("unreviewed", []), name
        assert exam.get("does_not_fit", []) == days.get("does_not_fit", []), name
        assert exam["final_review"] == final_review(
            exam["date"], days["final_review_days"]
        )

        # The topic page's facts (show) and the tutor's brief (resume).
        topics = [topic["topic"] for topic in maps[name]["topics"]]
        items = world.run(name, "show", *topics, day=day)["items"]
        for topic in topics:
            item = items[topic]
            key = (
                (name, "new", topic)
                if (name, topic) in untaught
                else (name, "reviews", topic)
            )
            when = item.get("starts") or item.get("review", {}).get("planned")
            if key in planned or (when and when <= last):
                assert when == planned.get(key), (name, topic)
        resume = world.run(name, "resume", day=day)
        assert all(
            planned[(name, "reviews", item["topic"])] == day
            for item in resume.get("due", [])
        )
        assert all(
            planned[(name, "reviews", item["topic"])] == item["planned"]
            for item in resume.get("due_later", [])
            if item["planned"] <= last
        )
        assert within(
            {
                (name, "new", topic): when
                for topic, when in resume.get("starts", {}).items()
            },
            last,
        ) == {key: when for key, when in planned.items() if key[:2] == (name, "new")}
        assert resume["course"]["exam"]["final_review"] == exam["final_review"]


def test_a_day_whose_plan_he_finished_moves_nothing_overnight(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """On 9 Nov he did every item its plan held, and closed each lesson with
    Done for today on an open question: the next morning keeps every day he
    was told (round 11: 36 dates moved, each "yesterday's plan was not
    finished")."""
    world = World(tmp_path, "day-done", monkeypatch, capsys)
    evening, morning = world.maps("2026-11-09"), world.maps("2026-11-10")
    told, now = map_days(evening), map_days(morning)
    assert {key: when for key, when in now.items() if told.get(key) != when} == {}
    assert [
        (name, topic["topic"])
        for name, shown in morning.items()
        for topic in shown["topics"]
        if topic.get("moved")
    ] == []


def test_a_moved_day_names_the_day_he_was_told(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """He last studied on 10 Nov and came back on 17 Nov: each moved day
    names the day the plan gave it as 10 Nov ended, the one every view and
    close told him (round 11: Eigen's "moved from Saturday 14 November", a
    day he was never shown)."""
    world = World(tmp_path, "day-after", monkeypatch, capsys)
    told = map_days(world.maps("2026-11-10"))
    later = world.maps("2026-11-17")
    moved = {
        (name, "new" if topic.get("starts") else "reviews", topic["topic"]): topic[
            "moved"
        ]
        for name, shown in later.items()
        for topic in shown["topics"]
        if topic.get("moved")
    }
    assert moved, "a week away moves days"
    assert {key: why["from"] for key, why in moved.items()} == {
        key: told[key] for key in moved
    }
    assert {why["by"] for why in moved.values()} == {"missed"}
    assert {why["on"] for why in moved.values()} == {"2026-11-10"}


def test_the_exam_eve_starts_what_the_rest_of_the_exam_stands_on(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Two days before the Probability exam, its final review has room for
    one start: Expectation, which Variance needs, not Poisson, which nothing
    on the exam needs and which comes first in the path (round 11, 1 N6)."""
    world = World(tmp_path, "day-after", monkeypatch, capsys)
    days = world.plan("2026-11-17")["probability"]["plan"]
    starts = [
        topic
        for day in days["days"]
        for topic in day["new"]
        if day["date"] < "2026-11-19"
    ]
    assert starts == ["expectation"]
    assert "expectation" not in days.get("does_not_fit", [])
