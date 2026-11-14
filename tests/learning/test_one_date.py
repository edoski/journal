"""One date per review: the day the daily plan puts it, whichever verb reads it."""

from datetime import date, timedelta
import io
import json
from pathlib import Path
import sys
from typing import Any

import pytest

from learning import capacity
from learning.__main__ import main
from learning.capacity import Capacity, Limit, Weekday
from learning.workspace import initialize

TODAY = date(2026, 10, 10)


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


@pytest.fixture(autouse=True)
def one_review_a_day(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """He studies every day and has shown he gets through one review."""
    monkeypatch.setenv("LEARNING_TODAY", TODAY.isoformat())
    monkeypatch.setenv("VAULT_DIR", str(tmp_path / "vault"))
    weekday = Weekday(1.0, Limit(1.0, True), Limit(1.0, True))
    week = Capacity((weekday,) * 7, frozenset(range(7)), 30.0)
    monkeypatch.setattr(capacity, "of", lambda records, today: week)


def run(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    root: Path,
    *args: str,
    stdin: Any = None,
) -> Any:
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(stdin or {})))
    assert main(["--workspace", str(root), *args]) == 0
    return json.loads(capsys.readouterr().out)


def course(root: Path) -> Path:
    root.mkdir()
    initialize(root)
    return root


# Three taught topics memory asks for by today.
TOPICS = {
    key: {"introduced": day(-20), "review": {"due": day(offset)}}
    for key, offset in (("old", -2), ("older", -3), ("today", 0))
}


def test_every_verb_gives_a_review_the_day_the_plan_puts_it(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = course(tmp_path / "algebra")
    run(monkeypatch, capsys, root, "save", stdin={"topics": TOPICS})
    plan = run(monkeypatch, capsys, root, "plan", "--days", "7")["courses"][0]
    first: dict[str, str] = {}
    for planned in plan["plan"]["days"]:
        for topic in planned["reviews"]:
            first.setdefault(topic, planned["date"])
    assert sorted(first.values()) == [day(0), day(1), day(2)]
    tonight = [topic for topic, when in first.items() if when == day(0)]

    topics = run(monkeypatch, capsys, root, "map")["topics"]
    assert {item["topic"]: item["review"] for item in topics} == first
    assert [item["topic"] for item in topics if "overdue" in item] == tonight

    resume = run(monkeypatch, capsys, root, "resume")
    assert [item["topic"] for item in resume["due"]] == tonight
    assert {item["topic"]: item["planned"] for item in resume["due_later"]} == {
        topic: when for topic, when in first.items() if topic not in tonight
    }
    assert [item["topic"] for item in plan["due"]] == tonight
    assert {item["topic"]: item["planned"] for item in plan["upcoming"]} == {
        topic: when for topic, when in first.items() if topic not in tonight
    }


def test_a_save_tells_the_day_the_plan_puts_the_next_review(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = course(tmp_path / "algebra")
    run(monkeypatch, capsys, root, "save", stdin={"topics": TOPICS})
    missed = {
        "topics": ["today"],
        "text": "q",
        "help": "none",
        "result": "incorrect",
    }
    receipt = run(monkeypatch, capsys, root, "save", stdin={"observations": [missed]})
    assert receipt["reviews"]["today"]["due"] == day(1)
    topics = run(monkeypatch, capsys, root, "map")["topics"]
    review = {item["topic"]: item["review"] for item in topics}
    assert receipt["reviews"]["today"]["planned"] == review["today"]
    assert review["today"] > day(1)
    assert receipt["due_count"] == 0
    shown = run(monkeypatch, capsys, root, "show", "today")["items"]["today"]
    assert shown["review"] == {
        **shown["review"],
        "due": day(1),
        "planned": review["today"],
    }


def test_a_new_course_s_whole_path_is_planned_up_to_its_exam(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = course(tmp_path / "graphs")
    order = [f"t{index}" for index in range(8)]
    built = {
        "exam": {"date": day(30)},
        "topics": {
            key: {"title": key.upper(), **({"needs": [order[0]]} if index else {})}
            for index, key in enumerate(order)
        },
        "path": {"order": order},
    }
    run(monkeypatch, capsys, root, "save", stdin=built)
    plan = run(monkeypatch, capsys, root, "plan", "--days", "30")["courses"][0]
    starts = {
        topic: planned["date"]
        for planned in plan["plan"]["days"]
        for topic in planned["new"]
    }
    assert set(starts) == set(order) and max(starts.values()) < day(30)
    assert run(monkeypatch, capsys, root, "resume")["starts"] == starts
    topics = run(monkeypatch, capsys, root, "map")["topics"]
    assert {item["topic"]: item["starts"] for item in topics} == starts


def test_the_map_says_why_a_review_waits_and_since_when(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    exam = course(tmp_path / "exam")
    free = course(tmp_path / "free")
    due = {"topic": {"introduced": day(-20), "review": {"due": day(0)}}}
    run(
        monkeypatch,
        capsys,
        exam,
        "save",
        stdin={"title": "Probability", "topics": due, "exam": {"date": day(3)}},
    )
    run(monkeypatch, capsys, free, "save", stdin={"topics": due})

    exams = run(monkeypatch, capsys, exam, "map")
    assert [(item["review"], "held" in item) for item in exams["topics"]] == [
        (day(0), False)
    ]
    assert exams["exam"]["final_review"] == day(-3)
    frees = run(monkeypatch, capsys, free, "map")["topics"]
    assert [
        (item["review"], item.get("held"), item.get("held_for"), item.get("due"))
        for item in frees
    ] == [(day(1), True, "Probability", day(0))]


def test_the_map_names_the_topics_a_final_review_has_no_room_for(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = course(tmp_path / "c")
    topics = {
        key: {"introduced": day(-20), "review": {"due": day(0)}}
        for key in ("a", "b", "c")
    }
    order = {"order": ["a", "b", "c"]}
    exam = {"date": day(2)}
    run(
        monkeypatch,
        capsys,
        root,
        "save",
        stdin={"topics": topics, "path": order, "exam": exam},
    )
    mapped = run(monkeypatch, capsys, root, "map")
    assert mapped["exam"]["unreviewed"] == ["c"]
    planned = run(monkeypatch, capsys, root, "plan", "--days", "3")["courses"][0]
    assert planned["plan"]["unreviewed"] == ["c"]
