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

from learning import capacity, planning, records, retrieval
from learning.__main__ import main
from learning.workspace import initialize, resolve

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
        world: dict[str, Any] = WORLD,
    ) -> None:
        self.monkeypatch, self.capsys = monkeypatch, capsys
        self.roots: dict[str, Path] = {}
        for name in COURSES:
            folder = root / name
            folder.mkdir(parents=True)
            initialize(folder)
            record = world["checkpoints"][checkpoint].get(name) or world["steady"][name]
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


def test_a_save_tells_the_day_every_view_then_shows(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The receipt of a save names, for each review it set, the day the
    topic page and the calendar show right after it (round 11, report 4:
    one review told Sat 14 Nov by the save, "corrected" to Thu 12 Nov by
    the tutor, and shown Fri 13 Nov on its page)."""
    world = World(tmp_path, "lesson-review", monkeypatch, capsys)
    answer = {
        "topics": ["binomial"],
        "text": "Exactly 4 heads in 10 tosses",
        "response": "(1/2)^10",
        "help": "none",
        "result": "incorrect",
    }
    monkeypatch.setenv("LEARNING_TODAY", "2026-11-09")
    monkeypatch.setattr(
        sys, "stdin", io.StringIO(json.dumps({"observations": [answer]}))
    )
    assert main(["--workspace", str(world.roots["probability"]), "save"]) == 0
    receipt = json.loads(capsys.readouterr().out)
    told = {topic: review["planned"] for topic, review in receipt["reviews"].items()}
    assert told, "the save set a review"
    shown = map_days(world.maps("2026-11-09"))
    planned = planned_days(world.plan("2026-11-09"), set())
    for topic, day in told.items():
        assert shown[("probability", "reviews", topic)] == day, topic
        assert planned[("probability", "reviews", topic)] == day, topic


@pytest.mark.parametrize("later", ["2026-11-08", "2026-11-09", "2026-11-10"])
def test_deleting_a_course_moves_no_day_of_another(
    later: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Deleting a course is not study: every other course keeps the days he
    was told, that day and the days after, but for the topics his own study
    moves, which move as they would have (round 13, 4 M1: deleting
    Calculus I took 38 days of study out of his pace, and 35 days moved in
    the other three courses, Series' told Thu 12 Nov among them)."""
    world = World(tmp_path, "seed", monkeypatch, capsys)
    told = planned_days(world.plan("2026-11-08"), set())
    kept = planned_days(world.plan(later), set())
    world.run("calculus", "forget", "--course", day="2026-11-08")
    now = planned_days(world.plan(later), set())
    others = {key: day for key, day in kept.items() if key[0] != "calculus"}
    assert {key[0] for key in now} == {"linear-algebra", "probability", "real-analysis"}
    assert others.keys() == now.keys()
    moved = {key for key, day in now.items() if day != told.get(key)}
    unmoved = {key for key in moved if kept[key] == told.get(key)}
    if later == "2026-11-08":
        assert now == others
    else:
        # A day a plan made afresh (a day he studies went by with no study)
        # may move any topic; each says so, from the day he was told.
        shown = {
            (name, "new" if topic.get("starts") else "reviews", topic["topic"]): topic
            for name in COURSES[1:]
            for topic in world.run(name, "map", day=later)["topics"]
        }
        assert {
            key: shown[key].get("moved")
            for key in unmoved
            if (shown[key].get("moved") or {}).get("from") != told[key]
        } == {}


def test_full_is_said_only_of_days_at_his_limit(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The plan says his pace fills the final review only when every day of
    it holds his limit (round 13, 1 n4: "your pace fills every day of the
    final review" while days of it held room)."""
    world = World(tmp_path, "seed", monkeypatch, capsys)
    found = world.plan("2026-11-08")
    course = found["linear-algebra"]["plan"]
    assert course["unreviewed"] == ["rank"]
    exam = world.run("linear-algebra", "map", day="2026-11-08")["exam"]
    held: dict[str, int] = {}
    for other in found.values():
        for day in (other.get("plan") or {}).get("days", []):
            held[day["date"]] = held.get(day["date"], 0) + len(day["reviews"])
    monkeypatch.setenv("LEARNING_TODAY", "2026-11-08")
    stored = {name: records.read(resolve(root)) for name, root in world.roots.items()}
    week = capacity.of(
        capacity.final_reviews(stored, date(2026, 11, 8)).values(), date(2026, 11, 8)
    )
    first, last = (
        date.fromisoformat(exam["final_review"]),
        date.fromisoformat(exam["date"]),
    )
    span = (first + timedelta(days=n) for n in range((last - first).days))
    free = [
        day
        for day in span
        if week.studies(day)
        and held.get(day.isoformat(), 0) < week.room(day, "reviews")
    ]
    assert free, "a day of the final review has room"
    assert "rank" not in course.get("reasons", {})


EVE = json.loads((Path(__file__).parent / "golden" / "exam-eve.json").read_text())


def test_a_start_whose_need_comes_only_on_the_eve_is_not_ready(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Two days before the exam, Variance waits on Expectation, which starts
    that day: what it needs won't be solid in time, never a full pace; the
    final review, at his limit every day, is full (round 13, 1 n4)."""
    world = {"checkpoints": {"eve": EVE}, "steady": WORLD["steady"]}
    eve = World(tmp_path, "eve", monkeypatch, capsys, world).plan("2026-11-17")
    plan = eve["probability"]["plan"]
    assert plan["does_not_fit"] == ["variance"]
    assert plan["reasons"]["variance"] == "not_ready"
    assert plan["reasons"]["conditional"] == "full"
