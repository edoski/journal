from datetime import date, timedelta
from pathlib import Path

import pytest

from sync.study.context import journal_summary
from learning.records import save
from learning.planning import plan


def write_day(vault: Path, day: date, activity: str = "SMM") -> None:
    journal = vault / "journal"
    journal.mkdir(exist_ok=True)
    (journal / f"{day.isoformat()}.md").write_text(
        "### **STUDY**\n"
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |\n"
        "| --- | --- | --- | --- | --- |\n"
        f"| 09:00 - 10:00 | {activity} | 1h | 0m | 0m |\n",
        encoding="utf-8",
    )


def test_plan_joins_recorded_time_and_learning_without_reading_other_scopes(
    tmp_path: Path,
) -> None:
    today = date.today()
    root = tmp_path / "learn"
    save(
        root,
        "smm",
        0,
        {
            "journal_activity": "SMM",
            "exam": (today + timedelta(days=5)).isoformat(),
            "coverage": "Linear systems remain",
            "sources": {"syllabus": {"path": "courses/smm/syllabus.md"}},
            "course_context": {
                "assessment": "Written problems and oral explanations",
                "refs": [{"source": "syllabus", "locator": "Assessment"}],
            },
            "topics": {
                "systems": {
                    "assessment": {
                        "summary": "Solves triangular systems independently",
                        "gap": "Cannot yet explain rank deficiency",
                        "observations": ["$attempt"],
                        "considered_observations": ["$attempt"],
                    },
                    "review": {
                        "due": today.isoformat(),
                        "reason": "Check the remaining conceptual gap",
                        "task": "Explain a rank-deficient system without hints",
                        "observations": ["$attempt"],
                        "considered_observations": ["$attempt"],
                    },
                }
            },
            "observations": [
                {
                    "as": "attempt",
                    "topics": ["systems"],
                    "text": "Solved triangular system without help",
                    "assistance": "None",
                    "date": today.isoformat(),
                    "refs": [{"source": "syllabus", "locator": "Systems"}],
                }
            ],
            "tasks": {"work": {"question": "Why is this system inconsistent?"}},
            "current_task": "work",
        },
    )
    (root / "state/unrelated.json").write_text("invalid", encoding="utf-8")
    write_day(tmp_path, today)
    result = plan(root, tmp_path, "smm", days=2)
    course = result["scopes"][0]
    assert course["recent_study"] == {
        "status": "recorded",
        "recorded_study_minutes": 60,
        "session_count": 1,
    }
    assessment = course["topics"]["systems"]["assessment"]
    assert assessment["summary"] == "Solves triangular systems independently"
    assert assessment["gap"] == "Cannot yet explain rank deficiency"
    assert assessment["observations"] == ["o1"]
    assert assessment["pending"] is False
    assert course["observations"]["o1"]["assistance"] == "None"
    assert course["observations"]["o1"]["date"] == today.isoformat()
    assert course["days_to_exam"] == 5
    assert course["coverage"] == "Linear systems remain"
    assert (
        course["course_context"]["assessment"]
        == "Written problems and oral explanations"
    )
    assert course["sources"] == {"syllabus": {"path": "courses/smm/syllabus.md"}}
    assert (
        course["unfinished"]["work"]["question"] == "Why is this system inconsistent?"
    )
    assert result["reviews"][0]["due_now"] is True
    assert result["journal"]["missing_dates"] == [
        (today - timedelta(days=1)).isoformat()
    ]
    assert "daily" not in result["journal"]

    save(
        root,
        "smm",
        1,
        {
            "observations": [
                {
                    "topics": ["systems"],
                    "text": "Correction: the full solution was visible during that attempt",
                    "corrects": ["o1"],
                    "assistance": "Full worked solution",
                }
            ],
        },
    )
    corrected = plan(root, tmp_path, "smm", days=2)
    corrected_topic = corrected["scopes"][0]["topics"]["systems"]
    assert corrected_topic["assessment"]["pending"] is True
    assert corrected["reviews"][0]["pending"] is True
    assert set(corrected["scopes"][0]["observations"]) == {"o1", "o2"}


def test_plan_includes_active_task_links_and_corrections_without_future_history(
    tmp_path: Path,
) -> None:
    root = tmp_path / "learn"
    save(
        root,
        "course",
        0,
        {
            "sources": {
                name: {"path": f"{name}.md"}
                for name in ("worksheet", "frame", "current", "base", "future")
            },
            "topics": {
                "systems": {
                    "assessment": {
                        "summary": "Only the last attempt was independent",
                        "observations": ["o6"],
                        "considered_observations": [f"o{i}" for i in range(1, 8)],
                    }
                }
            },
            "observations": [
                *[
                    {"topics": ["systems"], "text": label}
                    for label in ("task", "frame", "current", "base", "future", "claim")
                ],
                {
                    "topics": ["systems"],
                    "text": "Task attempt followed a hint",
                    "corrects": ["o1"],
                },
            ],
            "tasks": {
                "exercise": {
                    "observations": ["o1"],
                    "refs": [{"source": "worksheet", "locator": "Exercise 5"}],
                    "frame": {"observations": ["o2"], "source": "frame"},
                    "plan": {
                        "status": "agreed",
                        "current": "now",
                        "nodes": {
                            "base": {
                                "label": "Read columns",
                                "observations": ["o4"],
                                "source": "base",
                            },
                            "now": {
                                "label": "Explain dependence",
                                "needs": ["base"],
                                "observations": ["o3"],
                                "source": "current",
                            },
                            "later": {
                                "label": "Transfer",
                                "needs": ["now"],
                                "observations": ["o5"],
                                "source": "future",
                            },
                        },
                    },
                }
            },
        },
    )
    course = plan(root, tmp_path, "course")["scopes"][0]
    assert list(course["observations"]) == ["o1", "o2", "o3", "o4", "o6", "o7"]
    assert set(course["sources"]) == {"worksheet", "frame", "current", "base"}
    assert course["topics"]["systems"]["assessment"]["pending"] is False
    assert "exercise" in course["unfinished"]


def test_planning_catalog_preserves_healthy_scopes_and_reports_corruption(
    tmp_path: Path,
) -> None:
    root = tmp_path / "learn"
    save(root, "good", 0, {"title": "Healthy course"})
    (root / "state/broken.json").write_text("{", encoding="utf-8")
    result = plan(root, tmp_path, days=1)
    assert [scope["scope"] for scope in result["scopes"]] == ["good"]
    assert result["errors"][0]["scope"] == "broken"
    assert result["errors"][0]["error"]


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


def test_absent_activity_and_missing_journal_are_unknown_not_zero(
    tmp_path: Path,
) -> None:
    root = tmp_path / "learn"
    save(root, "unmapped", 0, {"title": "New subject"})
    save(root, "mapped", 0, {"journal_activity": "SMM"})
    courses = {
        course["scope"]: course["recent_study"]
        for course in plan(root, tmp_path, days=1)["scopes"]
    }
    assert courses["unmapped"]["status"] == "unmapped"
    assert courses["mapped"]["status"] == "unavailable"
    assert courses["mapped"]["recorded_study_minutes"] is None
    write_day(tmp_path, date.today(), "Different course")
    result = plan(root, tmp_path, "mapped", days=1)
    assert result["scopes"][0]["recent_study"] == {
        "status": "not_recorded",
        "recorded_study_minutes": None,
        "session_count": None,
    }
    assert result["journal"]["upcoming_schedule"] is None


def test_journal_rejects_invalid_window_lengths(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="horizon"):
        journal_summary(tmp_path, horizon=0)
    with pytest.raises(ValueError, match="days"):
        journal_summary(tmp_path, days=0)


def test_planning_selects_knowledge_for_active_work_and_catalog_only_counts(
    tmp_path: Path,
) -> None:
    root = tmp_path / "learn"
    save(
        root,
        "course",
        0,
        {
            "topics": {key: {} for key in ("focus", "active", "future")},
            "focus": ["focus"],
            "sources": {
                "notes": {
                    "path": "notes.md",
                    "version": "v1",
                    "description": "x" * 8000,
                }
            },
            "tasks": {
                "exercise": {
                    "plan": {
                        "status": "agreed",
                        "current": "now",
                        "nodes": {
                            "now": {"label": "Now", "topics": ["active"]},
                            "later": {
                                "label": "Later",
                                "needs": ["now"],
                                "topics": ["future"],
                            },
                        },
                    }
                }
            },
            "knowledge": {
                "general": {
                    "text": "Still a tentative map",
                    "refs": [{"source": "notes"}],
                },
                "focus": {"text": "Focus detail", "topics": ["focus"]},
                "active": {"text": "Active detail", "topics": ["active"]},
                "future": {"text": "Future detail", "topics": ["future"]},
                "large": {"text": "a" * 5000},
            },
        },
    )
    course = plan(root, tmp_path, "course")["scopes"][0]
    assert set(course["knowledge"]) == {"focus", "active", "general"}
    assert course["knowledge_selection"] == {"eligible": 4, "included": 3, "omitted": 1}
    assert course["sources"] == {"notes": {"path": "notes.md", "version": "v1"}}
    expanded = plan(root, tmp_path, "course", knowledge_budget=8192)["scopes"][0]
    assert "large" in expanded["knowledge"]
    catalog = plan(root, tmp_path)["scopes"][0]
    assert catalog["knowledge_count"] == 5
    assert "knowledge" not in catalog
    assert "notes" not in catalog["sources"]
    with pytest.raises(ValueError, match="single scope"):
        plan(root, tmp_path, knowledge_budget=8192)


def test_plan_bounds_whole_support_and_does_not_present_unsupported_assessment(
    tmp_path: Path,
) -> None:
    root = tmp_path / "learn"
    save(
        root,
        "course",
        0,
        {
            "topics": {
                "a": {
                    "assessment": {
                        "summary": "Attempt was assisted",
                        "observations": ["o1"],
                        "considered_observations": ["o1", "o2"],
                    },
                    "review": {
                        "due": date.today().isoformat(),
                        "task": "Explain independently",
                        "reason": "The earlier attempt used a solution",
                        "observations": ["o1"],
                        "considered_observations": ["o1", "o2"],
                    },
                }
            },
            "observations": [
                {"topics": ["a"], "text": "Initial attempt"},
                {
                    "topics": ["a"],
                    "text": "Full solution was provided " + "x" * 1000,
                    "corrects": ["o1"],
                },
            ],
        },
    )
    result = plan(root, tmp_path, "course", evidence_budget=500)
    course = result["scopes"][0]
    assert course["observations"] == {}
    assert "assessment" not in course["topics"]["a"]
    assert course["evidence_selection"]["complete"] is False
    assert course["evidence_selection"]["scope_complete"] is False
    assert result["reviews"][0]["support_in_context"] is False
    expanded = plan(root, tmp_path, "course", evidence_budget=4000)
    assert set(expanded["scopes"][0]["observations"]) == {"o1", "o2"}
    assert expanded["reviews"][0]["support_in_context"] is True
    assert course["revision"] == 1 and course["digest"]
