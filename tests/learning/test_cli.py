import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

import pytest

from learning.workspace import initialize


@pytest.fixture(autouse=True)
def workspace(tmp_path: Path) -> None:
    initialize(tmp_path)


def invoke(
    root: Path, *args: str, patch: dict[str, Any] | None = None
) -> dict[str, Any]:
    completed = subprocess.run(
        [sys.executable, "-m", "learning", "--workspace", str(root), *args],
        input=json.dumps(patch) if patch is not None else None,
        text=True,
        capture_output=True,
        check=True,
        env={**os.environ, "STUDY_WORKSPACE": str(root)},
    )
    result: dict[str, Any] = json.loads(completed.stdout)
    return result


def test_save_review_and_knowledge_budget_share_core_contract(tmp_path: Path) -> None:
    first = invoke(
        tmp_path,
        "save",
        "course",
        "--expect=0",
        patch={
            "knowledge": {
                "notation": {"text": "g means response", "uncertainty": "Unverified"}
            },
        },
    )
    path = tmp_path / ".study/state/course.json"
    before = path.read_bytes()
    patch = {"knowledge": {"notation": {"uncertainty": None}}}
    preview = invoke(tmp_path, "save", "course", "--expect=1", patch=patch)
    assert preview["status"] == "needs_confirmation"
    assert preview["digest"] == first["digest"]
    assert path.read_bytes() == before
    saved = invoke(
        tmp_path,
        "save",
        "course",
        "--expect=1",
        f"--expect-digest={preview['digest']}",
        '--confirm-qualification-changes=["notation"]',
        patch=patch,
    )
    assert saved["revision"] == 2
    assert "status" not in saved
    for selection in ("", "notation"):
        assert invoke(
            tmp_path,
            "context",
            "course",
            f"--knowledge={selection}",
            "--evidence-budget=2",
        ) == invoke(tmp_path, "context", "course", f"--knowledge={selection}")


def test_context_combines_new_scope_and_saved_policy(tmp_path: Path) -> None:
    root = tmp_path
    empty = invoke(root, "context", "course")
    assert empty["revision"] == 0
    assert empty["vault"] == str(tmp_path)
    assert empty["learning"] == str(root / ".study")
    assert empty["preferences"]["revision"] == 0
    assert empty["preferences"]["rules"] == []
    assert empty["preferences"]["scope_revision"] == 0
    assert len(empty["preferences"]["digest"]) == 64
    saved = invoke(
        root,
        "save",
        "course",
        "--expect",
        "0",
        patch={
            "title": "Course",
            "topics": {"systems": {"domains": ["mathematics"]}},
            "focus": ["systems"],
            "observations": [{"topics": ["systems"], "text": "Needed a hint."}],
            "tasks": {
                "work": {
                    "question": "Why is this solution unique?",
                    "topics": ["systems"],
                }
            },
            "current_task": "work",
        },
    )
    invoke(
        root,
        "preferences",
        "--expect",
        "0",
        patch={
            "rules": [
                {
                    "when": {"domain": "mathematics", "activity": "proof"},
                    "values": {
                        "pace": {
                            "instruction": "Justify each step.",
                            "origin": "explicit",
                        }
                    },
                }
            ],
        },
    )
    resumed = invoke(root, "context", "course", "--activity", "proof")
    assert resumed["revision"] == saved["revision"]
    assert resumed["task"]["question"] == "Why is this solution unique?"
    assert next(iter(resumed["observations"].values()))["text"] == "Needed a hint."
    assert (
        resumed["preferences"]["rules"][0]["values"]["pace"]["instruction"]
        == "Justify each step."
    )
    assert invoke(root, "context", "course")["preferences"]["rules"] == []


def test_evidence_pages_do_not_change_the_current_teaching_policy(
    tmp_path: Path,
) -> None:
    root = tmp_path
    saved = invoke(
        root,
        "save",
        "course",
        "--expect",
        "0",
        patch={
            "topics": {"algebra": {}, "geometry": {"concepts": ["geometry"]}},
            "observations": [
                {"topics": ["algebra"], "text": "First attempt"},
                {
                    "topics": ["geometry"],
                    "text": "Actually a geometry attempt",
                    "corrects": ["o1"],
                },
                {"topics": ["algebra"], "text": "Second algebra attempt"},
            ],
        },
    )
    invoke(
        root,
        "preferences",
        "--expect",
        "0",
        patch={
            "rules": [
                {
                    "when": {"concept": "geometry"},
                    "values": {
                        "style": {"instruction": "Draw a diagram", "origin": "explicit"}
                    },
                }
            ]
        },
    )
    first = invoke(root, "context", "course", "--topics", "algebra", "--limit", "1")
    second = invoke(
        root,
        "context",
        "course",
        "--topics",
        "algebra",
        "--limit",
        "1",
        "--offset",
        "1",
        "--expect",
        str(saved["revision"]),
    )
    assert "geometry" in first["topics"]
    assert first["preferences"]["rules"] == second["preferences"]["rules"] == []
    assert first["selection"]["active_topics"] == ["algebra"]
    switched = invoke(root, "context", "course", "--topics", "geometry")
    assert switched["preferences"]["rules"]
    searched = invoke(root, "context", "course", "--query", "geometry")
    assert searched["preferences"]["rules"] == []


def test_invalid_context_combination_reports_an_error(tmp_path: Path) -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "learning",
            "--workspace",
            str(tmp_path),
            "context",
            "course",
            "--all",
            "--query",
            "x",
        ],
        text=True,
        capture_output=True,
        env={**os.environ, "STUDY_WORKSPACE": str(tmp_path)},
    )
    assert result.returncode == 1
    assert "cannot be combined" in result.stderr
    assert not (tmp_path / ".study/state").exists()


def test_migration_failure_has_a_nonzero_exit_and_preserves_input(
    tmp_path: Path,
) -> None:
    state = tmp_path / ".study/state"
    state.mkdir()
    damaged = state / "broken.json"
    damaged.write_text("{", encoding="utf-8")
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "learning",
            "--workspace",
            str(tmp_path),
            "migrate",
            "--apply",
        ],
        text=True,
        capture_output=True,
        env={**os.environ, "STUDY_WORKSPACE": str(tmp_path)},
    )
    assert completed.returncode == 1
    assert json.loads(completed.stdout)["errors"][0]["scope"] == "broken"
    assert damaged.read_text() == "{"
    assert not (tmp_path / "backups").exists()


def test_exact_knowledge_read_is_focused_and_preserves_source_location(
    tmp_path: Path,
) -> None:
    root = tmp_path
    saved = invoke(
        root,
        "save",
        "course",
        "--expect",
        "0",
        patch={
            "sources": {"notes": {"path": "notes.md", "version": "2026"}},
            "knowledge": {
                "notation": {
                    "text": "The lecturer uses g; the textbook uses h.",
                    "refs": [{"source": "notes", "locator": "Notation"}],
                }
            },
        },
    )
    result = invoke(root, "context", "course", "--knowledge", "notation")
    assert result["revision"] == saved["revision"]
    assert result["knowledge"]["notation"]["text"] == (
        "The lecturer uses g; the textbook uses h."
    )
    assert result["knowledge"]["notation"]["refs"][0]["source_version"] == "2026"
    assert result["sources"]["notes"]["path"] == "notes.md"
    assert (
        not {"preferences", "vault", "assets", "observations", "tasks"} & result.keys()
    )
    index = invoke(root, "context", "course", "--knowledge", "")
    assert index["selection"]["mode"] == "knowledge_index"
    assert index["selection"]["total"] == 1


def test_json_selectors_preserve_handles_with_commas(tmp_path: Path) -> None:
    root = tmp_path
    invoke(
        root,
        "save",
        "course",
        "--expect",
        "0",
        patch={
            "topics": {"unit,1": {}},
            "observations": [{"topics": ["unit,1"], "text": "An independent attempt."}],
        },
    )
    result = invoke(root, "context", "course", "--topics", '["unit,1"]')
    assert result["selection"]["active_topics"] == ["unit,1"]
    assert result["observations"]["o1"]["topics"] == ["unit,1"]


def test_snapshot_conflict_has_a_distinct_machine_readable_error(
    tmp_path: Path,
) -> None:
    root = tmp_path
    saved = invoke(root, "save", "course", "--expect", "0", patch={"title": "First"})
    path = root / ".study/state/course.json"
    changed = json.loads(path.read_text())
    changed["title"] = "Remote replacement at the same revision"
    path.write_text(json.dumps(changed))
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "learning",
            "--workspace",
            str(tmp_path),
            "save",
            "course",
            "--expect",
            str(saved["revision"]),
            "--expect-digest",
            saved["digest"],
        ],
        input=json.dumps({"title": "Overwrite"}),
        text=True,
        capture_output=True,
        env={**os.environ, "STUDY_WORKSPACE": str(root)},
    )
    assert completed.returncode == 1
    assert json.loads(completed.stderr)["error"]["kind"] == "conflict"
    assert json.loads(path.read_text())["title"] == changed["title"]


def test_no_save_blocks_publication_but_allows_context(tmp_path: Path) -> None:
    root = tmp_path
    env = {
        **os.environ,
        "STUDY_WORKSPACE": str(root),
        "LEARNING_NO_SAVE": "1",
    }
    rejected = subprocess.run(
        [
            sys.executable,
            "-m",
            "learning",
            "--workspace",
            str(tmp_path),
            "save",
            "course",
            "--expect",
            "0",
        ],
        input='{"title":"Must not persist"}',
        text=True,
        capture_output=True,
        env=env,
    )
    assert rejected.returncode == 1
    assert json.loads(rejected.stderr)["error"]["kind"] == "no_save"
    assert not (root / ".study/state").exists()
    readable = subprocess.run(
        [
            sys.executable,
            "-m",
            "learning",
            "--workspace",
            str(tmp_path),
            "context",
            "course",
        ],
        text=True,
        capture_output=True,
        env=env,
    )
    assert readable.returncode == 0
    assert json.loads(readable.stdout)["found"] is False
    assert not (root / ".study/state").exists()


def test_source_capture_discovery_and_previewed_forgetting_round_trip(
    tmp_path: Path,
) -> None:
    root = tmp_path
    (tmp_path / "notes.md").write_text("Finite probability spaces.\n")
    saved = invoke(
        root,
        "save",
        "course",
        "--expect",
        "0",
        patch={
            "title": "Probability",
            "sources": {"notes": {"path": "notes.md"}},
            "knowledge": {
                "course-rule": {
                    "text": "Use finite spaces.",
                    "aliases": ["discrete probability"],
                    "attribution": "Learner report",
                }
            },
        },
    )
    captured = invoke(
        root,
        "sources",
        "course",
        "--sources",
        '["notes"]',
        "--expect",
        str(saved["revision"]),
        "--expect-digest",
        saved["digest"],
    )
    assert captured["captured"] == ["notes"]
    assert captured["sources"]["notes"]["status"] == "unchanged"
    discovery = invoke(root, "discover", "discrete probability")
    assert "course-rule" in json.dumps(discovery)
    selection = {"knowledge": ["course-rule"]}
    preview = invoke(root, "forget", "course", patch=selection)
    assert not preview["applied"]
    assert invoke(root, "inspect", "course")["records"][0]["counts"]["knowledge"] == 1
    erased = invoke(
        root,
        "forget",
        "course",
        "--apply",
        "--expect",
        str(preview["revision"]),
        "--expect-digest",
        preview["digest"],
        patch=selection,
    )
    assert erased["applied"]
    record = invoke(root, "inspect", "course")["records"][0]["record"]
    assert record["knowledge"] == {}
    assert (
        record["sources"]["notes"]["fingerprint"]
        == captured["sources"]["notes"]["stored_fingerprint"]
    )
