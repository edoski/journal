from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from threading import Barrier
from typing import Any

import pytest

from learning import records, storage


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
