"""An exam with several sessions: ``exam.sessions`` lists the days it is
held, earliest first, and ``exam.date`` is the one he aims at. Once that day
has gone by with a later session listed, the plan aims at the next one ahead
(``progress.aimed``) until he says how it went: passed ends the run-up, not
this time confirms the next session."""

from pathlib import Path
from typing import Any

import pytest

from learning import records, schema
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
