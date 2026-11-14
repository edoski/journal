"""`standing`: exam readiness by part and each topic's open mistakes, read only."""

from datetime import date, timedelta
import io
import json
from pathlib import Path
import sys
from typing import Any

import pytest

from learning import capacity, records, retrieval
from learning.__main__ import main
from learning.capacity import Capacity, Limit, Weekday
from learning.workspace import Workspace, initialize

TODAY = date(2026, 10, 10)


@pytest.fixture(autouse=True)
def pinned_day(monkeypatch: pytest.MonkeyPatch, every_day: None) -> None:
    monkeypatch.setenv("LEARNING_TODAY", TODAY.isoformat())


@pytest.fixture
def workspace(tmp_path: Path) -> Workspace:
    return Workspace(tmp_path)


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def attempt(topic: str, offset: int, **fields: Any) -> dict[str, Any]:
    return {
        "topics": [topic],
        "text": fields.pop("text", f"Answered {topic}"),
        "help": fields.pop("help", "none"),
        "result": fields.pop("result", "correct"),
        "date": day(offset),
        **fields,
    }


ARCS = {
    "spaces": {
        "title": "Vector spaces",
        "question": "What can vectors build?",
        "purpose": "Describe a space by a few vectors.",
    },
    "maps": {
        "title": "Linear maps",
        "question": "What does a matrix do?",
        "purpose": "Read what a matrix keeps.",
    },
}


def standing(workspace: Workspace) -> dict[str, Any]:
    return retrieval.course_standing(workspace)


def test_without_an_exam_there_is_no_readiness_and_mistakes_still_show(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "topics": {"span": {"title": "Span", "introduced": day(-3)}},
            "observations": [attempt("span", -1, result="incorrect")],
        },
    )
    result = standing(workspace)
    assert "readiness" not in result
    assert [entry["topic"] for entry in result["mistakes"]] == ["span"]


def test_a_past_exam_has_no_readiness(workspace: Workspace) -> None:
    records.save(workspace, {"exam": {"date": day(-1)}, "topics": {"span": {}}})
    assert "readiness" not in standing(workspace)


def test_one_part_without_arcs_sorts_every_topic_for_the_exam(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    weekday = Weekday(1.0, Limit(1.0, True), Limit(1.0, True))
    week = Capacity((weekday,) * 7, frozenset(range(7)), 30.0)
    monkeypatch.setattr(capacity, "of", lambda records, today: week)
    names = [f"t{index}" for index in range(12)]
    records.save(
        workspace,
        {
            "exam": {"date": day(4)},
            "path": {"order": ["held", "shaky", "lapsed", *names]},
            "topics": {
                "held": {"introduced": day(-20)},
                "shaky": {"introduced": day(-5)},
                "lapsed": {"introduced": day(-20)},
                **{name: {"title": name.upper()} for name in names},
            },
            "observations": [
                attempt("held", -3),
                attempt("shaky", -2, help="A hint"),
                attempt("lapsed", -10),
                attempt("lapsed", -2, result="incorrect"),
            ],
        },
    )
    readiness = standing(workspace)["readiness"]
    assert (readiness["date"], readiness["days_left"]) == (day(4), 4)
    [part] = readiness["parts"]
    assert "arc" not in part
    assert part["solid"] == ["held"]
    assert part["not_yet"] == ["shaky", "lapsed"]
    assert part["wont_fit"] and part["to_start"]
    assert part["to_start"] + part["wont_fit"] == names
    assert part["wont_fit"][-1] == names[-1]


def test_a_topic_the_map_calls_weak_is_not_yet_solid_for_the_exam(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "exam": {"date": day(30)},
            "path": {"order": ["sure", "slips"]},
            "topics": {
                "sure": {"introduced": day(-20)},
                "slips": {
                    "introduced": day(-20),
                    "gap": "Treats pairwise non-parallel vectors as independent",
                },
            },
            "observations": [attempt("sure", -3), attempt("slips", -3)],
        },
    )
    [part] = standing(workspace)["readiness"]["parts"]
    assert part["solid"] == ["sure"]
    assert part["not_yet"] == ["slips"]


def test_a_topic_not_solid_lately_in_the_run_up_is_not_yet(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "exam": {"date": day(10)},
            "topics": {
                "old": {"introduced": day(-60)},
                "fresh": {"introduced": day(-60)},
            },
            "observations": [
                attempt("old", -50),
                attempt("old", -30),
                attempt("fresh", -50),
                attempt("fresh", -3),
            ],
        },
    )
    [part] = standing(workspace)["readiness"]["parts"]
    assert part == {"solid": ["fresh"], "not_yet": ["old"]}


def course_with_arcs(workspace: Workspace, exam: dict[str, Any]) -> None:
    records.save(
        workspace,
        {
            "exam": exam,
            "arcs": ARCS,
            "arc_change": {"reason": "Two chapters"},
            "path": {
                "arcs": ["spaces", "maps"],
                "order": ["span", "basis", "rank", "kernel"],
            },
            "topics": {
                "span": {"arc": "spaces", "introduced": day(-20)},
                "basis": {"arc": "spaces", "introduced": day(-20), "needs": ["span"]},
                "rank": {"arc": "maps", "introduced": day(-5), "needs": ["basis"]},
                "kernel": {"arc": "maps", "needs": ["rank"]},
            },
            "observations": [attempt("span", -2), attempt("basis", -2, help="A hint")],
        },
    )


def test_each_arc_the_exam_examines_is_a_part_in_study_order(
    workspace: Workspace,
) -> None:
    course_with_arcs(workspace, {"date": day(30), "arcs": None})
    parts = standing(workspace)["readiness"]["parts"]
    assert parts == [
        {
            "arc": "spaces",
            "title": "Vector spaces",
            "solid": ["span"],
            "not_yet": ["basis"],
        },
        {
            "arc": "maps",
            "title": "Linear maps",
            "not_yet": ["rank"],
            "to_start": ["kernel"],
        },
    ]


def test_an_arc_off_the_exam_and_a_topic_it_leaves_out_are_not_parts_of_it(
    workspace: Workspace,
) -> None:
    course_with_arcs(
        workspace, {"date": day(30), "arcs": ["maps"], "leaves_out": ["kernel"]}
    )
    assert standing(workspace)["readiness"]["parts"] == [
        {"arc": "maps", "title": "Linear maps", "not_yet": ["rank"]}
    ]


def test_an_open_mistake_says_what_went_wrong_where_and_how(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "topics": {
                "rank": {
                    "title": "Rank",
                    "introduced": day(-5),
                    "gap": "You count the vectors, not the dimension of their span",
                },
                "basis": {"title": "Basis", "introduced": day(-5)},
            },
            "sources": {"sheet": {"path": "sheet3.pdf", "title": "Sheet 3"}},
            "tasks": {"ex5": {"title": "Exercise 5", "topics": ["rank"]}},
            "observations": [
                attempt(
                    "rank",
                    -1,
                    text="Gave rank 3 for a matrix with a dependent third row",
                    response="rank = 3",
                    help="Pointed at the third row",
                    result="partial",
                    task="ex5",
                    refs=[{"source": "sheet", "locator": "Exercise 5(b)"}],
                ),
                attempt(
                    "basis", -3, result="incorrect", sure="confident", chose="rank"
                ),
            ],
        },
    )
    rank, basis = standing(workspace)["mistakes"]
    assert rank == {
        "topic": "rank",
        "title": "Rank",
        "gap": "You count the vectors, not the dimension of their span",
        "judged": TODAY.isoformat(),
        "latest": TODAY.isoformat(),
        "answers": [
            {
                "id": "o1",
                "date": day(-1),
                "text": "Gave rank 3 for a matrix with a dependent third row",
                "response": "rank = 3",
                "result": "partial",
                "helped": True,
                "task": "Exercise 5",
                "where": [{"source": "Sheet 3", "locator": "Exercise 5(b)"}],
            }
        ],
    }
    assert basis["latest"] == day(-3)
    assert basis["answers"][0] | {"text": ""} == {
        "id": "o2",
        "date": day(-3),
        "text": "",
        "result": "incorrect",
        "helped": False,
        "confident": True,
        "chose": "rank",
    }


def test_only_a_right_answer_on_his_own_closes_a_mistake(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "topics": {
                key: {"introduced": day(-9)} for key in ("fixed", "helped", "again")
            },
            "observations": [
                attempt("fixed", -4, result="incorrect"),
                attempt("fixed", -2),
                attempt("helped", -4, result="incorrect"),
                attempt("helped", -2, help="The first step"),
                attempt("again", -6, result="incorrect", text="First miss"),
                attempt("again", -4),
                attempt("again", -2, result="partial", text="Second miss"),
                attempt("again", -1, result="incorrect", text="Third miss"),
            ],
        },
    )
    mistakes = {entry["topic"]: entry for entry in standing(workspace)["mistakes"]}
    assert set(mistakes) == {"helped", "again"}
    assert [answer["text"] for answer in mistakes["again"]["answers"]] == [
        "Third miss",
        "Second miss",
    ]
    assert [entry["topic"] for entry in standing(workspace)["mistakes"]] == [
        "again",
        "helped",
    ]


def test_a_gap_stays_open_until_he_answers_it_right_on_his_own(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "topics": {
                "solved": {"introduced": day(-9), "gap": "Mixes the signs"},
                "carried": {"introduced": day(-9), "gap": "Mixes the order"},
            },
            "observations": [
                attempt("solved", 0, result="incorrect"),
                attempt("carried", 0, result="incorrect"),
            ],
        },
    )
    records.save(
        workspace,
        {
            "observations": [
                attempt("solved", 0),
                attempt("carried", 0, help="Worked the first line"),
            ]
        },
    )
    mistakes = standing(workspace)["mistakes"]
    assert [(entry["topic"], entry.get("gap")) for entry in mistakes] == [
        ("carried", "Mixes the order")
    ]


def test_predictions_corrected_answers_and_left_out_topics_are_no_mistakes(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "topics": {
                "guess": {"introduced": day(-3)},
                "remarked": {"introduced": day(-3)},
                "dropped": {"introduced": day(-3), "excluded": "Not on the exam"},
            },
        },
    )
    records.save(
        workspace,
        {
            "observations": [
                attempt("guess", -2, result="incorrect", predicted=True),
                attempt("remarked", -2, result="incorrect"),
                attempt("dropped", -2, result="incorrect"),
            ],
        },
    )
    records.save(
        workspace,
        {
            "observations": [
                attempt(
                    "remarked",
                    -2,
                    corrects=["o2"],
                    disputed="The sign was fine",
                    ruling="It was right",
                ),
            ]
        },
    )
    assert standing(workspace)["mistakes"] == []


def test_standing_is_a_read_only_verb(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = tmp_path / "course"
    root.mkdir()
    initialize(root)
    records.save(
        Workspace(root),
        {
            "exam": {"date": day(20)},
            "topics": {"span": {"introduced": day(-3)}},
            "observations": [attempt("span", -1, result="incorrect")],
        },
    )
    stored = (root / ".study" / "course.json").read_bytes()
    monkeypatch.setattr(sys, "stdin", io.StringIO(""))
    assert main(["--workspace", str(root), "standing"]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result["readiness"]["parts"] == [{"not_yet": ["span"]}]
    assert result["mistakes"][0]["topic"] == "span"
    assert (root / ".study" / "course.json").read_bytes() == stored
