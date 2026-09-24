from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest

from learning.course import context_for_plan, normalize_context
from learning import records, retrieval


def test_course_context_preserves_requirements_and_relevant_source_locations() -> None:
    context = {
        "assessment": "Written problems and oral discussion",
        "criteria": ["Justify assumptions"],
        "constraints": ["No calculator"],
        "unknowns": ["Whether the sample is current"],
        "refs": [{"source": "syllabus", "locator": "Assessment"}],
        "checked_on": "2026-09-18",
    }
    record = {
        "course_context": context,
        "exam": "2026-10-02",
        "coverage": {"source": "programme", "text": "Chapters 1–4"},
        "sources": {
            "syllabus": {"path": "syllabus.pdf"},
            "programme": {"path": "programme.md"},
            "unrelated": {"path": "old-exercises.pdf"},
        },
    }
    original = deepcopy(record)
    assert normalize_context(context, record["sources"]) == context
    assert context_for_plan(record) == {
        "course_context": context,
        "sources": {
            "programme": {"path": "programme.md"},
            "syllabus": {"path": "syllabus.pdf"},
        },
    }
    assert record == original
    assert context_for_plan({}) == {}
    assert context_for_plan({"coverage": "No assessment"}) == {}


@pytest.mark.parametrize(
    "context",
    [
        "oral",
        {"assessment": ""},
        {"criteria": "correctness"},
        {"constraints": [42]},
        {"unknowns": [""]},
        {"checked_on": "2026-02-30"},
        {"checked_on": "20260918"},
        {"refs": [{"source": "missing"}]},
        {"refs": [{"source": "syllabus", "locator": 4}]},
        {"refs": ["syllabus"]},
        {"refs": "syllabus"},
        {"exam": "2026-10-02"},
        {"coverage": "Chapters 1–4"},
    ],
)
def test_invalid_course_context_is_rejected(context: Any) -> None:
    with pytest.raises(ValueError, match="course_context"):
        normalize_context(context, {"syllabus": {"path": "syllabus.pdf"}})


def test_course_context_persists_with_valid_sources_and_clears_explicitly(
    tmp_path: Path,
) -> None:
    course = {
        "assessment": "Oral exam",
        "refs": [{"source": "syllabus", "locator": "Assessment"}],
    }
    records.save(
        tmp_path,
        "course",
        0,
        {
            "exam": "2026-10-02",
            "sources": {"syllabus": {"path": "syllabus.pdf"}},
            "course_context": course,
        },
    )
    records.save(
        tmp_path,
        "course",
        1,
        {"tasks": {"work": {"task": "Exercise 1"}}, "current_task": "work"},
    )
    result = retrieval.resume(tmp_path, "course")
    assert result["briefing"]["course"]["course_context"] == course
    assert result["sources"] == {"syllabus": {"path": "syllabus.pdf"}}
    with pytest.raises(ValueError, match="unknown course_context source"):
        records.save(tmp_path, "course", 2, {"sources": {"syllabus": None}})
    records.save(tmp_path, "course", 2, {"course_context": None})
    cleared = records.read(tmp_path, "course")
    assert isinstance(cleared, dict)
    assert "course_context" not in cleared
    assert cleared["exam"] == "2026-10-02"
