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


def run(
    root: Path,
    *args: str,
    patch: dict[str, Any] | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "learning", "--workspace", str(root), *args],
        input=json.dumps(patch) if patch is not None else None,
        text=True,
        capture_output=True,
        env={**os.environ, "STUDY_WORKSPACE": str(root), **(env or {})},
    )


def invoke(
    root: Path, *args: str, patch: dict[str, Any] | None = None
) -> dict[str, Any]:
    completed = run(root, *args, patch=patch)
    assert completed.returncode == 0, completed.stderr
    result: dict[str, Any] = json.loads(completed.stdout)
    return result


def failure(
    root: Path, *args: str, patch: dict[str, Any] | None = None
) -> dict[str, Any]:
    completed = run(root, *args, patch=patch)
    assert completed.returncode == 1
    error: dict[str, Any] = json.loads(completed.stderr)["error"]
    return error


def test_save_review_and_knowledge_reads_share_core_contract(tmp_path: Path) -> None:
    first = invoke(
        tmp_path,
        "save",
        "course",
        "--expect=0",
        patch={
            "knowledge": {
                "notation": {"text": "g means response", "uncertainty": "Unverified"}
            }
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
    whole = invoke(tmp_path, "knowledge", "course", "notation")
    assert whole["knowledge"]["notation"] == {"text": "g means response"}
    index = invoke(tmp_path, "knowledge", "course")
    assert index["selection"]["mode"] == "knowledge_index"
    assert index["selection"]["total"] == 1
    assert not {"preferences", "observations", "task", "workspace"} & whole.keys()


def test_resume_combines_new_scope_and_saved_policy_without_path_noise(
    tmp_path: Path,
) -> None:
    root = tmp_path
    empty = invoke(root, "resume", "course")
    assert empty["scope"] == "course"
    assert empty["revision"] == 0
    assert empty["task"] is None
    assert empty["preferences"]["rules"] == []
    assert empty["preferences"]["scope_revision"] == 0
    assert not {"workspace", "vault", "learning", "assets", "found"} & empty.keys()
    listing = invoke(root, "catalog")
    assert listing["scopes"] == []
    assert listing["workspace"] == str(tmp_path)
    assert listing["learning"] == str(root / ".study")
    assert listing["preferences"]["rules"] == []
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
    resumed = invoke(root, "resume", "course", "--activity", "proof")
    assert resumed["revision"] == saved["revision"]
    assert resumed["task"]["question"] == "Why is this solution unique?"
    assert next(iter(resumed["observations"].values()))["text"] == "Needed a hint."
    assert (
        resumed["preferences"]["rules"][0]["values"]["pace"]["instruction"]
        == "Justify each step."
    )
    assert invoke(root, "resume", "course")["preferences"]["rules"] == []
    assert invoke(root, "resume", "Course")["scope"] == "course"


def test_resume_without_scope_selects_the_latest_scope_and_lists_the_rest(
    tmp_path: Path,
) -> None:
    root = tmp_path
    listing = invoke(root, "resume")
    assert listing["scope"] is None and listing["scopes"] == []
    invoke(root, "save", "older", "--expect=0", patch={"title": "Older course"})
    invoke(root, "save", "newer", "--expect=0", patch={"title": "Newer course"})
    result = invoke(root, "resume")
    assert result["scope"] == "newer"
    assert [item["scope"] for item in result["scopes"]] == ["newer", "older"]
    assert "preferences" in result
    invoke(root, "save", "older", "--expect=1", patch={"goal": "Touched again"})
    assert invoke(root, "resume")["scope"] == "older"
    assert (
        failure(root, "resume", "--task", "x")["message"]
        == "resuming a task requires its scope"
    )


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
    first = invoke(root, "evidence", "course", "--topics", "algebra", "--limit", "1")
    second = invoke(
        root,
        "evidence",
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
    switched = invoke(root, "evidence", "course", "--topics", "geometry")
    assert switched["preferences"]["rules"]
    searched = invoke(root, "search", "course", "geometry")
    assert searched["preferences"]["rules"] == []
    assert searched["selection"]["mode"] == "search"


def test_invalid_selections_report_errors_without_creating_state(
    tmp_path: Path,
) -> None:
    error = failure(tmp_path, "evidence", "course")
    assert error["kind"] == "validation"
    assert "topics or observations" in error["message"]
    error = failure(tmp_path, "sources", "course", "--scan", "--add", "x.md")
    assert "choose exactly one" in error["message"]
    assert not (tmp_path / ".study/state").exists()


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
    result = invoke(root, "evidence", "course", "--topics", '["unit,1"]')
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
    error = failure(
        root,
        "save",
        "course",
        "--expect",
        str(saved["revision"]),
        "--expect-digest",
        saved["digest"],
        patch={"title": "Overwrite"},
    )
    assert error["kind"] == "conflict"
    assert json.loads(path.read_text())["title"] == changed["title"]


def test_no_save_blocks_publication_but_allows_reads(tmp_path: Path) -> None:
    root = tmp_path
    env = {"LEARNING_NO_SAVE": "1"}
    rejected = run(
        root,
        "save",
        "course",
        "--expect",
        "0",
        patch={"title": "Must not persist"},
        env=env,
    )
    assert rejected.returncode == 1
    assert json.loads(rejected.stderr)["error"]["kind"] == "no_save"
    assert not (root / ".study/state").exists()
    readable = run(root, "resume", "course", env=env)
    assert readable.returncode == 0
    assert json.loads(readable.stdout)["revision"] == 0
    assert not (root / ".study/state").exists()


def test_source_scan_add_check_discovery_and_previewed_forgetting_round_trip(
    tmp_path: Path,
) -> None:
    root = tmp_path
    (tmp_path / "notes.md").write_text("Finite probability spaces.\n")
    (tmp_path / "lectures").mkdir()
    (tmp_path / "lectures/week 3 slides.pdf").write_bytes(b"%PDF-1.4 fake")
    (tmp_path / ".hidden.md").write_text("ignored")
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
    scanned = invoke(root, "sources", "course", "--scan")
    assert [(item["path"], item["registered"]) for item in scanned["files"]] == [
        ("lectures/week 3 slides.pdf", False),
        ("notes.md", True),
    ]
    assert scanned["files"][0]["suggested_handle"] == "week-3-slides"
    assert scanned["files"][1]["handle"] == "notes"
    added = invoke(
        root,
        "sources",
        "course",
        "--add",
        '["lectures/week 3 slides.pdf"]',
        "--expect",
        str(saved["revision"]),
        f"--expect-digest={saved['digest']}",
    )
    assert added["sources"] == {
        "week-3-slides": {
            "path": "lectures/week 3 slides.pdf",
            "title": "week 3 slides",
        }
    }
    assert added["revision"] == 2
    assert (
        "already registered"
        in failure(root, "sources", "course", "--add", "notes.md", "--expect", "2")[
            "message"
        ]
    )
    assert (
        "does not exist"
        in failure(root, "sources", "course", "--add", "missing.md", "--expect", "2")[
            "message"
        ]
    )
    current = invoke(root, "resume", "course")
    captured = invoke(
        root,
        "sources",
        "course",
        "--check",
        '["notes"]',
        "--expect",
        str(current["revision"]),
        "--expect-digest",
        current["digest"],
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


def test_catalog_for_a_scope_lists_handles_and_route_without_evidence(
    tmp_path: Path,
) -> None:
    invoke(
        tmp_path,
        "save",
        "course",
        "--expect=0",
        patch={
            "title": "Course",
            "topics": {"a": {"title": "A"}},
            "observations": [{"topics": ["a"], "text": "Attempt"}],
            "knowledge": {"note": {"text": "Fact"}},
            "route": {
                "status": "proposed",
                "current": "start",
                "nodes": {"start": {"label": "Start"}},
            },
        },
    )
    index = invoke(tmp_path, "catalog", "course")
    assert index["topic_index"]["a"]["observation_count"] == 1
    assert index["knowledge_keys"] == ["note"]
    assert index["route"]["current"]["id"] == "start"
    assert "observations" not in index and "preferences" not in index


def test_plan_and_journal_read_the_configured_vault_not_the_course_folder(
    tmp_path: Path,
) -> None:
    from datetime import date

    vault = tmp_path / "vault"
    (vault / "journal").mkdir(parents=True)
    (vault / "journal" / f"{date.today().isoformat()}.md").write_text(
        "### **STUDY**\n"
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |\n"
        "| --- | --- | --- | --- | --- |\n"
        "| 09:00 - 10:00 | SMM | 1h | 0m | 0m |\n",
        encoding="utf-8",
    )
    course = tmp_path / "course"
    course.mkdir()
    initialize(course)
    env = {"VAULT_DIR": str(vault)}
    completed = run(
        course, "save", "smm", "--expect=0", patch={"journal_activity": "SMM"}, env=env
    )
    assert completed.returncode == 0, completed.stderr
    planned = run(course, "plan", "smm", "--days", "1", env=env)
    assert planned.returncode == 0, planned.stderr
    assert (
        json.loads(planned.stdout)["scopes"][0]["recent_study"]["status"] == "recorded"
    )
    journal = run(course, "journal", "--days", "1", env=env)
    assert json.loads(journal.stdout)["by_activity"]["SMM"]["study_minutes"] == 60
