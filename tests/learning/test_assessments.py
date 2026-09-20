from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from threading import Barrier
from typing import Any

import pytest

from learning import records, retrieval, preferences


def seed(root: Path) -> None:
    records.save(
        root,
        "course",
        0,
        {
            "focus": ["systems"],
            "topics": {
                "systems": {
                    "assessment": {
                        "summary": "One independent attempt",
                        "observations": ["$attempt"],
                        "considered_observations": ["$attempt"],
                    },
                    "review": {
                        "in_days": 2,
                        "reason": "Check transfer",
                        "task": "Solve a new system",
                        "observations": ["$attempt"],
                        "considered_observations": ["$attempt"],
                    },
                },
                "other": {},
            },
            "observations": [
                {
                    "as": "attempt",
                    "topics": ["systems"],
                    "text": "Attempt",
                    "origin": "direct_attempt",
                    "assistance": "No help",
                }
            ],
        },
    )


def topic(root: Path) -> dict[str, Any]:
    result = records.read(root, "course")
    assert isinstance(result, dict)
    return result["topics"]["systems"]


def test_assessment_and_review_follow_relevant_evidence_and_cross_topic_corrections(
    tmp_path: Path,
) -> None:
    seed(tmp_path)
    assert topic(tmp_path)["assessment"]["pending"] is False
    assert topic(tmp_path)["review"]["pending"] is False
    records.save(
        tmp_path,
        "course",
        1,
        {"observations": [{"topics": ["other"], "text": "Unrelated attempt"}]},
    )
    assert topic(tmp_path)["assessment"]["pending"] is False
    records.save(
        tmp_path,
        "course",
        2,
        {
            "observations": [
                {
                    "topics": ["other"],
                    "text": "Actually the original attempt was assisted",
                    "corrects": ["o1"],
                }
            ]
        },
    )
    assert topic(tmp_path)["assessment"]["pending"] is True
    assert topic(tmp_path)["review"]["pending"] is True
    records.save(
        tmp_path,
        "course",
        3,
        {
            "topics": {
                "systems": {
                    "assessment": {
                        "summary": "Assisted attempt only",
                        "observations": ["o3"],
                        "considered_observations": ["o1", "o3"],
                    }
                }
            }
        },
    )
    assert topic(tmp_path)["assessment"]["pending"] is False
    assert topic(tmp_path)["review"]["pending"] is True
    records.save(
        tmp_path,
        "course",
        4,
        {
            "observations": [
                {
                    "topics": ["other"],
                    "text": "Correction of the correction",
                    "corrects": ["o3"],
                }
            ]
        },
    )
    assert topic(tmp_path)["assessment"]["pending"] is True
    state = records.read(tmp_path, "course")
    assert isinstance(state, dict)
    assert set(retrieval.evidence(state, ["o1"])) == {"o1", "o3", "o4"}


def test_new_topic_evidence_invalidates_interpretation_without_rewriting_it(
    tmp_path: Path,
) -> None:
    seed(tmp_path)
    records.save(
        tmp_path,
        "course",
        1,
        {"observations": [{"topics": ["systems"], "text": "A later difficulty"}]},
    )
    assert topic(tmp_path)["assessment"]["pending"] is True
    assert topic(tmp_path)["assessment"]["summary"] == "One independent attempt"
    saved = json.loads((tmp_path / "state/course.json").read_text())
    assert "pending" not in saved["topics"]["systems"]["assessment"]
    assert saved["observations"]["o1"]["recorded_at"]
    assert "date" not in saved["observations"]["o1"]
    assert "as" not in saved["observations"]["o1"]


def test_unknown_assessment_is_explicit_and_pending(tmp_path: Path) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {
                "systems": {
                    "assessment": {
                        "uncertainty": "Not assessed",
                        "observations": [],
                        "considered_observations": [],
                    }
                }
            }
        },
    )
    assert topic(tmp_path)["assessment"]["pending"] is True
    with pytest.raises(ValueError, match="supporting observations"):
        records.save(
            tmp_path,
            "course",
            1,
            {
                "topics": {
                    "systems": {
                        "assessment": {
                            "summary": "Mastered",
                            "observations": [],
                            "considered_observations": [],
                        }
                    }
                }
            },
        )


@pytest.mark.parametrize(
    "field,value", [("assessed_at", None), ("reviewed_through", 0), ("pending", False)]
)
def test_agent_cannot_assign_assessment_metadata(
    tmp_path: Path, field: str, value: Any
) -> None:
    seed(tmp_path)
    with pytest.raises(ValueError, match="helper-owned"):
        records.save(
            tmp_path,
            "course",
            1,
            {
                "topics": {
                    "systems": {
                        "assessment": {
                            "summary": "Claim",
                            "observations": ["o1"],
                            "considered_observations": ["o1"],
                            field: value,
                        }
                    }
                }
            },
        )


@pytest.mark.parametrize(
    "field,value",
    [
        ("response", 99),
        ("assistance", False),
        ("uncertainty", []),
        ("task", {}),
        ("origin", "guessed"),
        ("recorded_at", None),
    ],
)
def test_observation_contract_rejects_unusable_canonical_fields(
    tmp_path: Path, field: str, value: Any
) -> None:
    seed(tmp_path)
    with pytest.raises(ValueError):
        records.save(
            tmp_path,
            "course",
            1,
            {
                "observations": [
                    {"topics": ["systems"], "text": "Attempt", field: value}
                ]
            },
        )
    assert len(retrieval.context(tmp_path, "course")["observations"]) == 1  # type: ignore[index]


def test_source_move_preserves_edition_and_new_edition_requires_new_handle(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {"t": {}},
            "sources": {"sheet": {"path": "old.md", "version": "edition-1"}},
            "observations": [
                {
                    "topics": ["t"],
                    "text": "Attempt",
                    "refs": [
                        {"source": "sheet", "locator": "1b", "excerpt": "Solve Ax=b"}
                    ],
                }
            ],
        },
    )
    records.save(tmp_path, "course", 1, {"sources": {"sheet": {"path": "moved.md"}}})
    state = retrieval.context(tmp_path, "course", observations=["o1"])
    assert isinstance(state, dict)
    assert state["observations"]["o1"]["refs"][0]["source_version"] == "edition-1"
    assert state["sources"]["sheet"]["path"] == "moved.md"
    with pytest.raises(ValueError, match="new source handle"):
        records.save(
            tmp_path, "course", 2, {"sources": {"sheet": {"version": "edition-2"}}}
        )
    records.save(
        tmp_path,
        "course",
        2,
        {
            "sources": {"revised": {"path": "moved.md", "version": "edition-2"}},
            "observations": [
                {
                    "topics": ["t"],
                    "text": "New edition",
                    "refs": [{"source": "revised"}],
                }
            ],
        },
    )


def test_alias_failure_does_not_publish_partial_state(tmp_path: Path) -> None:
    seed(tmp_path)
    before = (tmp_path / "state/course.json").read_bytes()
    with pytest.raises(ValueError, match="unknown observation alias"):
        records.save(
            tmp_path,
            "course",
            1,
            {
                "observations": [
                    {
                        "topics": ["systems"],
                        "text": "Correction",
                        "corrects": ["$missing"],
                    }
                ]
            },
        )
    assert (tmp_path / "state/course.json").read_bytes() == before


def test_preference_creation_and_topic_removal_cannot_commit_a_dangling_selector(
    tmp_path: Path,
) -> None:
    records.save(tmp_path, "course", 0, {"topics": {"unused": {}}})
    barrier = Barrier(2)

    def write(which: str) -> bool:
        barrier.wait(timeout=5)
        try:
            if which == "remove":
                records.save(tmp_path, "course", 1, {"topics": {"unused": None}})
            else:
                preferences.save(
                    tmp_path,
                    0,
                    {
                        "rules": [
                            {
                                "when": {"scope": "course", "topic": "unused"},
                                "values": {
                                    "style": {
                                        "instruction": "Use examples",
                                        "origin": "explicit",
                                    }
                                },
                            }
                        ]
                    },
                )
        except ValueError:
            return False
        return True

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sum(executor.map(write, ["remove", "preference"])) == 1
    state = records.read(tmp_path, "course")
    assert isinstance(state, dict)
    policy = preferences.read(tmp_path)
    assert "unused" in state["topics"] or not policy["rules"]


def test_declared_coverage_keeps_partial_reads_and_holes_pending(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {"systems": {}, "other": {}},
            "observations": [
                {"topics": ["systems"], "text": "Solved with help"},
                {"topics": ["systems"], "text": "Could not repeat unaided"},
                {"topics": ["other"], "text": "Unrelated newest attempt"},
            ],
        },
    )
    for revision, considered in enumerate(
        (["o1"], ["o1", "o3"], ["o1", "o2"]), start=1
    ):
        records.save(
            tmp_path,
            "course",
            revision,
            {
                "topics": {
                    "systems": {
                        "assessment": {
                            "summary": "Assisted performance",
                            "observations": ["o1"],
                            "considered_observations": considered,
                        }
                    }
                }
            },
        )
        assert topic(tmp_path)["assessment"]["pending"] is ("o2" not in considered)


@pytest.mark.parametrize("considered", [None, [], ["o99"], ["o1", "o1"], "o1", [1]])
def test_invalid_coverage_does_not_publish(tmp_path: Path, considered: Any) -> None:
    seed(tmp_path)
    before = (tmp_path / "state/course.json").read_bytes()
    with pytest.raises(ValueError, match="considered_observations"):
        records.save(
            tmp_path,
            "course",
            1,
            {
                "topics": {
                    "systems": {
                        "assessment": {
                            "summary": "Claim",
                            "observations": ["o1"],
                            "considered_observations": considered,
                        }
                    }
                }
            },
        )
    assert (tmp_path / "state/course.json").read_bytes() == before


def test_replacement_requires_coverage_without_affecting_sparse_saves(
    tmp_path: Path,
) -> None:
    seed(tmp_path)
    records.save(tmp_path, "course", 1, {"tasks": {"work": {"task": "Continue"}}})
    with pytest.raises(ValueError, match="considered_observations"):
        records.save(
            tmp_path,
            "course",
            2,
            {
                "topics": {
                    "systems": {
                        "assessment": {"summary": "Claim", "observations": ["o1"]}
                    }
                }
            },
        )
    assert topic(tmp_path)["assessment"]["pending"] is False


def test_cross_topic_support_requires_its_corrections_but_not_its_entire_topic(
    tmp_path: Path,
) -> None:
    records.save(
        tmp_path,
        "course",
        0,
        {
            "topics": {
                "systems": {
                    "assessment": {
                        "summary": "Transfer remains uncertain",
                        "observations": ["$support"],
                        "considered_observations": ["$support", "$correction"],
                    }
                },
                "other": {},
            },
            "observations": [
                {"as": "support", "topics": ["other"], "text": "Transfer attempt"},
                {"topics": ["other"], "text": "Unrelated history"},
                {
                    "as": "correction",
                    "topics": ["other"],
                    "text": "Tutor supplied answer",
                    "corrects": ["$support"],
                },
            ],
        },
    )
    assert topic(tmp_path)["assessment"]["considered_observations"] == ["o1", "o3"]
    assert topic(tmp_path)["assessment"]["pending"] is False
    records.save(
        tmp_path,
        "course",
        1,
        {
            "observations": [
                {
                    "topics": ["other"],
                    "text": "Correct attribution again",
                    "corrects": ["o3"],
                }
            ]
        },
    )
    assert topic(tmp_path)["assessment"]["pending"] is True
