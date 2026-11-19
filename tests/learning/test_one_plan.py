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

from learning import agenda, capacity, planning, progress, records, retrieval
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


def finish(
    world: World, day: str, but: frozenset[str] = frozenset()
) -> dict[str, dict[str, Any]]:
    """Every review and start the plan still holds for ``day``, but the
    topics ``but`` names, done that day: the world was recorded under an
    earlier plan. The items done."""
    done: dict[str, dict[str, Any]] = {}
    for name, course in world.plan(day).items():
        held = next(
            (found for found in course["plan"]["days"] if found["date"] == day), None
        )
        if held:
            held = {
                kind: [topic for topic in held[kind] if topic not in but]
                for kind in ("reviews", "new")
            }
        if not held or not (held["reviews"] or held["new"]):
            continue
        patch: dict[str, Any] = {}
        if held["reviews"]:
            patch["observations"] = [
                {"topics": [topic], "text": "q", "help": "none", "result": "correct"}
                for topic in held["reviews"]
            ]
        if held["new"]:
            patch["topics"] = {topic: {"introduced": True} for topic in held["new"]}
        world.monkeypatch.setenv("LEARNING_TODAY", day)
        world.monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(patch)))
        assert main(["--workspace", str(world.roots[name]), "save"]) == 0
        world.capsys.readouterr()
        done[name] = held
    return done


def test_a_day_whose_plan_he_finished_moves_nothing_overnight(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """On 9 Nov he did every item the plan he was shown held, and closed each
    lesson with Done for today on an open question: the next morning keeps
    every day he was told (round 11: 36 dates moved, each "yesterday's plan
    was not finished"). The world was recorded under an earlier plan, whose
    9 Nov held less than the plan now does (round 18, M1: a day he started
    nothing, or did more reviews than proposed, no longer lowers his pace),
    so he does the rest of 9 Nov first."""
    world = World(tmp_path, "day-done", monkeypatch, capsys)
    assert finish(world, "2026-11-09"), "the plan now holds more of 9 Nov"
    assert not finish(world, "2026-11-09"), "he did every item 9 Nov held"
    evening, morning = world.maps("2026-11-09"), world.maps("2026-11-10")
    told, now = map_days(evening), map_days(morning)
    assert {
        key: (told.get(key), when) for key, when in now.items() if told.get(key) != when
    } == {}
    assert not [
        (name, topic["topic"])
        for name, shown in morning.items()
        for topic in shown["topics"]
        if topic.get("moved")
    ]


@pytest.mark.parametrize("left", ["determinant", "elimination"])
def test_a_day_he_finished_but_one_review_moves_only_that_review(
    left: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Round 18, M1: on 9 Nov he did every item the plan held but one Linear
    Algebra review, and the night planned afresh, moving 53 dates: as 10 Nov
    began the final reviews started a day later, which re-read 30 Oct and
    1 Nov as days he stopped short of a start, and his new-topic pace read
    lower than as 9 Nov began, with nothing he did. A day he was told stays
    unless his own study moves it: the night moves the review he left, and
    only what stands on it."""
    world = World(tmp_path, "day-done", monkeypatch, capsys)
    finish(world, "2026-11-09", but=frozenset({left}))
    evening, morning = world.maps("2026-11-09"), world.maps("2026-11-10")
    told, now = map_days(evening), map_days(morning)
    needs = {
        topic["topic"]: set(topic.get("needs", []))
        for topic in morning["linear-algebra"]["topics"]
    }

    def stands_on(key: str) -> bool:
        return any(need == left or stands_on(need) for need in needs.get(key, ()))

    moved = {key for key, when in now.items() if told.get(key) != when}
    assert ("linear-algebra", "reviews", left) in moved
    assert all(
        name == "linear-algebra" and (topic == left or stands_on(topic))
        for name, _, topic in moved
    ), sorted(moved)


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
    """Two days before the Probability exam, its final review starts first
    Expectation, which Variance needs, not Poisson, which nothing on the exam
    needs and which comes first in the path (round 11, 1 N6). Since a day he
    started nothing no longer lowers his pace (round 18, M1), the review has
    room for every topic left, Variance after what it stands on."""
    world = World(tmp_path, "day-after", monkeypatch, capsys)
    days = world.plan("2026-11-17")["probability"]["plan"]
    starts = [
        topic
        for day in days["days"]
        for topic in day["new"]
        if day["date"] < "2026-11-19"
    ]
    assert starts[0] == "expectation", starts
    assert sorted(starts) == ["expectation", "geometric", "poisson", "variance"]
    assert starts.index("variance") > starts.index("expectation")
    assert not days.get("does_not_fit")


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
        # may move any topic; each later day says so, from the day he was
        # told, and one that came forward names no delay.
        shown = {
            (name, "new" if topic.get("starts") else "reviews", topic["topic"]): topic
            for name in COURSES[1:]
            for topic in world.run(name, "map", day=later)["topics"]
        }
        assert {
            key: shown[key].get("moved")
            for key in unmoved
            if now[key] > told[key]
            and (shown[key].get("moved") or {}).get("from") != told[key]
        } == {}


def test_deleting_a_course_with_an_exam_leaves_every_list(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A deleted course whose exam is still ahead leaves the plan of every
    course, which still reads (fix round 16: its kept record reached the
    replay with no final review, and ``plan --all`` failed, so the app's
    course list was gone)."""
    world = World(tmp_path, "seed", monkeypatch, capsys)
    world.run("probability", "forget", "--course", day="2026-11-08")
    assert set(world.plan("2026-11-09")) == {
        "calculus",
        "linear-algebra",
        "real-analysis",
    }


R14 = json.loads(
    (Path(__file__).parent / "golden" / "demo-world-r14.json").read_text("utf-8")
)


@pytest.mark.parametrize("world", [WORLD, R14], ids=["round-11", "round-14"])
def test_the_final_review_fills_its_free_days_with_what_it_left_out(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    world: dict[str, Any],
) -> None:
    """A final review leaves a taught topic without a review only when every
    study day of it holds his limit, and only then says his pace is full
    (round 14, M10: 14 and 17 Nov held no Probability item while Binomial,
    Poisson and Geometric read "No room in the final review"; round 13,
    1 n4: "full" while days held room)."""
    seeded = World(tmp_path, "seed", monkeypatch, capsys, world)
    found = seeded.plan("2026-11-08")
    held: dict[str, int] = {}
    for other in found.values():
        for day in (other.get("plan") or {}).get("days", []):
            held[day["date"]] = held.get(day["date"], 0) + len(day["reviews"])
    monkeypatch.setenv("LEARNING_TODAY", "2026-11-08")
    stored = {name: records.read(resolve(root)) for name, root in seeded.roots.items()}
    week = capacity.of(
        capacity.final_reviews(stored, date(2026, 11, 8)).values(), date(2026, 11, 8)
    ).resting(capacity.exam_days(stored.values()))
    for name in EXAMS:
        course = found[name]["plan"]
        exam = seeded.run(name, "map", day="2026-11-08")["exam"]
        first, last = (
            date.fromisoformat(exam["final_review"]),
            date.fromisoformat(exam["date"]),
        )
        span = (first + timedelta(days=n) for n in range((last - first).days))
        free = [
            day.isoformat()
            for day in span
            if week.studies(day)
            and held.get(day.isoformat(), 0) < week.room(day, "reviews")
        ]
        reasons = course.get("reasons", {})
        left = [
            topic
            for topic in course.get("unreviewed", [])
            if reasons.get(topic) != "too_late"
        ]
        assert not (left and free), (name, left, free)
        assert all(reasons.get(topic) == "full" for topic in left), (name, reasons)


def test_filling_the_final_review_keeps_every_day_he_was_told(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The topics the final review left out take its free room beside what
    the days he was told hold: today's saves keep every review the plan as
    today began gave a topic they did not touch (round 14, M10: Binomial and
    Poisson had no review before the exam, and Sat 14 Nov held one item)."""
    seeded = World(tmp_path, "seed", monkeypatch, capsys, R14)
    found = seeded.plan("2026-11-08")
    final = {
        topic
        for day in found["probability"]["plan"]["days"]
        if "2026-11-13" <= day["date"] < "2026-11-19"
        for topic in day["reviews"]
    }
    assert {"binomial", "poisson"} <= final
    monkeypatch.setenv("LEARNING_TODAY", "2026-11-08")
    stored = {name: records.read(resolve(root)) for name, root in seeded.roots.items()}
    made = agenda.replay(stored, date(2026, 11, 8), WINDOW)
    for name, record in stored.items():
        touched = agenda.touched(record, date(2026, 11, 8))
        for began, now in zip(made.began.days[name], made.now.days[name]):
            kept = {topic for topic in began["reviews"] if topic not in touched}
            assert kept <= set(now["reviews"]), (name, began, now)


def test_a_slip_moves_a_start_to_the_first_final_review_day_with_room(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """When a need slips, the start that waits on it comes back at the first
    day the plan's order gives it: a final review takes its exam's ready
    topics as the day's room allows, before any start a day already holds,
    and every start the slip did not touch keeps its day (round 14, m7:
    Random variables slipped on 9 Nov, and Poisson's start went to Sat
    14 Nov while Linear Algebra's kept 11 and 13 Nov). Since a night that
    left nothing keeps every day he was told (round 18), Poisson keeps the
    13 Nov that 8 Nov told, after Random variables' next review, and the
    starts the slip moved come back by the final review's first day; a
    start that stands on one of them (Variance on Expectation) follows it."""
    seeded = World(tmp_path, "slip", monkeypatch, capsys, R14)
    found = seeded.plan("2026-11-09")
    starts = {
        topic: day["date"]
        for day in found["probability"]["plan"]["days"]
        for topic in day["new"]
    }
    exam = seeded.run("probability", "map", day="2026-11-09")["exam"]
    assert starts["poisson"] < exam["date"], starts
    for topic in ("geometric", "expectation"):
        assert starts[topic] <= exam["final_review"], starts
    monkeypatch.setenv("LEARNING_TODAY", "2026-11-09")
    stored = {name: records.read(resolve(root)) for name, root in seeded.roots.items()}
    made = agenda.replay(stored, date(2026, 11, 9), WINDOW)
    for name, record in stored.items():
        touched = agenda.touched(record, date(2026, 11, 9))

        def stands_on(topic: str, record: dict[str, Any] = record) -> bool:
            return any(
                need in touched or stands_on(need)
                for need in progress.needs(record, topic)
            )

        for began, now in zip(made.began.days[name], made.now.days[name]):
            kept = {
                topic
                for topic in began["new"]
                if topic not in touched and not stands_on(topic)
            }
            assert kept <= set(now["new"]), (name, began, now)


def slip_basis(world: World) -> tuple[dict[str, Any], dict[str, Any]]:
    """On 9 Nov, the day Linear maps' first lesson is planned, a wrong answer
    on Basis and dimension, which it needs: Linear maps as the map then
    shows it, and the save's receipt."""

    def linear_maps() -> dict[str, Any]:
        return next(
            topic
            for topic in world.run("linear-algebra", "map", day="2026-11-09")["topics"]
            if topic["topic"] == "linear-maps"
        )

    assert linear_maps()["starts"] == "2026-11-09"
    answer = {
        "topics": ["basis"],
        "text": "Called four vectors spanning $\\mathbb{R}^3$ a basis",
        "response": "Yes, they are a basis",
        "help": "none",
        "result": "incorrect",
    }
    world.monkeypatch.setenv("LEARNING_TODAY", "2026-11-09")
    world.monkeypatch.setattr(
        sys, "stdin", io.StringIO(json.dumps({"observations": [answer]}))
    )
    assert main(["--workspace", str(world.roots["linear-algebra"]), "save"]) == 0
    receipt = json.loads(world.capsys.readouterr().out)
    return linear_maps(), receipt


def test_a_moved_day_says_what_of_his_study_moved_it(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A start that moved because a topic it needs slipped today names that
    topic, and a review he answered ahead of the day he was told says his
    answer moved it (round 14, m3: Poisson moved when Random variables
    slipped and the tutor said "today's day was full"; Rank, told Thu 12,
    read Wed 11 after more practice with no reason; here Span, told 25 Nov,
    is missed on 9 Nov). Since a day he started nothing no longer lowers
    his pace (round 18, M1), Poisson starts after Random variables' next
    review and the slip leaves it be. Since a night that left nothing keeps
    every day he was told (round 18), Continuity starts on 20 Nov, as 8 Nov
    told; Linear maps, planned 9 Nov, needs Basis and dimension, which slips
    instead."""
    monkeypatch.setenv("HOME", str(tmp_path / "slip" / "home"))
    slipped = World(tmp_path / "slip", "seed", monkeypatch, capsys, R14)
    linear_maps = slip_basis(slipped)[0]
    assert linear_maps["moved"]["waits_on"] == ["basis"], linear_maps
    monkeypatch.setenv("HOME", str(tmp_path / "seed" / "home"))
    seeded = World(tmp_path / "seed", "seed", monkeypatch, capsys, R14)
    told = {
        topic["topic"]: topic.get("review")
        for topic in seeded.run("linear-algebra", "map", day="2026-11-08")["topics"]
    }
    assert told["span"] > "2026-11-12"
    answer = {
        "topics": ["span"],
        "text": "Whether (1, 2) is in the span of (2, 4) and (1, 1)",
        "response": "No, it is not a multiple of (2, 4)",
        "help": "none",
        "result": "incorrect",
    }
    monkeypatch.setenv("LEARNING_TODAY", "2026-11-09")
    monkeypatch.setattr(
        sys, "stdin", io.StringIO(json.dumps({"observations": [answer]}))
    )
    assert main(["--workspace", str(seeded.roots["linear-algebra"]), "save"]) == 0
    capsys.readouterr()
    span = next(
        topic
        for topic in seeded.run("linear-algebra", "map", day="2026-11-09")["topics"]
        if topic["topic"] == "span"
    )
    assert span["review"] < told["span"]
    assert span["moved"] == {"from": told["span"], "by": "answered"}, span


def test_a_save_receipt_names_each_start_his_study_moved_today(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A save's receipt lists each first lesson his study today moved off a
    day he was told, with its new day and the move the map gives, so the
    close that follows says it (round 15, m2: a partly right Binomial review
    moved Poisson's start from tomorrow to 13 Nov, and neither the close nor
    the page said so; on the new plan, round 18, Linear maps' start moves
    when Basis and dimension slips on its day)."""
    slipped = World(tmp_path, "seed", monkeypatch, capsys, R14)
    linear_maps, receipt = slip_basis(slipped)
    assert linear_maps["moved"]["by"] == "study", linear_maps
    titles = {
        topic["topic"]: topic["title"]
        for topic in slipped.run("linear-algebra", "map", day="2026-11-09")["topics"]
    }
    assert receipt["starts_moved"]["linear-maps"] == {
        "title": titles["linear-maps"],
        "starts": linear_maps["starts"],
        "moved": {
            **linear_maps["moved"],
            "waits_on": [titles[key] for key in linear_maps["moved"]["waits_on"]],
        },
    }, receipt


def test_a_lesson_he_works_on_today_stays_today(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A save inside a begun lesson never moves the lesson off today, and the
    map gives the study day it goes on after today, the one a close names
    (round 14, m2: the Random variables review inside the Poisson lesson
    moved the lesson from 10 to 11 Nov while it was open)."""
    seeded = World(tmp_path, "lesson-mid", monkeypatch, capsys, R14)
    poisson = next(
        topic
        for topic in seeded.run("probability", "map", day="2026-11-10")["topics"]
        if topic["topic"] == "poisson"
    )
    assert poisson["starts"] == "2026-11-10", poisson
    assert poisson["starts_why"] == {"kind": "begun", "then": "2026-11-11"}
    assert "moved" not in poisson


EVE = json.loads((Path(__file__).parent / "golden" / "exam-eve.json").read_text())


def test_a_start_whose_need_comes_only_on_the_eve_is_not_ready(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Two days before the exam, Variance waits on Expectation, which starts
    that day: what it needs won't be solid in time, never a full pace; the
    final review, at his limit every day, is full (round 13, 1 n4). Since a
    day he started nothing no longer lowers his pace (round 18, M1), the eve
    has room: Variance starts there, after Expectation's first review, never
    on the day Expectation starts, and is named as too late for a review
    before the exam (the reason itself: test_agenda's not_ready)."""
    world = {"checkpoints": {"eve": EVE}, "steady": WORLD["steady"]}
    eve = World(tmp_path, "eve", monkeypatch, capsys, world).plan("2026-11-17")
    plan = eve["probability"]["plan"]
    starts = {topic: day["date"] for day in plan["days"] for topic in day["new"]}
    first = {
        topic: day["date"] for day in reversed(plan["days"]) for topic in day["reviews"]
    }
    assert starts["expectation"] == "2026-11-17", starts
    assert starts["variance"] == first["expectation"] == "2026-11-18", (starts, first)
    assert not plan.get("does_not_fit")
    assert plan["reasons"]["variance"] == "too_late"
    assert plan["reasons"]["conditional"] == "full"


GUESS = json.loads(
    (Path(__file__).parent / "golden" / "exam-eve-guess.json").read_text()
)


def test_a_right_guess_on_the_eve_keeps_the_starts_that_need_it(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Round 16, 1 M1: on 17 Nov, two days before the Probability exam, a
    right Random variables answer marked Guessing (o23) moved Expectation's
    start that day to 29 Nov and Poisson's next day to 26 Nov. A right
    answer never lowers what a start stands on, so both keep their days:
    since round 18's M1 the higher pace starts both that day, and neither
    is moved."""
    world = {"checkpoints": {"eve": GUESS}, "steady": GUESS}
    eve = World(tmp_path, "eve", monkeypatch, capsys, world)
    starts = {
        topic: day["date"]
        for day in eve.plan("2026-11-17")["probability"]["plan"]["days"]
        for topic in day["new"]
    }
    assert starts["expectation"] == "2026-11-17", starts
    assert starts["poisson"] == "2026-11-17", starts
    shown = {
        topic["topic"]: topic
        for topic in eve.run("probability", "map", day="2026-11-17")["topics"]
    }
    assert "moved" not in shown["expectation"] and "moved" not in shown["poisson"]


FIRST_GUESS = json.loads(
    (Path(__file__).parent / "golden" / "exam-eve-first-guess.json").read_text()
)


def test_a_right_guess_on_a_topic_never_solid_keeps_tomorrow_s_start(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Round 16, 1 M1, on the seeded world: two days before the exam, a right
    Random variables answer marked Guessing on a topic he had only ever got
    right with help. Its review after help fell on the exam day and went past
    it, so Random variables could not be solid in time and Expectation's
    start, told for 18 Nov, left the plan. A helped answer comes back before
    the exam, on its eve, so the start keeps its day."""
    world = {"checkpoints": {"eve": FIRST_GUESS}, "steady": FIRST_GUESS}
    eve = World(tmp_path, "eve", monkeypatch, capsys, world)

    def starts() -> dict[str, str]:
        return {
            topic: day["date"]
            for day in eve.plan("2026-11-17")["probability"]["plan"]["days"]
            for topic in day["new"]
        }

    assert starts().get("expectation") == "2026-11-18"
    answer = {
        "topics": ["random-variables"],
        "text": "Found P(X=4) for the larger of two dice as P(X<=4)-P(X<=3)",
        "response": "16/36-9/36=7/36",
        "result": "correct",
        "help": "none",
        "sure": "guess",
    }
    monkeypatch.setenv("LEARNING_TODAY", "2026-11-17")
    monkeypatch.setattr(
        sys, "stdin", io.StringIO(json.dumps({"observations": [answer]}))
    )
    assert main(["--workspace", str(eve.roots["probability"]), "save"]) == 0
    receipt = json.loads(capsys.readouterr().out)
    assert "expectation" not in receipt.get("starts_moved", {}), receipt
    assert starts().get("expectation") == "2026-11-18"


def test_a_slip_on_the_eve_says_it_moved_this_morning_s_start_past_the_exam(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Round 16, 1 M1: after days off, the plan he was told this morning is
    the one made afresh today. When his answer today is a real slip, the
    start it moves moved from today, by his study, and its receipt says it
    now falls after the exam; before, Expectation read "Moved from 14 Nov,
    no study since 10 Nov" and the close said nothing."""
    slipped = json.loads(json.dumps(GUESS))
    answer = slipped["probability"]["observations"]["o23"]
    answer["result"] = "incorrect"
    del answer["sure"]
    world = {"checkpoints": {"eve": slipped}, "steady": slipped}
    eve = World(tmp_path, "eve", monkeypatch, capsys, world)
    expectation = next(
        topic
        for topic in eve.run("probability", "map", day="2026-11-17")["topics"]
        if topic["topic"] == "expectation"
    )
    assert expectation["starts"] > "2026-11-19", expectation
    assert expectation["moved"] == {
        "from": "2026-11-17",
        "by": "study",
        "courses": ["Probability"],
        "day": "today",
        "waits_on": ["random-variables"],
    }, expectation
    monkeypatch.setenv("LEARNING_TODAY", "2026-11-17")
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps({"focus": None})))
    assert main(["--workspace", str(eve.roots["probability"]), "save"]) == 0
    receipt = json.loads(capsys.readouterr().out)
    moved = receipt["starts_moved"]["expectation"]
    assert moved["past_exam"] is True, receipt
    assert moved["moved"]["waits_on"] == ["Random variables and distributions"]


R17 = json.loads(
    (Path(__file__).parent / "golden" / "demo-world-r17.json").read_text(
        encoding="utf-8"
    )
)


def test_a_hinted_right_answer_settled_on_his_own_keeps_today_s_start(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Round 17, 1 M1: in the 8 Nov review he answered Random variables right
    after a hint, then the review's second question right on his own and
    sure. Expectation, which needs it, was planned today and moved to 15 Nov
    "since Random variables is not solid yet". The second question is what
    settles a hinted right answer, so the start keeps today. Since round
    18's M1 Expectation starts on 9 Nov, so it plays then."""
    seeded = World(tmp_path, "seed", monkeypatch, capsys, R17)

    def expectation() -> dict[str, Any]:
        return next(
            topic
            for topic in seeded.run("probability", "map", day="2026-11-09")["topics"]
            if topic["topic"] == "expectation"
        )

    assert expectation()["starts"] == "2026-11-09"
    answers = [
        {
            "topics": ["random-variables"],
            "text": "Wrote the distribution of the larger of two dice, "
            "$P(X=k) = \\frac{2k-1}{36}$, counting an L-shape of cells in the grid",
            "response": "P(X=k) = (2k-1)/36, k = 1..6",
            "help": "Suggested a 6-by-6 grid and marking the cells where the "
            "larger number is exactly 3",
            "result": "correct",
        },
        {
            "topics": ["random-variables"],
            "text": "Found $P(X \\text{ even}) = \\frac{1}{3}$ for the number of "
            "tosses until the first head",
            "response": "1/3: P(X=2k) = (1/2)^(2k), sum (1/4)/(1-1/4)",
            "help": "none",
            "result": "correct",
            "sure": "confident",
        },
    ]
    for answer in answers:
        monkeypatch.setenv("LEARNING_TODAY", "2026-11-09")
        monkeypatch.setattr(
            sys, "stdin", io.StringIO(json.dumps({"observations": [answer]}))
        )
        assert main(["--workspace", str(seeded.roots["probability"]), "save"]) == 0
        receipt = json.loads(capsys.readouterr().out)
    assert "expectation" not in receipt.get("starts_moved", {}), receipt
    found = expectation()
    assert (found["starts"], found.get("moved")) == ("2026-11-09", None), found


def test_a_day_his_answers_left_without_a_start_keeps_his_pace_and_the_exam(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Round 17, 1 M2: on 9 Nov his Linear Algebra review left Homomorphisms
    not solid, which moved Linear maps, the day's one start, to 11 Nov. With
    no new answer, the next morning read the day as one he stopped short of
    a start: Monday's pace fell from 1.5 to 1.0, the plan was made afresh,
    and Variance, then planned before the exam, fell after it. A day his own
    answers left without a start says nothing of his pace, and the night
    moves only what it left. Since round 18's M1 the day also held
    Expectation's start, which he left: only what stands on it may leave
    the exam."""
    world = World(tmp_path, "d9-end", monkeypatch, capsys, R17)
    evening = world.run(
        "probability", "plan", "--all", "--days", "30", day="2026-11-09"
    )
    morning = world.run(
        "probability", "plan", "--all", "--days", "30", day="2026-11-10"
    )

    def lost(found: dict[str, Any]) -> list[str]:
        return next(
            course["plan"].get("does_not_fit", [])
            for course in found["courses"]
            if Path(course["workspace"]).name == "probability"
        )

    assert morning["capacity"]["new_per_day"] == evening["capacity"]["new_per_day"]
    assert "variance" not in lost(evening) and "variance" not in lost(morning)
    needs = {
        topic["topic"]: topic.get("needs", [])
        for topic in world.run("probability", "map", day="2026-11-10")["topics"]
    }

    def stands_on(key: str, root: str) -> bool:
        return any(need == root or stands_on(need, root) for need in needs[key])

    left = set(lost(morning)) - set(lost(evening))
    assert all(stands_on(key, "expectation") for key in left), left


R18 = json.loads(
    (Path(__file__).parent / "golden" / "demo-world-r18.json").read_text(
        encoding="utf-8"
    )
)


HINTED = {
    "topics": ["random-variables"],
    "text": "Wrote the distribution of the larger of two dice, "
    "$P(X=k) = \\frac{2k-1}{36}$, counting an L-shape of cells in the grid",
    "response": "P(X=k) = (2k-1)/36, k = 1..6",
    "help": "Count how many of the 36 equally likely ordered pairs have larger "
    "entry exactly k",
    "result": "correct",
}


@pytest.mark.parametrize(
    ("after", "stays"),
    [
        (None, True),
        (
            {
                "topics": ["random-variables"],
                "text": "Added the masses of the even outcomes and got 7/10",
                "response": "2/10 + 4/10 = 7/10",
                "help": "none",
                "result": "partial",
                "sure": "confident",
            },
            False,
        ),
    ],
)
def test_a_hinted_right_answer_not_yet_settled_keeps_today_s_start(
    after: dict[str, Any] | None,
    stays: bool,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Round 18, M4 (2 D2): in the 8 Nov Probability review he answered
    Random variables right after a hint, and Expectation, planned today and
    needing it, left Home at that save, before any answer settled the hint.
    A hinted right answer waits for the answer that settles it: until one
    comes, today's start stays where he was told. A partly right answer
    after it is what moves it, and the receipt names that move for the
    close. Since round 18's M1 Expectation starts on 9 Nov, so it plays
    then."""
    seeded = World(tmp_path, "seed", monkeypatch, capsys, R18)

    def expectation() -> dict[str, Any]:
        return next(
            topic
            for topic in seeded.run("probability", "map", day="2026-11-09")["topics"]
            if topic["topic"] == "expectation"
        )

    assert expectation()["starts"] == "2026-11-09"
    for answer in [HINTED, *([after] if after else [])]:
        monkeypatch.setenv("LEARNING_TODAY", "2026-11-09")
        monkeypatch.setattr(
            sys, "stdin", io.StringIO(json.dumps({"observations": [answer]}))
        )
        assert main(["--workspace", str(seeded.roots["probability"]), "save"]) == 0
        receipt = json.loads(capsys.readouterr().out)
    found = expectation()
    if stays:
        assert "expectation" not in receipt.get("starts_moved", {}), receipt
        assert (found["starts"], found.get("moved")) == ("2026-11-09", None), found
    else:
        moved = receipt["starts_moved"]["expectation"]
        assert moved["moved"]["from"] == "2026-11-09", moved
        assert moved["starts"] == found["starts"] > "2026-11-09", (moved, found)


@pytest.mark.parametrize(
    ("checkpoint", "day"),
    [("seed", "2026-11-08"), ("d9-end", "2026-11-09"), ("d9-end", "2026-11-10")],
)
def test_a_moved_day_s_reason_fits_the_way_it_moved(
    checkpoint: str,
    day: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Round 17, 1 m1 and 2 m3: "you start Expectation and linearity, moved
    from Sunday 15 November because yesterday's plan was not finished" came
    forward, and Diagonalization read "Moved from 27 Nov, yesterday's plan was
    not finished" on 26 Nov. A day that came forward names no delay: what he
    left or missed moves a day later, a topic it waits on slipping moves it
    later, and only his study today brings one forward."""
    world = World(tmp_path, checkpoint, monkeypatch, capsys, R17)
    moves = 0
    for name, shown in world.maps(day).items():
        for topic in shown["topics"]:
            move = topic.get("moved")
            if not move:
                continue
            moves += 1
            now = topic.get("starts") or topic.get("review")
            if move["from"] > now:
                assert move["by"] in ("study", "answered"), (name, topic["topic"], move)
                assert "waits_on" not in move, (name, topic["topic"], move)
            else:
                assert "ready" not in move, (name, topic["topic"], move)
    assert moves, "the day moves something"


def test_a_check_in_a_side_question_keeps_its_topic_s_first_lesson(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Round 17, m3 (4 minor 4): in the Linear maps lesson he asked why
    similar matrices have the same eigenvalues and answered the tutor's check
    at Guessing. Similar matrices, never started, then read "Right, but a
    guess" with no Start, and Diagonalization moved "since Similar matrices
    is not solid yet". An answer given inside another topic's lesson
    (``aside``) is kept, and counts once the topic has its own answer: it
    never starts the topic or removes its first lesson."""
    seeded = World(tmp_path, "seed", monkeypatch, capsys, R17)

    def plan() -> tuple[dict[str, str], str]:
        found = seeded.plan("2026-11-08")["linear-algebra"]
        starts = {t: d["date"] for d in found["plan"]["days"] for t in d["new"]}
        # Since round 18's M1 Diagonalization no longer fits before the exam.
        starts |= {t: "does_not_fit" for t in found["plan"].get("does_not_fit", [])}
        level = next(
            t["level"]
            for t in seeded.run("linear-algebra", "map", day="2026-11-08")["topics"]
            if t["topic"] == "similarity"
        )
        return starts, level

    def save(*answers: dict[str, Any]) -> None:
        monkeypatch.setenv("LEARNING_TODAY", "2026-11-08")
        monkeypatch.setattr(
            sys, "stdin", io.StringIO(json.dumps({"observations": list(answers)}))
        )
        assert main(["--workspace", str(seeded.roots["linear-algebra"]), "save"]) == 0
        capsys.readouterr()

    before, level = plan()
    assert level == "new" and "similarity" in before and "diagonalization" in before
    check = {
        "topics": ["similarity"],
        "text": "Told why similar matrices share their eigenvalues",
        "response": "det(P^-1AP - tI) = det(A - tI)",
        "result": "correct",
        "help": "none",
        "sure": "guess",
    }
    save({**check, "aside": True})
    after, level = plan()
    assert level == "new", "the side check started no topic"
    assert after["similarity"] == before["similarity"], "its first lesson keeps its day"
    assert after["diagonalization"] == before["diagonalization"]
    record = json.loads(
        (seeded.roots["linear-algebra"] / ".study" / "course.json").read_text()
    )
    kept = [o for o in record["observations"].values() if o.get("aside")]
    assert [o["topics"] for o in kept] == [["similarity"]], "kept in his history"
    review = {
        "topics": ["eigen"],
        "text": "Found the eigenvalues of a 2 x 2 matrix",
        "response": "3 and -1",
        "result": "correct",
        "help": "none",
        "aside": True,
    }
    save(review)
    record = json.loads(
        (seeded.roots["linear-algebra"] / ".study" / "course.json").read_text()
    )
    latest = record["observations"][f"o{record['next_observation'] - 1}"]
    assert latest["text"] == review["text"]
    assert "aside" not in latest, "an answer on a topic he began is an ordinary one"
    save(
        {**check, "text": "Showed similar matrices share a trace", "sure": "confident"}
    )
    assert plan()[1] != "new", "once he answers it on its own, the topic is started"


def test_a_planned_start_he_did_not_take_keeps_his_pace_and_the_exam(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Round 18, M1 (1 D1): on 8 Nov he took neither planned start, started
    Eigen, which the plan had not proposed, and did more reviews than it
    proposed. The next morning read the day as one he stopped short of his
    starts: Sunday's pace fell from 2.4 to 1.8, the night planned afresh and
    Negative binomial, Poisson and Hypergeometric fell past the exam. A day he started no topic, or did more reviews than
    the plan proposed, spent it elsewhere and says nothing of his new-topic
    pace, so the night keeps every exam topic it held."""
    world = World(tmp_path, "d8-end", monkeypatch, capsys, R18)
    told = world.run("probability", "plan", "--all", "--days", "30", day="2026-11-08")
    now = world.run("probability", "plan", "--all", "--days", "30", day="2026-11-09")

    def lost(found: dict[str, Any]) -> list[str]:
        return next(
            course["plan"].get("does_not_fit", [])
            for course in found["courses"]
            if Path(course["workspace"]).name == "probability"
        )

    assert lost(now) == lost(told)
    assert now["capacity"]["new_per_day"] == told["capacity"]["new_per_day"]
