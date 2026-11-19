"""An exam with several sessions: ``exam.sessions`` lists the days it is
held, earliest first, and ``exam.date`` is the one he aims at. Once that day
has gone by with a later session listed, the plan aims at the next one ahead
(``progress.aimed``) until he says how it went: passed ends the run-up, not
this time confirms the next session."""

from datetime import date
from pathlib import Path
from typing import Any

import pytest

from learning import agenda, capacity, mcp, planning, records, retrieval, schema
from learning.workspace import Workspace

SESSIONS = ["2026-12-21", "2027-01-19", "2027-02-03"]


@pytest.fixture
def workspace(tmp_path: Path) -> Workspace:
    return Workspace(tmp_path)


def on(monkeypatch: pytest.MonkeyPatch, day: str) -> None:
    monkeypatch.setenv("LEARNING_TODAY", day)


def course(**exam: Any) -> dict[str, Any]:
    return {
        "title": "Artificial Intelligence",
        "topics": {
            "search": {"title": "Search"},
            "logic": {"title": "Logic", "needs": ["search"]},
        },
        "exam": {"date": SESSIONS[0], "sessions": SESSIONS, **exam},
    }


def stored(workspace: Workspace) -> dict[str, Any]:
    return records.read(workspace)["exam"]


def test_an_exam_lists_its_sessions_and_aims_at_one(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    on(monkeypatch, "2026-11-19")
    records.save(workspace, course())
    assert stored(workspace) == {"date": SESSIONS[0], "sessions": SESSIONS}


@pytest.mark.parametrize(
    ("sessions", "fault"),
    [
        (["2027-01-19", "2026-12-21"], "earliest first"),
        (["2026-12-21", "2026-12-21"], "each day once"),
        (["2027-01-19", "2027-02-03"], "must be one of exam.sessions"),
    ],
)
def test_sessions_are_ascending_days_that_hold_the_aimed_one(
    sessions: list[str], fault: str
) -> None:
    record = {**schema.empty(), "exam": {"date": SESSIONS[0], "sessions": sessions}}
    with pytest.raises(ValueError, match=fault):
        schema.validate_record(record)


def test_a_save_may_not_write_the_plans_move(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    on(monkeypatch, "2026-11-19")
    with pytest.raises(ValueError, match="past"):
        records.save(workspace, course(past=SESSIONS[0]))


def test_moving_to_another_listed_session_keeps_the_exams_scope(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    on(monkeypatch, "2026-11-19")
    records.save(
        workspace, {**course(), "exam": {**course()["exam"], "leaves_out": ["logic"]}}
    )
    records.save(workspace, {"exam": {"date": SESSIONS[1]}})
    assert stored(workspace)["date"] == SESSIONS[1]
    assert stored(workspace)["leaves_out"] == ["logic"]
    with pytest.raises(ValueError, match="exam.leaves_out"):
        records.save(workspace, {"exam": {"date": "2027-03-01"}})


def attempt(topic: str = "search") -> dict[str, Any]:
    return {"topics": [topic], "text": "Ran BFS", "help": "none", "result": "correct"}


def test_on_its_day_the_exam_aims_at_the_session_it_names(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    on(monkeypatch, "2026-11-19")
    records.save(workspace, course())
    on(monkeypatch, SESSIONS[0])
    assert records.load(workspace)["exam"]["date"] == SESSIONS[0]
    assert "past" not in records.load(workspace)["exam"]


def test_once_the_day_goes_by_the_plan_aims_at_the_next_session(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    on(monkeypatch, "2026-11-19")
    records.save(workspace, course())
    on(monkeypatch, "2026-12-22")
    exam = records.load(workspace)["exam"]
    assert (exam["date"], exam["past"]) == (SESSIONS[1], SESSIONS[0])
    assert stored(workspace)["date"] == SESSIONS[0], "a read writes nothing"
    on(monkeypatch, "2027-01-20")
    exam = records.load(workspace)["exam"]
    assert (exam["date"], exam["past"]) == (SESSIONS[2], SESSIONS[1])


def test_a_save_keeps_the_aim_until_he_says_how_it_went(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    on(monkeypatch, "2026-11-19")
    records.save(workspace, course())
    on(monkeypatch, "2026-12-22")
    records.save(workspace, {"observations": [attempt()]})
    assert stored(workspace) == {
        "date": SESSIONS[1],
        "sessions": SESSIONS,
        "past": SESSIONS[0],
    }


def test_not_this_time_confirms_the_next_session(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    on(monkeypatch, "2026-11-19")
    records.save(workspace, course())
    on(monkeypatch, "2026-12-22")
    records.save(workspace, {"exam": {"date": SESSIONS[1]}})
    assert stored(workspace) == {"date": SESSIONS[1], "sessions": SESSIONS}


def test_passed_ends_the_exams_run_up(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    on(monkeypatch, "2026-11-19")
    records.save(workspace, course())
    on(monkeypatch, "2026-12-22")
    records.save(workspace, {"exam": {"date": SESSIONS[0], "sessions": SESSIONS[:1]}})
    exam = stored(workspace)
    assert (exam["date"], exam["sessions"], "past" in exam) == (
        SESSIONS[0],
        SESSIONS[:1],
        False,
    )
    on(monkeypatch, "2027-01-20")
    assert records.load(workspace)["exam"]["date"] == SESSIONS[0]


def test_an_exam_with_one_date_stays_on_it_once_it_has_gone_by(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    on(monkeypatch, "2026-11-19")
    records.save(workspace, {**course(), "exam": {"date": SESSIONS[0]}})
    on(monkeypatch, "2026-12-22")
    exam = records.load(workspace)["exam"]
    assert (exam["date"], "past" in exam) == (SESSIONS[0], False)


def test_the_next_session_gets_its_own_final_review_at_once(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    on(monkeypatch, "2026-11-19")
    records.save(workspace, {**course(), "observations": [attempt(), attempt("logic")]})
    on(monkeypatch, "2026-12-20")
    records.save(workspace, {"observations": [attempt()]})
    kept = stored(workspace)["final_review"]
    assert kept < SESSIONS[0], "a final review under way is kept"
    on(monkeypatch, "2026-12-22")
    exam = retrieval.course_map(workspace)["exam"]
    assert exam["date"] == SESSIONS[1]
    assert SESSIONS[0] < exam["final_review"] < SESSIONS[1]


def test_every_session_up_to_the_aimed_one_holds_nothing() -> None:
    record = {**course(), "exam": {"date": SESSIONS[1], "sessions": SESSIONS}}
    assert capacity.exam_days([record]) == {date.fromisoformat(d) for d in SESSIONS[:2]}


def test_his_answer_on_the_session_moves_no_day_the_aim_already_moved() -> None:
    aimed = {**schema.empty(), "exam": {"date": SESSIONS[1], "past": SESSIONS[0]}}
    confirmed = {**schema.empty(), "exam": {"date": SESSIONS[1]}}
    assert agenda.structure(aimed) == agenda.structure(confirmed)


def test_the_plan_and_the_map_name_the_sessions_and_the_one_gone_by(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    on(monkeypatch, "2026-11-19")
    records.save(workspace, course())
    on(monkeypatch, "2026-12-22")
    shown = {"date": SESSIONS[1], "sessions": SESSIONS, "past": SESSIONS[0]}
    entry = planning.plan(workspace, tmp_path / "vault", everywhere=False, days=3)
    exam = entry["courses"][0]["exam"]
    assert {key: exam[key] for key in shown} == shown
    exam = retrieval.course_map(workspace)["exam"]
    assert {key: exam[key] for key in shown} == shown


def test_the_save_rules_name_every_exam_field() -> None:
    line = next(
        rule for rule in mcp.SAVE_RULES.splitlines() if rule.startswith("- exam {")
    )
    named = line.removeprefix("- exam {").split("}")[0].replace(" ", "").split(",")
    assert named == list(schema.FIELDS["exam"])
