import json
from pathlib import Path

import pytest

from learning import records, retrieval


def test_selected_assessment_brings_support_and_corrections_without_recursive_topics(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "sources": {"sheet": {"path": "transfer.md"}},
            "topics": {
                "a": {
                    "assessment": {
                        "summary": "Transfer remains assisted",
                        "observations": ["o2"],
                        "considered_observations": ["o1", "o2", "o3"],
                    }
                },
                "b": {
                    "assessment": {
                        "summary": "A separate interpretation",
                        "observations": ["o4"],
                        "considered_observations": ["o2", "o3", "o4"],
                    }
                },
                "c": {},
            },
            "observations": [
                {"topics": ["a"], "text": "Initial attempt"},
                {"topics": ["b"], "text": "Transfer", "source": "sheet"},
                {"topics": ["b"], "text": "Transfer used a hint", "corrects": ["o2"]},
                {"topics": ["c"], "text": "Unrelated history"},
            ],
        },
    )
    result = retrieval.context(tmp_path, "course", topics=["a"], limit=1)
    assert result["complete"] is True
    assert result["total"] == 1
    assert list(result["observations"]) == ["o1", "o2", "o3"]
    assert result["expanded_observations"] == ["o2", "o3"]
    assert set(result["topics"]) == {"a"}
    assert result["sources"]["sheet"]["path"] == "transfer.md"
    assert result["selection"]["active_topics"] == ["a"]


def test_focused_history_exact_selection_and_index_are_distinct(tmp_path: Path) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "aliases": ["SMM"],
            "focus": ["systems"],
            "coverage": {"text": "Syllabus"},
            "sources": {
                "sheet": {"path": "exercises.md"},
                "unrelated": {"path": "other.md"},
            },
            "topics": {
                "systems": {"aliases": ["linear systems"], "source": "sheet"},
                "other": {},
            },
            "observations": [
                {"topics": ["systems"], "text": "Old independent derivation"},
                *[
                    {"topics": ["systems"], "text": f"Assisted attempt {i}"}
                    for i in range(4)
                ],
                {"topics": ["other"], "text": "Different subject"},
            ],
        },
    )
    focused = retrieval.context(tmp_path, "course")
    assert isinstance(focused, dict)
    assert list(focused["observations"]) == ["o1", "o2", "o3", "o4", "o5"]
    assert focused["complete"] is True
    assert focused["total"] == 5
    assert "coverage" not in focused
    assert "topic_index" not in focused
    assert set(focused["sources"]) == {"sheet"}
    selected = retrieval.context(tmp_path, "course", ["other"])
    assert isinstance(selected, dict)
    assert list(selected["observations"]) == ["o6"]
    assert set(selected["topics"]) == {"other"}
    index = retrieval.context(tmp_path, "course", [])
    assert isinstance(index, dict)
    assert index["observations"] == {}
    assert index["topics"] == {}
    assert index["topic_index"]["systems"]["observation_count"] == 5
    assert set(index["sources"]) == {"sheet", "unrelated"}
    catalog = retrieval.context(tmp_path, None)
    assert isinstance(catalog, list)
    assert catalog[0]["aliases"] == ["SMM"]
    assert "topics" not in catalog[0]
    records.save(
        tmp_path,
        "course",
        1,
        {
            "tasks": {
                "work": {
                    "question": "Continue",
                    "topics": ["other"],
                    "observations": ["o6"],
                }
            },
            "current_task": "work",
        },
    )
    resumed = retrieval.context(tmp_path, "course")
    assert isinstance(resumed, dict)
    assert resumed["selection"]["mode"] == "task"
    assert list(resumed["observations"]) == ["o6"]
    explicit = retrieval.context(tmp_path, "course", observations=["o1"])
    assert isinstance(explicit, dict)
    assert set(explicit["topics"]) == {"systems"}


def test_query_pages_and_correction_pairs_preserve_old_evidence(tmp_path: Path) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {"systems": {"aliases": ["singular matrices"]}, "other": {}},
            "observations": [
                {
                    "topics": ["systems"],
                    "text": "The determinant answer was independent",
                },
                {"topics": ["other"], "text": "Unrelated practice"},
                {
                    "topics": ["systems"],
                    "text": "That answer followed a hint",
                    "corrects": ["o1"],
                },
                {
                    "topics": ["systems"],
                    "text": "Later independent determinant derivation",
                },
            ],
        },
    )
    matched = retrieval.context(tmp_path, "course", query="DETERMINANT")
    assert isinstance(matched, dict)
    assert matched["total"] == 2
    assert list(matched["observations"]) == ["o1", "o3", "o4"]
    assert matched["expanded_observations"] == ["o3"]
    assert set(matched["candidates"]["observations"]) == {"o1", "o4"}
    exact = retrieval.context(tmp_path, "course", observations=["o3"])
    assert isinstance(exact, dict)
    assert list(exact["observations"]) == ["o1", "o3"]
    first = retrieval.context(tmp_path, "course", query="determinant", limit=1)
    assert isinstance(first, dict)
    assert first["complete"] is False
    assert first["next_offset"] == 1
    assert list(first["observations"]) == ["o1", "o3"]
    second = retrieval.context(
        tmp_path, "course", query="determinant", limit=1, offset=1, expected=1
    )
    assert isinstance(second, dict)
    assert second["complete"] is True
    assert second["next_offset"] is None
    assert list(second["observations"]) == ["o4"]
    candidate = retrieval.context(tmp_path, "course", query="singular")
    assert isinstance(candidate, dict)
    assert candidate["total"] == 0
    assert set(candidate["candidates"]["topics"]) == {"systems"}
    with pytest.raises(ValueError, match="expected revision"):
        retrieval.context(tmp_path, "course", ["systems"], offset=1)
    records.save(tmp_path, "course", 1, {"title": "Updated"})
    with pytest.raises(ValueError, match="revision conflict"):
        retrieval.context(tmp_path, "course", query="determinant", offset=1, expected=1)
    with pytest.raises(ValueError, match="unknown"):
        retrieval.context(tmp_path, "course", topics=["absent"])
    with pytest.raises(ValueError, match="unknown"):
        retrieval.context(tmp_path, "course", observations=["o999"])


def test_scope_material_survives_selection_without_old_task_preferences(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "sources": {
                "course": {"path": "courses/math"},
                "attempt": {"path": "learn/old-attempt.md"},
            },
            "refs": [{"source": "course"}],
            "topics": {"old": {}, "new": {}},
            "tasks": {"work": {"topics": ["old"], "source": "attempt"}},
            "current_task": "work",
            "focus": ["old"],
        },
    )
    resumed = retrieval.context(tmp_path, "course")
    assert isinstance(resumed, dict)
    assert set(resumed["sources"]) == {"course", "attempt"}
    selected = retrieval.context(tmp_path, "course", ["new"])
    assert isinstance(selected, dict)
    assert set(selected["sources"]) == {"course"}
    assert set(selected["topics"]) == {"new"}
    for patch in ({"sources": {"course": None}}, {"teaching": "Duplicate policy"}):
        with pytest.raises(ValueError):
            records.save(tmp_path, "course", 1, patch)
    current = records.read(tmp_path, "course")
    assert isinstance(current, dict)
    assert current["revision"] == 1


def test_missing_and_corrupt_state_are_distinct(tmp_path: Path) -> None:
    missing = retrieval.context(tmp_path, "new")
    assert isinstance(missing, dict)
    assert missing["found"] is False
    assert missing["revision"] == 0
    assert missing["observations"] == {}
    path = tmp_path / "state/new.json"
    path.parent.mkdir()
    path.write_text(
        json.dumps(
            {
                "revision": 1,
                "schema_version": 3,
                "topics": {"x": {"summary": float("nan")}},
            }
        )
    )
    with pytest.raises(ValueError, match="invalid JSON constant"):
        records.read(tmp_path, "new")
    path.write_text('{"revision": true, "schema_version": 3}')
    with pytest.raises(ValueError, match="invalid stored revision"):
        records.read(tmp_path, "new")


def test_parallel_tasks_resume_exact_work_and_complete_independently(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {"a": {}, "b": {}},
            "sources": {"sheet": {"path": "sheet.pdf"}},
            "observations": [
                {"topics": ["a"], "text": "Attempt A"},
                {"topics": ["b"], "text": "Attempt B"},
            ],
            "tasks": {
                "exercise-5": {
                    "task": "Exercise 5",
                    "topics": ["a"],
                    "observations": ["o1"],
                    "source": "sheet",
                    "question": "Why A?",
                },
                "exercise-8": {
                    "task": "Exercise 8",
                    "topics": ["b"],
                    "observations": ["o2"],
                    "question": "Why B?",
                },
            },
            "current_task": "exercise-8",
        },
    )
    selected = retrieval.context(tmp_path, "course", task="exercise-5")
    assert selected["task"]["question"] == "Why A?"
    assert list(selected["observations"]) == ["o1"]
    assert list(selected["topics"]) == ["a"]
    assert "sheet" in selected["sources"]
    assert set(selected["task_index"]) == {"exercise-5", "exercise-8"}
    assert "tasks" not in selected
    records.save(
        tmp_path,
        "course",
        1,
        {"tasks": {"exercise-5": {"task": "Exercise 5", "question": "Next A?"}}},
    )
    with pytest.raises(ValueError, match="revision conflict"):
        records.save(tmp_path, "course", 1, {"tasks": {"exercise-8": None}})
    current = records.read(tmp_path, "course")
    assert current["tasks"]["exercise-8"]["question"] == "Why B?"
    assert current["tasks"]["exercise-5"]["source"] == "sheet"
    records.save(tmp_path, "course", 2, {"tasks": {"exercise-8": None}})
    assert retrieval.context(tmp_path, "course")["task"]["id"] == "exercise-5"
    assert len(records.read(tmp_path, "course")["observations"]) == 2
    records.save(
        tmp_path, "course", 3, {"tasks": {"another": {"task": "Another task"}}}
    )
    assert retrieval.context(tmp_path, "course")["task"] is None
    with pytest.raises(ValueError, match="unknown task"):
        retrieval.context(tmp_path, "course", task="missing")


def test_resume_carries_purpose_and_nearby_plan_evidence_without_future_history(
    tmp_path: Path,
) -> None:
    frame = {
        "within": "Module / Worksheet / Exercise",
        "goal": "Explain uniqueness",
        "completion": "Justify the original solution",
        "topics": ["goal"],
        "observations": ["o4"],
        "refs": [{"source": "sheet", "locator": "Exercise 5"}],
    }
    plan = {
        "status": "proposed",
        "current": "collision",
        "nodes": {
            "columns": {"label": "Read matrix columns", "topics": ["base"]},
            "collision": {"label": "Understand collisions", "needs": ["columns"]},
            "return": {
                "label": "Return to uniqueness",
                "needs": ["collision"],
                "topics": ["future"],
            },
        },
    }
    records.save(
        tmp_path,
        "course",
        0,
        {
            "sources": {"sheet": {"path": "exercises.md"}},
            "topics": {
                key: {} for key in ("goal", "current", "base", "pinned", "future")
            },
            "observations": [
                {"topics": [key], "text": key}
                for key in ("goal", "current", "base", "pinned", "future")
            ],
            "tasks": {
                "exercise": {
                    "task": "Exercise 5",
                    "frame": frame,
                    "plan": plan,
                    "topics": ["current"],
                    "assistance": "Old hint",
                }
            },
            "current_task": "exercise",
        },
    )
    records.save(
        tmp_path,
        "course",
        1,
        {
            "tasks": {
                "exercise": {"pending_question": "Why collide?", "assistance": None}
            }
        },
    )
    result = retrieval.context(tmp_path, "course")
    assert result["task"]["frame"] == frame
    assert result["task"]["plan"] == plan
    assert "assistance" not in result["task"]
    assert list(result["observations"]) == ["o1", "o2", "o3", "o4"]
    assert set(result["topics"]) == {"goal", "current", "base", "pinned"}
    assert result["sources"]["sheet"]["path"] == "exercises.md"
    assert result["complete"] is True
    assert retrieval.context(tmp_path, "course", query="uniqueness")["candidates"][
        "tasks"
    ].keys() == {"exercise"}
    explicit = retrieval.context(
        tmp_path, "course", task="exercise", topics=["current"]
    )
    assert list(explicit["observations"]) == ["o2"]
    assert explicit["task"]["frame"] == frame
    first = retrieval.context(tmp_path, "course", limit=2)
    second = retrieval.context(
        tmp_path,
        "course",
        limit=2,
        offset=first["next_offset"],
        expected=first["revision"],
    )
    assert list(first["observations"]) + list(second["observations"]) == list(
        result["observations"]
    )
    assert second["complete"] is True
