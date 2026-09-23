from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from threading import Barrier
from typing import Any

import pytest

from learning import records, storage


def test_knowledge_patches_preserve_other_understanding_and_outlive_tasks(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {"systems": {}},
            "tasks": {"exercise": {"task": "Solve this"}},
            "current_task": "exercise",
            "knowledge": {
                "resources": {
                    "text": "Old sheets may be current.",
                    "topics": ["systems"],
                },
                "notation": {"text": "The lecturer uses g; the book uses h."},
            },
        },
    )
    receipt = records.save(
        tmp_path,
        "course",
        1,
        {
            "knowledge": {
                "resources": {"text": "Learner reports old sheets are outdated."}
            },
            "tasks": {"exercise": None},
        },
    )
    current = records.read(tmp_path, "course")
    assert isinstance(current, dict)
    assert current["knowledge"] == {
        "resources": {
            "text": "Learner reports old sheets are outdated.",
            "topics": ["systems"],
        },
        "notation": {"text": "The lecturer uses g; the book uses h."},
    }
    assert current["tasks"] == {}
    assert current["current_task"] is None
    assert current["observations"] == {}
    assert receipt["assigned_observations"] == []
    assert records.save(tmp_path, "course", 2, {"knowledge": {}})["revision"] == 2
    assert (
        records.save(
            tmp_path,
            "course",
            2,
            {"knowledge": {"resources": current["knowledge"]["resources"]}},
        )["revision"]
        == 2
    )
    with pytest.raises(ValueError, match="revision conflict"):
        records.save(tmp_path, "course", 1, {"knowledge": {"notation": None}})
    records.save(
        tmp_path,
        "course",
        2,
        {
            "knowledge": {
                "resources": None,
                "current-resources": current["knowledge"]["resources"],
            }
        },
        expected_digest=current["digest"],
        confirm_qualification_changes=["resources"],
    )
    renamed = records.read(tmp_path, "course")
    assert isinstance(renamed, dict)
    assert renamed["knowledge"] == {
        "current-resources": current["knowledge"]["resources"],
        "notation": current["knowledge"]["notation"],
    }


def test_conflicting_writers_preserve_committed_state(tmp_path: Path) -> None:
    records.save(tmp_path, "course", 0, {"title": "Original"})
    original = records.read(tmp_path, "course")
    with pytest.raises(ValueError, match="revision conflict"):
        records.save(tmp_path, "course", 0, {"title": "Stale"})
    assert records.read(tmp_path, "course") == original
    ready = Barrier(2)

    def write(title: str) -> tuple[bool, str]:
        ready.wait(timeout=5)
        try:
            records.save(tmp_path, "course", 1, {"title": title})
        except ValueError as error:
            assert "revision conflict" in str(error)
            return False, title
        return True, title

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(write, ("First", "Second")))
    winners = [title for succeeded, title in results if succeeded]
    assert len(winners) == 1
    current = records.read(tmp_path, "course")
    assert isinstance(current, dict)
    assert current["revision"] == 2
    assert current["title"] == winners[0]


@pytest.mark.parametrize(
    ("knowledge", "message"),
    [
        (None, "knowledge patch must be an object"),
        ({"Invalid": {"text": "Meaning"}}, "knowledge.Invalid"),
        ({"Invalid": None}, "knowledge.Invalid"),
        ({"x" * 65: {"text": "Meaning"}}, "knowledge"),
        ({"note": "Meaning"}, "knowledge.note"),
        ({"note": {}}, "knowledge.note.text"),
        ({"note": {"text": " "}}, "knowledge.note.text"),
        ({"note": {"text": "Meaning", "confidence": 1}}, "knowledge.note"),
        ({"note": {"text": "Meaning", "topics": ["missing"]}}, "knowledge.note.topics"),
        (
            {"note": {"text": "Meaning", "refs": [{"source": "missing"}]}},
            "knowledge.note.source",
        ),
        ({"note": {"text": "Meaning", "refs": "missing"}}, "knowledge.note.refs"),
        (
            {
                "note": {
                    "text": "Meaning",
                    "refs": [{"source": "sheet", "source_version": "wrong"}],
                }
            },
            "source version no longer matches",
        ),
    ],
)
def test_invalid_knowledge_cannot_partially_publish(
    tmp_path: Path, knowledge: Any, message: str
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {"title": "Original", "sources": {"sheet": {"path": "sheet.pdf"}}},
    )
    original = records.read(tmp_path, "course")
    with pytest.raises(ValueError, match=message):
        records.save(
            tmp_path, "course", 1, {"title": "Do not save", "knowledge": knowledge}
        )
    assert records.read(tmp_path, "course") == original


def test_knowledge_citations_capture_versions_and_protect_links(tmp_path: Path) -> None:
    entry = {
        "text": "Tentative convention.",
        "topics": ["systems"],
        "refs": [{"source": "sheet", "locator": "p. 3"}],
    }
    records.save(
        tmp_path,
        "course",
        0,
        {
            "knowledge": {"convention": entry},
            "topics": {"systems": {}},
            "sources": {"sheet": {"path": "sheet.pdf", "version": "first"}},
        },
    )
    current = records.read(tmp_path, "course")
    assert isinstance(current, dict)
    assert current["knowledge"]["convention"]["refs"] == [
        {"source": "sheet", "locator": "p. 3", "source_version": "first"}
    ]
    assert (
        records.save(tmp_path, "course", 1, {"knowledge": {"convention": entry}})[
            "revision"
        ]
        == 1
    )
    for patch in (
        {"topics": {"systems": None}},
        {"sources": {"sheet": None}},
        {"sources": {"sheet": {"version": "second"}}},
    ):
        with pytest.raises(ValueError):
            records.save(tmp_path, "course", 1, patch)
        assert records.read(tmp_path, "course") == current
    records.save(tmp_path, "course", 1, {"sources": {"sheet": {"path": "moved.pdf"}}})
    moved = records.read(tmp_path, "course")
    assert isinstance(moved, dict)
    assert moved["knowledge"] == current["knowledge"]
    records.save(
        tmp_path,
        "course",
        2,
        {
            "sources": {"sheet": None, "new-sheet": {"path": "new.pdf"}},
            "topics": {"systems": None},
            "knowledge": {
                "convention": {
                    "text": "Revised convention.",
                    "topics": None,
                    "refs": [{"source": "new-sheet"}],
                }
            },
        },
        expected_digest=moved["digest"],
        confirm_qualification_changes=["convention"],
    )
    revised = records.read(tmp_path, "course")
    assert isinstance(revised, dict)
    assert revised["knowledge"]["convention"] == {
        "text": "Revised convention.",
        "refs": [{"source": "new-sheet", "source_version": None}],
    }
    corrupted = dict(revised)
    corrupted["knowledge"] = {
        "convention": {"text": "Uncaptured", "refs": [{"source": "new-sheet"}]}
    }
    with pytest.raises(
        ValueError, match="knowledge.convention.refs requires a captured source_version"
    ):
        records.normalize_record(corrupted)


def test_scope_patches_append_observations_and_preserve_other_fields(
    tmp_path: Path,
) -> None:
    receipt = records.save(
        tmp_path,
        "course",
        0,
        {
            "title": "Course",
            "exam": "2030-02-10",
            "goal": "Understand systems",
            "sources": {
                "sheet": {"path": "course.md", "title": "Exercises"},
                "unused": {"path": "old.md"},
            },
            "tasks": {"work": {"question": "Old question", "hint": "Old hint"}},
            "current_task": "work",
            "topics": {
                "current": {
                    "assessment": {
                        "summary": "Assisted",
                        "observations": ["$first"],
                        "considered_observations": ["$first"],
                    },
                    "review": {
                        "due": "2030-02-01",
                        "reason": "Retry",
                        "task": "Solve unaided",
                        "observations": ["$first"],
                        "considered_observations": ["$first"],
                    },
                },
                "other": {"title": "Untouched"},
                "unused": {},
            },
            "observations": [
                {
                    "as": "first",
                    "topics": ["current"],
                    "text": "Needed help",
                    "source": "sheet",
                }
            ],
        },
    )
    assert receipt["assigned_observations"] == ["o1"]
    receipt = records.save(
        tmp_path,
        "course",
        1,
        {
            "topics": {
                "current": {
                    "assessment": {
                        "summary": "Independent",
                        "observations": ["$second"],
                        "considered_observations": ["o1", "$second"],
                    },
                    "review": {
                        "due": "2030-02-05",
                        "reason": "Check transfer",
                        "task": "New system",
                        "observations": ["$second"],
                        "considered_observations": ["o1", "$second"],
                    },
                },
                "unused": None,
            },
            "sources": {"sheet": {"path": "moved.md"}, "unused": None},
            "observations": [
                {
                    "as": "second",
                    "topics": ["current", "other"],
                    "text": "Explained independently",
                }
            ],
            "tasks": {"work": {"question": "Next question", "hint": None}},
            "current_task": "work",
        },
    )
    assert receipt["assigned_observations"] == ["o2"]
    assert receipt["review_dates"] == {"current": "2030-02-05"}
    current = records.read(tmp_path, "course")
    assert isinstance(current, dict)
    assert current["schema_version"] == 5
    assert current["goal"] == "Understand systems"
    assert current["topics"]["current"]["assessment"]["summary"] == "Independent"
    assert current["topics"]["current"]["assessment"]["observations"] == ["o2"]
    assert current["topics"]["current"]["review"]["due"] == "2030-02-05"
    assert current["topics"]["other"] == {"title": "Untouched"}
    assert current["sources"] == {"sheet": {"path": "moved.md", "title": "Exercises"}}
    assert current["tasks"]["work"] == {"question": "Next question"}
    assert current["observations"]["o1"]["text"] == "Needed help"
    assert current["observations"]["o2"]["topics"] == ["current", "other"]
    receipt = records.save(
        tmp_path, "course", 2, {"topics": {"current": {"review": None}}, "exam": None}
    )
    assert receipt["review_dates"] == {}
    unchanged = records.read(tmp_path, "course")
    path = tmp_path / "state/course.json"
    modified = path.stat().st_mtime_ns
    receipt = records.save(
        tmp_path,
        "course",
        3,
        {"topics": {"current": {"review": None}}, "observations": []},
    )
    assert receipt["revision"] == 3
    assert receipt["assigned_observations"] == []
    assert records.read(tmp_path, "course") == unchanged
    assert path.stat().st_mtime_ns == modified


@pytest.mark.parametrize(
    ("exam", "due"),
    [
        ("2026-09-21", "2026-09-20"),
        ("2026-09-18", "2026-09-18"),
        ("2026-09-17", "2026-09-25"),
        (None, "2026-09-25"),
    ],
)
def test_new_review_interval_respects_upcoming_exam(exam: str | None, due: str) -> None:
    metadata = {
        "observations": [],
        "considered_observations": None,
        "assessed_at": None,
    }
    record = records.normalize_record(
        {
            "exam": exam,
            "topics": {
                "practice": {
                    "review": {**metadata, "in_days": 7, "reason": "Independent retry"}
                },
                "scheduled": {"review": {**metadata, "due": "2026-09-22"}},
            },
        },
        today=date(2026, 9, 18),
    )
    assert record["topics"]["practice"]["review"] == {
        **metadata,
        "due": due,
        "reason": "Independent retry",
    }
    assert record["topics"]["scheduled"]["review"] == {**metadata, "due": "2026-09-22"}


@pytest.mark.parametrize(
    "patch",
    [
        {"topics": {"systems": None}},
        {"sources": {"sheet": None}},
        {"focus": ["absent"]},
        {"tasks": {"work": {"observations": ["o99"]}}, "current_task": "work"},
        {
            "observations": [
                {"topics": ["systems"], "text": "Correction", "corrects": ["o99"]}
            ]
        },
        {
            "observations": [
                {"topics": ["systems"], "text": "Self correction", "corrects": ["o2"]}
            ]
        },
        {"observations": {"o1": {"text": "Overwritten"}}},
        {"topics": {"systems": {"evidence": ["Old shape"]}}},
    ],
)
def test_invalid_references_do_not_partially_publish(
    tmp_path: Path, patch: dict[str, Any]
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {"systems": {}},
            "sources": {"sheet": {"path": "sheet.pdf"}},
            "observations": [
                {
                    "topics": ["systems"],
                    "text": "Original",
                    "refs": [{"source": "sheet", "locator": "p. 2"}],
                }
            ],
        },
    )
    path = tmp_path / "state/course.json"
    original = path.read_bytes()
    with pytest.raises(ValueError):
        records.save(tmp_path, "course", 1, {"title": "Must not commit", **patch})
    assert path.read_bytes() == original


def test_storage_missing_noop_and_mutating_transform(tmp_path: Path) -> None:
    path = tmp_path / "preferences.json"
    assert storage.update(path, 0, lambda current: current) == {"revision": 0}
    assert not path.exists()

    def mutate(current: dict[str, Any]) -> dict[str, Any]:
        current["value"] = "saved"
        return current

    result = storage.update(path, 0, mutate)
    assert result["revision"] == 1
    assert storage.load(path) == result
    assert storage.update(path, 1, mutate) == result


@pytest.mark.parametrize(
    "patch",
    [
        {"frame": {"observations": ["o99"]}},
        {"frame": {"refs": [{"source": "missing"}]}},
        {
            "plan": {
                "status": "proposed",
                "nodes": {"a": {"label": "A", "needs": ["missing"]}},
            }
        },
        {
            "plan": {
                "status": "proposed",
                "nodes": {
                    "a": {"label": "A", "needs": ["b"]},
                    "b": {"label": "B", "needs": ["a"]},
                },
            }
        },
        {
            "plan": {
                "status": "proposed",
                "nodes": {"a": {"label": "A", "topics": ["missing"]}},
            }
        },
        {
            "plan": {
                "status": "agreed",
                "current": "missing",
                "nodes": {"a": {"label": "A"}},
            }
        },
    ],
)
def test_broken_lesson_links_cannot_overwrite_saved_task(
    tmp_path: Path, patch: dict[str, Any]
) -> None:
    records.save(tmp_path, "course", 0, {"tasks": {"work": {"task": "Keep this"}}})
    before = (tmp_path / "state/course.json").read_bytes()
    with pytest.raises(ValueError):
        records.save(tmp_path, "course", 1, {"tasks": {"work": patch}})
    assert (tmp_path / "state/course.json").read_bytes() == before


def test_knowledge_patch_preserves_evidential_metadata_and_clears_explicitly(
    tmp_path: Path,
) -> None:
    original = {
        "text": "Two undated handouts disagree on the convention.",
        "attribution": "Learner reports the lecturer uses the discrete convention.",
        "uncertainty": "Neither handout establishes which applies to this exam.",
        "conflicts": ["One handout uses the continuous convention."],
        "aliases": ["convenzione", "notation"],
    }
    receipt = records.save(tmp_path, "course", 0, {"knowledge": {"notation": original}})
    records.save(
        tmp_path,
        "course",
        1,
        {
            "knowledge": {
                "notation": {"text": "The two handouts use different notation."}
            }
        },
        expected_digest=receipt["digest"],
    )
    current = records.read(tmp_path, "course")
    assert isinstance(current, dict)
    assert current["knowledge"]["notation"] == {
        **original,
        "text": "The two handouts use different notation.",
    }
    records.save(
        tmp_path,
        "course",
        2,
        {"knowledge": {"notation": {"uncertainty": None, "conflicts": None}}},
        expected_digest=current["digest"],
        confirm_qualification_changes=["notation"],
    )
    cleared = records.read(tmp_path, "course")
    assert isinstance(cleared, dict)
    assert "uncertainty" not in cleared["knowledge"]["notation"]
    assert "conflicts" not in cleared["knowledge"]["notation"]
    assert cleared["knowledge"]["notation"]["attribution"] == original["attribution"]
    with pytest.raises(ValueError, match="text must be a nonempty string"):
        records.save(tmp_path, "course", 3, {"knowledge": {"notation": {"text": None}}})


@pytest.mark.parametrize(
    "metadata",
    [
        {"attribution": []},
        {"uncertainty": " "},
        {"conflicts": "unsure"},
        {"conflicts": [""]},
        {"aliases": ["one", "one"]},
        {"unsupported": None},
    ],
)
def test_knowledge_rejects_invalid_metadata(
    tmp_path: Path, metadata: dict[str, Any]
) -> None:
    with pytest.raises(ValueError, match="knowledge.note"):
        records.save(
            tmp_path,
            "course",
            0,
            {"knowledge": {"note": {"text": "Claim", **metadata}}},
        )
    assert not (tmp_path / "state/course.json").exists()


def test_read_entry_can_be_edited_without_dropping_captured_source_metadata(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "sources": {"sheet": {"path": "sheet.pdf", "version": "2026"}},
            "knowledge": {
                "notation": {"text": "Convention", "refs": [{"source": "sheet"}]}
            },
        },
    )
    current = records.read(tmp_path, "course")
    assert isinstance(current, dict)
    entry = current["knowledge"]["notation"]
    entry["text"] = "Qualified convention"
    receipt = records.save(tmp_path, "course", 1, {"knowledge": {"notation": entry}})
    assert receipt["revision"] == 2
    entry["refs"][0]["source_version"] = "wrong"
    with pytest.raises(ValueError, match="source version no longer matches"):
        records.save(tmp_path, "course", 2, {"knowledge": {"notation": entry}})


def test_scope_digest_rejects_divergent_content_at_same_revision(
    tmp_path: Path,
) -> None:
    receipt = records.save(tmp_path, "course", 0, {"title": "First device"})
    current = records.read(tmp_path, "course")
    assert isinstance(current, dict)
    assert current["digest"] == receipt["digest"]
    assert storage.digest(current) == receipt["digest"]
    path = tmp_path / "state/course.json"
    replacement = path.read_text().replace("First device", "Other device")
    path.write_text(replacement)
    with pytest.raises(storage.RevisionConflict, match="snapshot conflict"):
        records.save(
            tmp_path,
            "course",
            1,
            {"title": "Stale edit"},
            expected_digest=receipt["digest"],
        )
    assert path.read_text() == replacement
    assert '"digest"' not in replacement


@pytest.mark.parametrize(
    "change,guarded",
    [
        ({"uncertainty": None}, True),
        ({"attribution": "Official notice"}, True),
        ({"uncertainty": "Not checked; new detail"}, True),
        ({"conflicts": ["Undated B"]}, True),
        ({"refs": [{"source": "sheet", "locator": "p1"}]}, True),
        (None, True),
        ({"text": "A clarified assertion"}, False),
        ({"uncertainty": "Not checked"}, False),
        ({"conflicts": ["Undated B", "Undated A", "Undated C"]}, False),
        ({"aliases": ["notation"]}, False),
        (
            {
                "refs": [
                    {"source": "sheet", "locator": "p2"},
                    {"source": "sheet", "locator": "p1", "excerpt": "A claim"},
                ]
            },
            False,
        ),
    ],
)
def test_qualification_guard_distinguishes_loss_from_addition(
    tmp_path: Path, change: Any, guarded: bool
) -> None:
    first = records.save(
        tmp_path,
        "course",
        0,
        {
            "sources": {"sheet": {"path": "sheet.md"}},
            "knowledge": {
                "notation": {
                    "text": "A claim",
                    "attribution": "Learner report",
                    "uncertainty": "Not checked",
                    "conflicts": ["Undated A", "Undated B"],
                    "refs": [
                        {"source": "sheet", "locator": "p1", "excerpt": "A claim"}
                    ],
                }
            },
        },
    )
    path = tmp_path / "state/course.json"
    before = path.read_bytes()
    result = records.save(
        tmp_path, "course", first["revision"], {"knowledge": {"notation": change}}
    )
    if guarded:
        assert result["status"] == "needs_confirmation"
        assert result["revision"] == first["revision"]
        assert result["digest"] == first["digest"]
        assert result["changes"][0]["entry"] == "notation"
        assert "assigned_observations" not in result
        assert path.read_bytes() == before
        if change is None:
            assert result["changes"][0]["deleted"] is True
            assert result["changes"][0]["before"]["text"] == "A claim"
    else:
        assert "status" not in result


def test_qualification_review_blocks_whole_transaction_and_retry_commits_once(
    tmp_path: Path,
) -> None:
    first = records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {"systems": {}},
            "tasks": {"exercise": {"task": "Solve"}},
            "knowledge": {
                "a": {"text": "Old", "uncertainty": "Unknown"},
                "z": {"text": "Plain assertion"},
            },
        },
    )
    patch = {
        "observations": [{"topics": ["systems"], "text": "A real assisted attempt"}],
        "tasks": {"exercise": None},
        "sources": {"notice": {"path": "notice.md"}},
        "knowledge": {"a": {"text": "New", "uncertainty": None}, "z": None},
    }
    path = tmp_path / "state/course.json"
    before = path.read_bytes()
    preview = records.save(
        tmp_path,
        "course",
        1,
        patch,
        expected_digest=first["digest"],
        confirm_qualification_changes=["z"],
    )
    assert preview["status"] == "needs_confirmation"
    assert path.read_bytes() == before
    assert [item["entry"] for item in preview["changes"]] == ["a", "z"]
    assert preview["changes"][0]["fields"] == {
        "uncertainty": {"before": "Unknown", "after": None},
        "text": {"before": "Old", "after": "New"},
    }
    saved = records.save(
        tmp_path,
        "course",
        preview["revision"],
        patch,
        expected_digest=preview["digest"],
        confirm_qualification_changes=["a", "z"],
    )
    assert saved["assigned_observations"] == ["o1"]
    current = records.read(tmp_path, "course")
    assert isinstance(current, dict)
    assert current["revision"] == 2
    assert current["observation_sequence"] == 1
    assert current["tasks"] == {}
    assert current["knowledge"] == {"a": {"text": "New"}}
    assert current["sources"]["notice"]["path"] == "notice.md"
    assert "confirm_qualification_changes" not in current
    with pytest.raises(storage.RevisionConflict):
        records.save(
            tmp_path,
            "course",
            1,
            patch,
            expected_digest=preview["digest"],
            confirm_qualification_changes=["a", "z"],
        )
    assert len(records.read(tmp_path, "course")["observations"]) == 1


@pytest.mark.parametrize(
    "confirmed", [["missing"], ["notation", "notation"], "notation", [None]]
)
def test_invalid_qualification_acknowledgment_never_publishes(
    tmp_path: Path, confirmed: Any
) -> None:
    first = records.save(
        tmp_path,
        "course",
        0,
        {"knowledge": {"notation": {"text": "Original", "uncertainty": "Unknown"}}},
    )
    path = tmp_path / "state/course.json"
    before = path.read_bytes()
    with pytest.raises(ValueError, match="confirm_qualification_changes"):
        records.save(
            tmp_path,
            "course",
            1,
            {"knowledge": {"notation": None}},
            expected_digest=first["digest"],
            confirm_qualification_changes=confirmed,
        )
    assert path.read_bytes() == before


def test_review_validation_conflicts_and_repair(tmp_path: Path) -> None:
    first = records.save(
        tmp_path,
        "course",
        0,
        {"knowledge": {"notation": {"text": "Original", "uncertainty": "Unknown"}}},
    )
    removal = {"knowledge": {"notation": None}}
    with pytest.raises(ValueError, match="requires expected_digest"):
        records.save(
            tmp_path, "course", 1, removal, confirm_qualification_changes=["notation"]
        )
    with pytest.raises(ValueError, match="outside the state patch"):
        records.save(
            tmp_path, "course", 1, {"confirm_qualification_changes": ["notation"]}
        )
    with pytest.raises(ValueError, match="text must be a nonempty string"):
        records.save(
            tmp_path,
            "course",
            1,
            {"knowledge": {"notation": {"text": None, "uncertainty": None}}},
        )
    with pytest.raises(ValueError, match="only entries with guarded changes"):
        records.save(
            tmp_path,
            "course",
            1,
            {"knowledge": {"notation": {"text": "Clarified"}}},
            expected_digest=first["digest"],
            confirm_qualification_changes=["notation"],
        )
    assert (
        records.save(tmp_path, "course", 1, removal)["status"] == "needs_confirmation"
    )
    repaired = records.save(
        tmp_path,
        "course",
        1,
        {
            "knowledge": {
                "new-fact": {"text": "A different assertion"},
                "notation": {"attribution": "Learner report"},
            }
        },
    )
    assert repaired["revision"] == 2
    path = tmp_path / "state/course.json"
    changed = path.read_text().replace("Original", "Concurrent edit")
    path.write_text(changed)
    with pytest.raises(storage.RevisionConflict, match="snapshot conflict"):
        records.save(
            tmp_path,
            "course",
            2,
            removal,
            expected_digest=repaired["digest"],
            confirm_qualification_changes=["notation"],
        )
    assert path.read_text() == changed


@pytest.mark.parametrize("invalid", [float("nan"), float("inf"), "\ud800"])
def test_unserializable_candidate_is_invalid_before_qualification_preview(
    tmp_path: Path, invalid: Any
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "knowledge": {
                "notation": {"text": "Original", "uncertainty": "Unknown"},
            }
        },
    )
    path = tmp_path / "state/course.json"
    before = path.read_bytes()
    with pytest.raises(ValueError):
        records.save(
            tmp_path,
            "course",
            1,
            {
                "knowledge": {"notation": {"uncertainty": None}},
                "extra": invalid,
            },
        )
    assert path.read_bytes() == before
