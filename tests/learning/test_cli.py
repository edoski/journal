import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any


def invoke(
    root: Path, *args: str, patch: dict[str, Any] | None = None
) -> dict[str, Any]:
    completed = subprocess.run(
        [sys.executable, "-m", "learning", *args],
        input=json.dumps(patch) if patch is not None else None,
        text=True,
        capture_output=True,
        check=True,
        env={**os.environ, "LEARNING_ROOT": str(root), "VAULT_DIR": str(root.parent)},
    )
    result: dict[str, Any] = json.loads(completed.stdout)
    return result


def test_context_combines_new_scope_and_saved_policy(tmp_path: Path) -> None:
    root = tmp_path / "learn"
    empty = invoke(root, "context", "course")
    assert empty["revision"] == 0
    assert empty["vault"] == str(tmp_path)
    assert empty["learning"] == str(root)
    assert empty["preferences"] == {"revision": 0, "rules": [], "scope_revision": 0}
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
    root = tmp_path / "learn"
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
            "context",
            "course",
            "--all",
            "--query",
            "x",
        ],
        text=True,
        capture_output=True,
        env={**os.environ, "LEARNING_ROOT": str(tmp_path)},
    )
    assert result.returncode == 1
    assert "cannot be combined" in result.stderr
    assert not list(tmp_path.iterdir())


def test_migration_failure_has_a_nonzero_exit_and_preserves_input(
    tmp_path: Path,
) -> None:
    state = tmp_path / "state"
    state.mkdir()
    damaged = state / "broken.json"
    damaged.write_text("{", encoding="utf-8")
    completed = subprocess.run(
        [sys.executable, "-m", "learning", "migrate", "--apply"],
        text=True,
        capture_output=True,
        env={**os.environ, "LEARNING_ROOT": str(tmp_path)},
    )
    assert completed.returncode == 1
    assert json.loads(completed.stdout)["errors"][0]["scope"] == "broken"
    assert damaged.read_text() == "{"
    assert not (tmp_path / "backups").exists()


def test_exact_knowledge_read_is_focused_and_preserves_source_location(
    tmp_path: Path,
) -> None:
    root = tmp_path / "learn"
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
