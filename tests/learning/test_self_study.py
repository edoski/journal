"""A self-study (``preferences.kind``): something he learns on his own, with
no exam and no spaced reviews, done when every topic is taught."""

from datetime import date, timedelta
import json
from pathlib import Path
from typing import Any

import pytest

from learning import migrate, progress, records, retrieval
from learning.planning import plan as plan_courses
from learning.workspace import Workspace, initialize
from tests.learning.test_arc_planning import (
    MONDAY,
    course,
    on,
    plan,
    save,
    starts,
    taught,
    week,
)
from tests.learning.test_arcs import SIX
from tests.learning.test_arcs import course as v6_course

SELF_STUDY = {"preferences": {"kind": "self-study"}}


def self_study() -> dict[str, Any]:
    return save(course(), SELF_STUDY, MONDAY)


def test_a_self_study_schedules_no_review_yet_still_starts_new_topics() -> None:
    record = taught(self_study(), ["a1"], on(-3))
    assert "review" not in record["topics"]["a1"], "no first retrieval"
    assert progress.due(record, on(30)) == []
    result = plan({"c": record}, MONDAY, 10, week(10, 1))
    assert all(not day["reviews"] for day in result.days["c"]), "nothing falls due"
    assert starts(result), "new topics still come"


def test_a_self_study_builds_on_a_prerequisite_that_is_only_taught() -> None:
    held = plan({"c": taught(course(), ["a1"], on(0))}, on(1), 1, week(0, 2))
    assert "a2" not in starts(held), "a course waits for a1's review to make it solid"
    record = taught(self_study(), ["a1"], on(0))
    result = plan({"c": record}, on(1), 1, week(0, 2))
    assert "a2" in starts(result), "a self-study has no review to make a1 solid"


def test_a_self_study_refuses_an_exam_date_naming_the_fix() -> None:
    with pytest.raises(ValueError, match="a self-study has no exam") as error:
        save(self_study(), {"exam": {"date": on(30).isoformat()}}, MONDAY)
    assert '{"preferences": {"kind": "course"}}' in str(error.value)
    examined = course({"date": on(30).isoformat(), "arcs": None})
    with pytest.raises(ValueError, match='remove the exam first with "exam": null'):
        save(examined, SELF_STUDY, MONDAY)
    switched = save(examined, {**SELF_STUDY, "exam": None}, MONDAY)
    assert progress.self_study(switched) and "exam" not in switched


def test_making_a_self_study_a_course_brings_its_reviews_back() -> None:
    record = taught(self_study(), ["a1", "b1"], on(-10))
    assert all("review" not in record["topics"][key] for key in ("a1", "b1"))
    made = save(record, {"preferences": {"kind": "course"}}, MONDAY)
    expected = {
        key: progress.replay(key, made["topics"][key], [], None).due
        for key in ("a1", "b1")
    }
    assert all(expected.values())
    assert {
        key: date.fromisoformat(made["topics"][key]["review"]["due"])
        for key in ("a1", "b1")
    } == expected


def test_kind_is_a_course_preference_with_two_choices() -> None:
    with pytest.raises(ValueError, match='must be "course" or "self-study"'):
        save(course(), {"preferences": {"kind": "hobby"}}, MONDAY)
    with pytest.raises(ValueError, match="global_preferences.kind belongs to one"):
        save(course(), {"global_preferences": {"kind": "self-study"}}, MONDAY)


def test_migrating_down_strips_the_kind_preference(tmp_path: Path) -> None:
    workspace = v6_course(tmp_path, "calculus", SIX)
    migrate.migrate(workspace)
    records.save(workspace, {"preferences": {"kind": "self-study", "tone": "Calm"}})
    migrate.migrate(workspace, to=6)
    down = json.loads(workspace.record.read_text())
    assert down["preferences"] == {"tone": "Calm"}


# --- what the plan and the map say about it ---------------------------------

TODAY = date(2026, 10, 10)


def studied(directory: Path, kind: str | None) -> Workspace:
    directory.mkdir(parents=True)
    workspace = initialize(directory)
    records.save(
        workspace,
        {
            "title": "Rust on my own",
            "goal": "Write a small CLI in Rust",
            "topics": {
                "ownership": {"introduced": (TODAY - timedelta(days=2)).isoformat()},
                "lifetimes": {"needs": ["ownership"]},
            },
            **({"preferences": {"kind": kind}} if kind else {}),
        },
    )
    return workspace


def entry(workspace: Workspace, vault: Path) -> dict[str, Any]:
    courses = plan_courses(workspace, vault, everywhere=False, days=3)["courses"]
    return next(c for c in courses if c["workspace"] == str(workspace.directory))


def test_the_plan_and_map_say_a_self_study_is_done_when_every_topic_is_taught(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LEARNING_TODAY", TODAY.isoformat())
    vault = tmp_path / "vault"
    workspace = studied(tmp_path / "rust", "self-study")
    first = entry(workspace, vault)
    assert (first["kind"], first["goal_reached"]) == ("self-study", False)
    mapped = retrieval.course_map(workspace)
    assert (mapped["kind"], mapped["goal_reached"]) == ("self-study", False)
    records.save(workspace, {"topics": {"lifetimes": {"introduced": True}}})
    assert entry(workspace, vault)["goal_reached"] is True
    assert retrieval.course_map(workspace)["goal_reached"] is True
    plain = entry(studied(tmp_path / "algebra", None), vault)
    assert "kind" not in plain and "goal_reached" not in plain
