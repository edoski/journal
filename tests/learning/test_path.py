"""The course path: chapters the exam leaves out, where a late topic lands, and
what a half-built path reports about itself."""

from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from learning import records, retrieval
from learning.planning import plan
from learning.workspace import Workspace, initialize

TODAY = date(2026, 10, 10)


@pytest.fixture(autouse=True)
def pinned_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEARNING_TODAY", TODAY.isoformat())


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def course(directory: Path, patch: dict[str, Any]) -> Workspace:
    directory.mkdir(parents=True, exist_ok=True)
    workspace = initialize(directory)
    records.save(workspace, patch)
    return workspace


def planned(workspace: Workspace, vault: Path) -> dict[str, Any]:
    [entry] = plan(workspace, vault, everywhere=False, days=14)["courses"]
    return entry


LEARNING = {
    "title": "Statistical learning",
    "exam": {"date": day(15)},
    "sources": {"notes": {"path": "notes.md"}},
    "topics": {
        "regression": {"title": "Linear regression", "introduced": day(-9)},
        "ridge": {"title": "Ridge", "needs": ["regression"], "introduced": day(-8)},
        "lasso": {"title": "Lasso", "needs": ["regression"], "contrasts": ["ridge"]},
        "pca": {"title": "Principal components", "needs": ["regression"]},
    },
    "observations": [
        {
            "topics": ["ridge"],
            "text": "Derived the ridge estimator",
            "help": "none",
            "result": "correct",
            "date": day(-8),
        },
        {
            "topics": ["regression"],
            "text": "Fitted a line by least squares",
            "help": "none",
            "result": "correct",
            "date": day(-9),
        },
    ],
    "path": {"order": ["regression", "ridge", "lasso", "pca"], "current": "ridge"},
}


def test_an_excluded_chapter_leaves_the_plan_and_keeps_its_history(
    tmp_path: Path,
) -> None:
    workspace = course(tmp_path / "learning", LEARNING)
    vault = tmp_path / "vault"
    before = planned(workspace, vault)
    assert "ridge" in [item["topic"] for item in before["due"]]
    assert {"ridge", "lasso"} <= set(
        before["runup"]["not_introduced"] + before["runup"]["unready"]
    )

    off = "Chapter 4 is off this year's exam"
    records.save(
        workspace, {"topics": {"ridge": {"excluded": off}, "lasso": {"excluded": off}}}
    )

    after = planned(workspace, vault)
    assert "ridge" not in [item["topic"] for item in after["due"]]
    runup = after["runup"]
    assert not {"ridge", "lasso"} & set(
        runup.get("not_introduced", []) + runup.get("unready", [])
    )
    proposed = [
        topic
        for planned_day in after.get("plan", {}).get("days", [])
        for topic in planned_day.get("new", []) + planned_day.get("reviews", [])
    ]
    assert "ridge" not in proposed and "lasso" not in proposed
    assert not {"ridge", "lasso"} & {
        item["topic"] for item in after.get("upcoming", [])
    }

    opened = retrieval.resume(workspace)
    assert [topic for topic, _ in opened["path"]["topics"]] == ["regression", "pca"]
    assert opened["path"]["excluded"] == ["lasso", "ridge"]
    assert "ridge" not in [item["topic"] for item in opened["due"]]

    shown = retrieval.show(workspace, ["ridge"])["items"]["ridge"]
    assert shown["excluded"] == off
    assert shown["standing"]["attempts"] == 1
    mapped = {
        entry["topic"]: entry for entry in retrieval.course_map(workspace)["topics"]
    }
    assert mapped["ridge"]["excluded"] == off
    assert mapped["lasso"]["contrasts"] == ["ridge"]

    records.save(workspace, {"topics": {"ridge": {"excluded": None}}})
    assert "ridge" in [item["topic"] for item in retrieval.resume(workspace)["due"]]


def test_a_studied_topic_never_waits_on_an_excluded_prerequisite(
    tmp_path: Path,
) -> None:
    workspace = course(
        tmp_path / "learning",
        {
            **LEARNING,
            "topics": {
                **LEARNING["topics"],
                "elastic": {"title": "Elastic net", "needs": ["ridge", "regression"]},
            },
        },
    )
    records.save(workspace, {"topics": {"ridge": {"excluded": "Skipped"}}})
    order = [topic for topic, _ in retrieval.resume(workspace)["path"]["topics"]]
    assert "elastic" in order and "ridge" not in order


PATH = {
    "title": "Linear algebra",
    "topics": {
        "systems": {"title": "Linear systems"},
        "rank": {"title": "Rank", "needs": ["systems"]},
        "eigen": {"title": "Eigenvalues", "needs": ["rank"]},
        "svd": {"title": "Singular values", "needs": ["eigen"]},
    },
    "path": {"order": ["systems", "rank", "eigen", "svd"], "current": "eigen"},
}


def path_of(workspace: Workspace) -> list[str]:
    return [topic for topic, _ in retrieval.resume(workspace)["path"]["topics"]]


def test_a_missing_prerequisite_lands_before_the_topic_that_needs_it(
    tmp_path: Path,
) -> None:
    workspace = course(tmp_path / "algebra", PATH)
    receipt = records.save(
        workspace,
        {
            "topics": {
                "determinants": {"title": "Determinants", "needs": ["systems"]},
                "eigen": {"needs": ["rank", "determinants"]},
            }
        },
    )
    assert path_of(workspace) == ["systems", "rank", "determinants", "eigen", "svd"]
    assert receipt["placed"] == {"determinants": {"after": "rank", "before": "eigen"}}


def test_a_late_topic_lands_after_its_last_prerequisite(tmp_path: Path) -> None:
    workspace = course(tmp_path / "algebra", PATH)
    receipt = records.save(
        workspace,
        {"topics": {"inverse": {"title": "Inverse matrices", "needs": ["rank"]}}},
    )
    assert path_of(workspace) == ["systems", "rank", "inverse", "eigen", "svd"]
    assert receipt["placed"] == {"inverse": {"after": "rank", "before": "eigen"}}


def test_a_built_path_reports_no_gaps(tmp_path: Path) -> None:
    built = {
        **PATH,
        "sources": {"slides": {"path": "slides.pdf"}},
        "topics": {
            key: {**topic, "refs": [{"source": "slides", "locator": f"part {n}"}]}
            for n, (key, topic) in enumerate(PATH["topics"].items(), start=1)
        },
    }
    workspace = course(tmp_path / "algebra", built)
    assert "path_health" not in retrieval.resume(workspace)


def test_a_half_built_path_lists_what_it_lacks(tmp_path: Path) -> None:
    workspace = course(
        tmp_path / "algebra",
        {
            "sources": {"slides": {"path": "slides.pdf"}},
            "topics": {
                "systems": {
                    "title": "Linear systems",
                    "refs": [{"source": "slides", "locator": "week 1"}],
                },
                "rank": {
                    "needs": ["systems"],
                    "refs": [{"source": "slides", "locator": "week 2"}],
                },
                "proofs": {"title": "Proof techniques"},
                "dropped": {"title": "Tensors", "excluded": "Not examined"},
            },
            "path": {"order": ["systems", "rank"]},
        },
    )
    assert retrieval.resume(workspace)["path_health"] == {
        "untitled": ["rank"],
        "unplaced": ["proofs"],
        "unlinked": ["proofs"],
        "unreferenced": ["proofs"],
    }
