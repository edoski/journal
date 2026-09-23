import json
from pathlib import Path

import pytest

from learning import records, retrieval
from learning.storage import RevisionConflict


@pytest.mark.parametrize("selection", [[], ["notation"]])
def test_knowledge_reads_ignore_only_valid_evidence_budgets(
    tmp_path: Path, selection: list[str]
) -> None:
    records.save(
        tmp_path, "course", 0, {"knowledge": {"notation": {"text": "g means response"}}}
    )
    path = tmp_path / "state/course.json"
    before = path.read_bytes()
    expected = retrieval.context(tmp_path, "course", knowledge=selection)
    assert (
        retrieval.context(tmp_path, "course", knowledge=selection, evidence_budget=2)
        == expected
    )
    assert path.read_bytes() == before
    for invalid in (True, 0, 1, "2", 2.5):
        with pytest.raises(ValueError, match="at least 2 bytes"):
            retrieval.context(
                tmp_path, "course", knowledge=selection, evidence_budget=invalid
            )  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="cannot combine"):
        retrieval.context(
            tmp_path, "course", knowledge=selection, query="response", evidence_budget=2
        )
    with pytest.raises(ValueError, match="requires a scope"):
        retrieval.context(tmp_path, None, evidence_budget=2)


def test_scoped_query_still_bounds_evidence(tmp_path: Path) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {"response": {}},
            "observations": [
                {"topics": ["response"], "text": "Response explanation " * 100}
            ],
        },
    )
    bounded = retrieval.context(tmp_path, "course", query="Response", evidence_budget=2)
    expanded = retrieval.context(
        tmp_path, "course", query="Response", evidence_budget=10000
    )
    assert bounded["observations"] == {}
    assert set(expanded["observations"]) == {"o1"}


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
    assert matched["candidates"]["items"] == []
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
    assert [
        (item["kind"], item["key"]) for item in candidate["candidates"]["items"]
    ] == [("topic", "systems")]
    with pytest.raises(ValueError, match="expected revision"):
        retrieval.context(tmp_path, "course", ["systems"], offset=1)
    records.save(tmp_path, "course", 1, {"title": "Updated"})
    with pytest.raises(RevisionConflict, match="revision conflict"):
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
    candidates = retrieval.context(tmp_path, "course", query="uniqueness")[
        "candidates"
    ]["items"]
    assert [(item["kind"], item["key"]) for item in candidates] == [
        ("task", "exercise")
    ]
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


def test_knowledge_discovery_and_exact_read_survive_task_completion(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {"a": {"notes": "A hidden notation correspondence"}, "b": {}},
            "sources": {
                "sheet": {
                    "path": "sheet.md",
                    "version": "v1",
                    "notes": "Not needed in focused reads",
                }
            },
            "knowledge": {
                "notation": {
                    "text": "The lecturer uses g, while Atlas uses h; this is provisional.",
                    "topics": ["a"],
                    "refs": [{"source": "sheet"}],
                }
            },
            "tasks": {"work": {"topics": ["a"]}},
        },
    )
    records.save(tmp_path, "course", 1, {"tasks": {"work": None}, "focus": ["b"]})
    ordinary = retrieval.context(tmp_path, "course")
    assert ordinary["knowledge"] == {}
    assert ordinary["knowledge_selection"] == {
        "eligible": 0,
        "included": 0,
        "omitted": 0,
    }
    discovered = retrieval.context(tmp_path, "course", query="Atlas uses h")
    assert [
        (item["kind"], item["key"]) for item in discovered["candidates"]["items"]
    ] == [("knowledge", "notation")]
    assert "knowledge" not in discovered
    topic = retrieval.context(tmp_path, "course", query="hidden notation")
    assert [(item["kind"], item["key"]) for item in topic["candidates"]["items"]] == [
        ("topic", "a")
    ]
    exact = retrieval.context(tmp_path, "course", knowledge=["notation"])
    assert set(exact) == {"scope", "revision", "digest", "knowledge", "sources"}
    assert exact["knowledge"]["notation"]["text"].endswith("provisional.")
    assert exact["sources"] == {"sheet": {"path": "sheet.md", "version": "v1"}}


def test_automatic_knowledge_is_whole_bounded_and_counts_sources() -> None:
    record = {
        "sources": {"sheet": {"path": "é" * 500, "version": "v1"}},
        "knowledge": {
            "a-large": {"text": "λ" * 1000, "topics": ["a"]},
            "b-ref": {
                "text": "Small but its reference has a long path",
                "topics": ["a"],
                "refs": [{"source": "sheet"}],
            },
            "c-small": {
                "text": "Not verified; do not skip the exam topic.",
                "topics": ["a"],
            },
            "d-general": {"text": "A general fact."},
            "e-other": {"text": "An irrelevant fact.", "topics": ["b"]},
        },
    }
    result = retrieval.knowledge_context(record, ["a"], budget=400)
    assert list(result["knowledge"]) == ["c-small", "d-general"]
    assert result["knowledge_selection"] == {"eligible": 4, "included": 2, "omitted": 2}
    assert (
        len(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode())
        <= 400
    )
    reused = retrieval.knowledge_context(
        record, ["a"], {"sheet": record["sources"]["sheet"]}, budget=400
    )
    assert "b-ref" in reused["knowledge"]
    assert reused["sources"] == {}


def test_exact_knowledge_size_error_and_override(tmp_path: Path) -> None:
    records.save(tmp_path, "course", 0, {"knowledge": {"large": {"text": "è" * 5000}}})
    with pytest.raises(
        ValueError,
        match=r"knowledge read requires \d+ bytes .*entries: large=\d+.*--knowledge-budget",
    ):
        retrieval.context(tmp_path, "course", knowledge=["large"])
    result = retrieval.context(
        tmp_path, "course", knowledge=["large"], knowledge_budget=20000
    )
    assert result["knowledge"]["large"]["text"] == "è" * 5000
    with pytest.raises(ValueError, match="unknown"):
        retrieval.context(tmp_path, "course", knowledge=["missing"])


def test_knowledge_index_pages_are_revision_pinned(tmp_path: Path) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {"knowledge": {f"k{i:02}": {"text": str(i)} for i in range(23)}},
    )
    first = retrieval.context(tmp_path, "course", knowledge=[])
    assert len(first["knowledge_index"]) == 20
    assert first["selection"]["next_offset"] == 20
    assert all(set(item) == {"key", "bytes"} for item in first["knowledge_index"])
    with pytest.raises(ValueError, match="expected revision"):
        retrieval.context(tmp_path, "course", knowledge=[], offset=20)
    last = retrieval.context(tmp_path, "course", knowledge=[], offset=20, expected=1)
    assert last["selection"]["complete"] is True
    assert len(last["knowledge_index"]) == 3
    records.save(tmp_path, "course", 1, {"title": "New title"})
    with pytest.raises(RevisionConflict, match="revision conflict"):
        retrieval.context(tmp_path, "course", knowledge=[], offset=20, expected=1)


@pytest.mark.parametrize(
    "arguments",
    [
        {"knowledge": ["x"], "topics": []},
        {"knowledge": [], "query": "x"},
        {"knowledge": ["x"], "limit": 1},
        {"knowledge": [], "limit": 21},
        {"knowledge": [], "knowledge_budget": 100},
        {"query": "x", "knowledge_budget": 100},
        {"candidate_offset": 1},
        {"query": "x", "candidate_offset": 1},
        {"knowledge": ["x"], "knowledge_budget": True},
    ],
)
def test_knowledge_selection_rejects_ambiguous_options(
    tmp_path: Path, arguments: dict
) -> None:
    with pytest.raises(ValueError):
        retrieval.context(tmp_path, "course", **arguments)


def test_query_streams_advance_separately_without_repeating_support(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {
                "a": {
                    "assessment": {
                        "summary": "needle",
                        "observations": ["o2"],
                        "considered_observations": ["o1", "o2"],
                    }
                }
            },
            "observations": [
                {"topics": ["a"], "text": "needle"},
                {"topics": ["a"], "text": "Support"},
            ],
            "knowledge": {
                f"k{i:02}": {"text": "needle " + "λ" * 300} for i in range(19)
            },
        },
    )
    first = retrieval.context(tmp_path, "course", query="needle")
    assert first["total"] == 1
    assert list(first["observations"]) == ["o1", "o2"]
    candidates = first["candidates"]
    assert len(candidates["items"]) == 8
    assert candidates["total"] == 19
    assert all(
        len(item["excerpt"].encode()) <= 256 and item["discovery_only"]
        for item in candidates["items"]
    )
    assert (
        len(
            json.dumps(
                {"candidates": candidates}, ensure_ascii=False, separators=(",", ":")
            ).encode()
        )
        <= 4096
    )
    second = retrieval.context(
        tmp_path,
        "course",
        query="needle",
        topics=["a"],
        offset=1,
        candidate_offset=8,
        expected=1,
    )
    assert second["observations"] == {}
    assert second["topics"] == {}
    assert second["expanded_observations"] == []
    assert second["candidates"]["offset"] == 8
    exhausted = retrieval.context(
        tmp_path, "course", query="needle", candidate_offset=19, expected=1
    )
    assert exhausted["candidates"]["items"] == []
    assert list(exhausted["observations"]) == ["o1", "o2"]
    ordinary = retrieval.context(tmp_path, "course", topics=["a"], observations=[])
    assert list(ordinary["observations"]) == ["o2"]


def test_candidate_byte_paging_advances_by_actual_count_and_rejects_huge_handle(
    tmp_path: Path,
) -> None:
    handles = [f"{i}-" + "s" * 950 for i in range(5)]
    records.save(
        tmp_path, "course", 0, {"sources": {key: {"path": "needle"} for key in handles}}
    )
    first = retrieval.context(tmp_path, "course", query="needle")
    candidate_page = first["candidates"]
    assert 0 < len(candidate_page["items"]) < 5
    assert candidate_page["next_offset"] == len(candidate_page["items"])
    assert (
        len(
            json.dumps(
                {"candidates": candidate_page},
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode()
        )
        <= 4096
    )
    second = retrieval.context(
        tmp_path,
        "course",
        query="needle",
        offset=0,
        expected=1,
        candidate_offset=candidate_page["next_offset"],
    )
    assert [
        item["key"] for item in candidate_page["items"] + second["candidates"]["items"]
    ] == handles
    records.save(tmp_path, "huge", 0, {"sources": {"s" * 5000: {"path": "needle"}}})
    with pytest.raises(ValueError, match="descriptor exceeds"):
        retrieval.context(tmp_path, "huge", query="needle")


def test_incidental_evidence_does_not_route_knowledge_or_expand_policy(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "focus": ["a"],
            "topics": {
                "a": {
                    "assessment": {
                        "summary": "Uses transfer evidence",
                        "observations": ["o1"],
                        "considered_observations": ["o1"],
                    }
                },
                "b": {},
            },
            "observations": [{"topics": ["b"], "text": "A transfer exercise"}],
            "knowledge": {
                "a-note": {"text": "Relevant note", "topics": ["a"]},
                "b-note": {"text": "Incidental note", "topics": ["b"]},
            },
        },
    )
    result = retrieval.context(tmp_path, "course")
    assert list(result["observations"]) == ["o1"]
    assert list(result["knowledge"]) == ["a-note"]
    assert list(result["policy_topics"]) == ["a"]


def test_exact_knowledge_shared_source_is_counted_once(tmp_path: Path) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "sources": {"s": {"path": "sheet.md", "version": "first"}},
            "knowledge": {
                key: {"text": key, "refs": [{"source": "s"}]} for key in ("a", "b")
            },
        },
    )
    full = retrieval.context(tmp_path, "course", knowledge=["b", "a"])
    assert list(full["knowledge"]) == ["a", "b"]
    assert list(full["sources"]) == ["s"]
    size = len(json.dumps(full, ensure_ascii=False, separators=(",", ":")).encode())
    assert (
        retrieval.context(
            tmp_path, "course", knowledge=["b", "a"], knowledge_budget=size
        )
        == full
    )
    with pytest.raises(ValueError, match=f"requires {size} bytes"):
        retrieval.context(
            tmp_path, "course", knowledge=["b", "a"], knowledge_budget=size - 1
        )


def test_ordinary_knowledge_budget_can_expand_or_reduce_without_clipping(
    tmp_path: Path,
) -> None:
    text = "A provisional interpretation; " * 170
    records.save(
        tmp_path,
        "course",
        0,
        {"knowledge": {"large": {"text": text}, "small": {"text": "A smaller fact"}}},
    )
    ordinary = retrieval.context(tmp_path, "course")
    assert list(ordinary["knowledge"]) == ["small"]
    assert ordinary["knowledge_selection"] == {
        "eligible": 2,
        "included": 1,
        "omitted": 1,
    }
    expanded = retrieval.context(tmp_path, "course", knowledge_budget=8192)
    assert list(expanded["knowledge"]) == ["large", "small"]
    assert expanded["knowledge"]["large"]["text"] == text
    tiny = retrieval.context(tmp_path, "course", knowledge_budget=100)
    assert tiny["knowledge"] == {}
    assert tiny["knowledge_selection"]["omitted"] == 2
    with pytest.raises(ValueError, match="envelope"):
        retrieval.context(tmp_path, "course", knowledge_budget=1)
    with pytest.raises(ValueError, match="scoped context"):
        retrieval.context(tmp_path, None, knowledge_budget=100)


def test_query_excerpt_preserves_match_after_unicode_casefold_expansion(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {"knowledge": {"notation": {"text": "ß" * 100 + "needle is important"}}},
    )
    result = retrieval.context(tmp_path, "course", query="needle")
    excerpt = result["candidates"]["items"][0]["excerpt"]
    assert "needle is important" in excerpt
    assert len(excerpt.encode("utf-8")) <= 256


def test_candidate_budget_counts_its_outer_response_key(tmp_path: Path) -> None:
    records.save(tmp_path, "fits", 0, {"sources": {"s" * 3946: {"path": "needle"}}})
    result = retrieval.context(tmp_path, "fits", query="needle")
    assert (
        len(
            json.dumps(
                {"candidates": result["candidates"]},
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode()
        )
        == 4096
    )
    records.save(tmp_path, "course", 0, {"sources": {"s" * 3947: {"path": "needle"}}})
    with pytest.raises(ValueError, match="descriptor exceeds"):
        retrieval.context(tmp_path, "course", query="needle")


def test_resume_briefing_retrieves_prerequisite_knowledge_without_activating_policy(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "math",
        0,
        {
            "title": "Numerical Methods",
            "goal": "Explain interpolation at the oral exam",
            "coverage": "Interpolation, then quadrature",
            "course_context": {
                "unknowns": ["Permitted reference sheet is unconfirmed"]
            },
            "topics": {
                "interpolation": {"prerequisites": ["basis"]},
                "basis": {},
                "future": {},
            },
            "knowledge": {
                "basis-notation": {
                    "text": "The lecturer uses B for this basis; unverified elsewhere.",
                    "topics": ["basis"],
                },
                "future-detail": {
                    "text": "Unrelated later convention",
                    "topics": ["future"],
                },
            },
            "tasks": {
                "oral": {
                    "topics": ["interpolation"],
                    "pending_question": "Why is the polynomial unique?",
                    "frame": {"within": "Module 2", "goal": "Explain uniqueness"},
                    "plan": {
                        "status": "agreed",
                        "current": "explain",
                        "nodes": {
                            "basis": {"label": "Recall a basis", "topics": ["basis"]},
                            "explain": {
                                "label": "Justify uniqueness",
                                "needs": ["basis"],
                            },
                            "later": {"label": "Quadrature", "topics": ["future"]},
                        },
                    },
                }
            },
        },
    )
    result = retrieval.context(tmp_path, "math")
    assert set(result["knowledge"]) == {"basis-notation"}
    assert set(result["policy_topics"]) == {"interpolation"}
    briefing = result["briefing"]
    assert briefing["course"]["goal"] == "Explain interpolation at the oral exam"
    assert briefing["course"]["coverage"] == "Interpolation, then quadrature"
    assert briefing["course"]["course_context"]["unknowns"]
    assert briefing["activity"]["pending_question"] == "Why is the polynomial unique?"
    assert set(briefing["route"]["prerequisites"]) == {"basis"}
    assert "later" not in json.dumps(briefing)
    assert records.read(tmp_path, "math")["revision"] == 1


def test_default_context_bounds_history_and_exposes_whole_group_expansion(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "math",
        0,
        {
            "focus": ["a"],
            "topics": {"a": {}},
            "observations": [
                {"topics": ["a"], "text": f"Attempt {i}: " + "x" * 200}
                for i in range(1000)
            ],
        },
    )
    first = retrieval.context(tmp_path, "math")
    assert len(first["observations"]) == 24
    assert "o1000" in first["observations"]
    assert first["complete"] is False
    assert first["next_offset"] == 24
    assert first["evidence_selection"]["scope_complete"] is False
    assert first["evidence_selection"]["omitted_observations"] == 976
    second = retrieval.context(
        tmp_path, "math", offset=first["next_offset"], expected=first["revision"]
    )
    assert not set(first["observations"]) & set(second["observations"])
    assert len(json.dumps(first).encode()) < 16000
    exact = retrieval.context(tmp_path, "math", observations=["o1"])
    assert exact["complete"] is True
    assert exact["evidence_selection"]["scope_complete"] is False


def test_oversized_correction_and_assessment_support_never_appear_partially(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "math",
        0,
        {
            "focus": ["a"],
            "topics": {
                "a": {
                    "assessment": {
                        "summary": "Assistance is unresolved",
                        "observations": ["o1"],
                        "considered_observations": ["o1", "o2"],
                    }
                }
            },
            "observations": [
                {"topics": ["a"], "text": "Independent answer"},
                {
                    "topics": ["a"],
                    "text": "Actually received a worked solution " + "x" * 1000,
                    "corrects": ["o1"],
                },
            ],
        },
    )
    small = retrieval.context(tmp_path, "math", evidence_budget=500)
    assert small["observations"] == {}
    assert "assessment" not in small["topics"]["a"]
    assert small["complete"] is False
    assert small["evidence_selection"]["omissions"][0]["field"] == "assessment"
    assert any(
        item.get("observation") == "o1"
        for item in small["evidence_selection"]["omissions"]
    )
    expanded = retrieval.context(tmp_path, "math", observations=["o1"])
    assert set(expanded["observations"]) == {"o1", "o2"}
    assert (
        expanded["topics"]["a"]["assessment"]["summary"] == "Assistance is unresolved"
    )


def test_qualified_knowledge_ranks_before_alphabetical_and_oversize_is_discoverable(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "math",
        0,
        {
            "focus": ["a"],
            "topics": {"a": {}},
            "knowledge": {
                "a-long": {"text": "x" * 10000, "topics": ["a"]},
                "b-routine": {"text": "y" * 450, "topics": ["a"]},
                "z-disputed": {
                    "text": "Convention is disputed",
                    "topics": ["a"],
                    "uncertainty": "Two undated handouts disagree",
                },
            },
        },
    )
    result = retrieval.context(tmp_path, "math", knowledge_budget=650)
    assert list(result["knowledge"]) == ["z-disputed"]
    omitted = result["knowledge_omissions"]["items"]
    assert omitted[0]["key"] == "a-long"
    assert omitted[0]["bytes"] > 10000
    assert (
        result["knowledge"]["z-disputed"]["uncertainty"]
        == "Two undated handouts disagree"
    )


def test_alias_token_discovery_crosses_scopes_without_importing_evidence_or_preferences(
    tmp_path: Path,
) -> None:
    for scope in ("math", "physics"):
        records.save(
            tmp_path,
            scope,
            0,
            {
                "title": scope,
                "topics": {
                    "basis": {"aliases": ["base ortogonale", "orthogonal basis"]}
                },
                "knowledge": {
                    "notation": {
                        "text": "Local notation only",
                        "aliases": ["basis orthogonal"],
                        "topics": ["basis"],
                    }
                },
                "observations": [
                    {"topics": ["basis"], "text": "Succeeded independently"}
                ],
            },
        )
    query = retrieval.context(tmp_path, "math", query="ortogonale base")
    assert [(item["kind"], item["key"]) for item in query["candidates"]["items"]] == [
        ("topic", "basis")
    ]
    found = retrieval.discover(tmp_path, "orthogonal basis", limit=3)
    assert found["total"] == 4
    assert found["complete"] is False
    assert found["discovery_only"] is True
    assert {item["scope"] for item in found["items"]} == {"math", "physics"}
    assert all(
        set(item) == {"scope", "revision", "kind", "key"} for item in found["items"]
    )
    assert "Succeeded" not in json.dumps(found)


def test_briefing_omits_large_fields_explicitly_and_preserves_current_question(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "math",
        0,
        {
            "goal": "Explain the method",
            "coverage": "x" * 10000,
            "tasks": {"work": {"pending_question": "Why does this converge?"}},
        },
    )
    result = retrieval.context(tmp_path, "math")["briefing"]
    assert (
        len(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode())
        <= 4096
    )
    assert result["activity"]["pending_question"] == "Why does this converge?"
    assert result["course"]["goal"] == "Explain the method"
    assert "coverage" not in result["course"]
    assert result["omitted_fields"] == [
        {"field": "course.coverage", "path": ["coverage"], "bytes": 10002}
    ]
    assert result["expand"] == "context --all"
