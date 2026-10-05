from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from learning import records
from learning.planning import plan
from learning.workspace import Workspace, initialize
from sync.study.context import journal_summary

TODAY = date(2026, 10, 10)


@pytest.fixture(autouse=True)
def pinned_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEARNING_TODAY", TODAY.isoformat())


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def write_day(vault: Path, when: date, *rows: tuple[str, str]) -> None:
    journal = vault / "journal"
    journal.mkdir(parents=True, exist_ok=True)
    lines = [
        "### **STUDY**",
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |",
        "| --- | --- | --- | --- | --- |",
        *(
            f"| 09:00 - 10:00 | {activity} | {duration} | 0m | 0m |"
            for activity, duration in rows
        ),
    ]
    (journal / f"{when.isoformat()}.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def course(directory: Path, patch: dict[str, Any]) -> Workspace:
    directory.mkdir(parents=True, exist_ok=True)
    workspace = initialize(directory)
    records.save(workspace, patch)
    return workspace


ALGEBRA = {
    "title": "Algebra",
    "exam": {"date": day(23), "format": "Written"},
    "journal": "SMM",
    "topics": {
        "systems": {"review": {"due": day(-2), "prompt": "Solve unaided"}},
        "rank": {"needs": ["systems"], "review": {"due": day(3)}},
        "eigen": {"needs": ["rank"], "review": {"due": day(12)}},
    },
    "path": {"current": "rank"},
    "tasks": {
        "ex5": {"title": "Exercise 5", "step": "Why unique?", "topics": ["rank"]},
        "ex6": {"title": "Exercise 6"},
    },
    "focus": "ex5",
}


def test_plan_joins_reviews_open_work_and_recorded_effort(tmp_path: Path) -> None:
    workspace = course(tmp_path / "algebra", ALGEBRA)
    vault = tmp_path / "vault"
    write_day(vault, TODAY, ("SMM", "1h"), ("Other", "30m"))
    write_day(vault, TODAY - timedelta(days=1), ("SMM", "1h 20m"))
    result = plan(workspace, vault, everywhere=False, days=7)
    assert result["today"] == TODAY.isoformat()
    [entry] = result["courses"]
    assert entry == {
        "workspace": str(workspace.directory),
        "title": "Algebra",
        "exam": {"date": day(23), "days_left": 23},
        "due": [
            {
                "topic": "systems",
                "due": day(-2),
                "overdue": 2,
                "level": "new",
                "prompt": "Solve unaided",
            }
        ],
        "upcoming": [{"topic": "rank", "due": day(3)}],
        "current": "rank",
        "task": {"key": "ex5", "title": "Exercise 5", "step": "Why unique?"},
        "open_tasks": 2,
        "last_activity": {"date": TODAY.isoformat(), "days_ago": 0},
        "journal": {"activity": "SMM", "study_minutes": 140, "sessions": 2},
        "week": {"minutes": 140},
    }
    assert "daily" not in result["journal"]
    assert result["journal"]["by_activity"]["Other"]["study_minutes"] == 30
    wider = plan(workspace, vault, everywhere=False, days=14)
    assert [item["topic"] for item in wider["courses"][0]["upcoming"]] == [
        "rank",
        "eigen",
    ]


def test_unknown_effort_stays_unknown_and_journal_errors_are_contained(
    tmp_path: Path,
) -> None:
    workspace = course(tmp_path / "algebra", ALGEBRA)
    vault = tmp_path / "vault"
    result = plan(workspace, vault, everywhere=False, days=3)
    assert result["courses"][0]["journal"] == {"activity": "SMM"}
    write_day(vault, TODAY, ("Other", "1h"))
    recorded = plan(workspace, vault, everywhere=False, days=3)
    assert recorded["courses"][0]["journal"] == {
        "activity": "SMM",
        "study_minutes": 0,
        "sessions": 0,
    }
    (vault / "journal" / f"{TODAY.isoformat()}.md").write_text(
        "no table\n", encoding="utf-8"
    )
    broken = plan(workspace, vault, everywhere=False, days=3)
    assert "Missing canonical STUDY data" in broken["journal"]["error"]
    assert broken["courses"][0]["journal"] == {"activity": "SMM"}
    assert broken["courses"][0]["title"] == "Algebra"


def test_plan_all_covers_registered_courses_and_contains_broken_ones(
    tmp_path: Path,
) -> None:
    algebra = course(tmp_path / "algebra", ALGEBRA)
    analysis = course(tmp_path / "analysis", {"title": "Analysis"})
    (tmp_path / "empty").mkdir()
    initialize(tmp_path / "empty")
    result = plan(None, tmp_path / "vault", everywhere=True, days=7)
    assert [entry["workspace"] for entry in result["courses"]] == [
        str(algebra.directory),
        str(analysis.directory),
    ]
    assert result["courses"][1] == {
        "workspace": str(analysis.directory),
        "title": "Analysis",
        "open_tasks": 0,
        "last_activity": {"date": TODAY.isoformat(), "days_ago": 0},
    }
    analysis.record.write_text("{", encoding="utf-8")
    broken = plan(algebra, tmp_path / "vault", everywhere=True, days=7)
    assert broken["courses"][1]["workspace"] == str(analysis.directory)
    assert "invalid JSON" in broken["courses"][1]["error"]


def test_plan_of_a_new_course_and_invalid_windows(tmp_path: Path) -> None:
    workspace = Workspace(tmp_path)
    result = plan(workspace, tmp_path / "vault", everywhere=False, days=1)
    assert result["courses"] == [{"workspace": str(tmp_path), "open_tasks": 0}]
    with pytest.raises(ValueError, match="--days"):
        plan(workspace, tmp_path, everywhere=False, days=0)
    with pytest.raises(ValueError, match="--all"):
        plan(None, tmp_path, everywhere=False, days=7)


def test_upcoming_schedule_resolves_overrides_and_excludes_lunch(
    tmp_path: Path,
) -> None:
    today = date(2026, 9, 18)
    journal = tmp_path / "journal"
    journal.mkdir()
    (journal / "PROTOCOL.md").write_text(
        "## SCHEDULE\n"
        "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        "| DEFAULT | 09:00 | 17:00 | 12:00 | 13:00 | 18:00 |\n"
        "| WEEKDAY:SAT | 10:00 | 16:00 | | | |\n"
        "| DATE:2026-09-19 | OFF | OFF | | | |\n"
        "| DATE:2026-09-20 | 14:00 | 16:00 | | | 17:00 |\n",
        encoding="utf-8",
    )
    result = journal_summary(tmp_path, days=1, today=today, horizon=3)
    assert result["upcoming_schedule"] == [
        {
            "date": "2026-09-18",
            "study_windows": [
                {"start": "09:00", "end": "12:00"},
                {"start": "13:00", "end": "17:00"},
            ],
            "is_off_day": False,
            "workout_start": "18:00",
        },
        {
            "date": "2026-09-19",
            "study_windows": [],
            "is_off_day": True,
            "workout_start": None,
        },
        {
            "date": "2026-09-20",
            "study_windows": [{"start": "14:00", "end": "16:00"}],
            "is_off_day": False,
            "workout_start": "17:00",
        },
    ]
    assert result["total_study_minutes"] is None


def test_journal_rejects_invalid_window_lengths(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="horizon"):
        journal_summary(tmp_path, horizon=0)
    with pytest.raises(ValueError, match="days"):
        journal_summary(tmp_path, days=0)
