from hashlib import sha256
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

from learning import lessons, memory, preferences, records, storage, visuals


def seed(root: Path) -> None:
    records.save(
        root,
        "algebra",
        0,
        {
            "title": "Algebra",
            "topics": {"matrix": {}, "vector": {}},
            "knowledge": {"notation": {"text": "Columns are ordered."}},
            "observations": [
                {
                    "as": "wrong",
                    "topics": ["matrix"],
                    "text": "Tutor misread the attempt.",
                    "origin": "tutor_inference",
                },
                {
                    "as": "correction",
                    "topics": ["matrix"],
                    "text": "Learner corrected that reading.",
                    "origin": "self_report",
                    "corrects": ["$wrong"],
                },
                {
                    "as": "independent",
                    "topics": ["vector"],
                    "text": "Explained the basis independently.",
                    "origin": "direct_attempt",
                },
            ],
            "tasks": {
                "exercise": {
                    "task": "Finish the exercise",
                    "topics": ["matrix"],
                    "observations": ["$wrong", "$correction"],
                    "frame": {
                        "goal": "Understand basis choice",
                        "observations": ["$wrong"],
                    },
                }
            },
            "current_task": "exercise",
        },
    )
    records.save(
        root,
        "algebra",
        1,
        {
            "topics": {
                "matrix": {
                    "assessment": {
                        "summary": "Reading corrected",
                        "observations": ["o2"],
                        "considered_observations": ["o1", "o2"],
                    },
                    "review": {
                        "reason": "Check independently",
                        "task": "Explain another matrix",
                        "in_days": 3,
                        "observations": ["o2"],
                        "considered_observations": ["o1", "o2"],
                    },
                },
                "vector": {
                    "assessment": {
                        "summary": "Independent explanation",
                        "observations": ["o3"],
                        "considered_observations": ["o3"],
                    }
                },
            }
        },
    )


def apply(
    root: Path, scope: str | None, selection: dict[str, Any], **kwargs: Any
) -> dict[str, Any]:
    preview = memory.forget(root, scope, selection, **kwargs)
    return memory.forget(
        root,
        scope,
        selection,
        expected=preview["revision"],
        expected_digest=preview["digest"],
        apply=True,
        **kwargs,
    )


def test_selective_forgetting_repairs_evidence_without_reusing_handles(
    tmp_path: Path,
) -> None:
    seed(tmp_path)
    path = tmp_path / "state/algebra.json"
    before = path.read_bytes()
    preview = memory.forget(tmp_path, "algebra", {"observations": ["o1"]})
    assert not preview["applied"]
    assert path.read_bytes() == before
    assert set(preview["effects"]["invalidated"]) == {
        "topics.matrix.assessment",
        "topics.matrix.review",
    }
    result = apply(tmp_path, "algebra", {"observations": ["o1"]})
    current = storage.load(path)
    assert result["applied"]
    assert current["observations"]["o2"]["corrects"] == []
    assert current["tasks"]["exercise"]["observations"] == ["o2"]
    assert current["tasks"]["exercise"]["frame"]["observations"] == []
    assert current["topics"]["matrix"] == {}
    assert current["topics"]["vector"]["assessment"]["observations"] == ["o3"]
    assert current["knowledge"]["notation"]["text"] == "Columns are ordered."
    apply(tmp_path, "algebra", {"observations": ["o3"]})
    receipt = records.save(
        tmp_path,
        "algebra",
        4,
        {"observations": [{"topics": ["vector"], "text": "A fresh attempt."}]},
    )
    assert receipt["assigned_observations"] == ["o4"]


def test_apply_requires_exact_preview_and_detects_same_revision_conflict(
    tmp_path: Path,
) -> None:
    seed(tmp_path)
    selection = {"knowledge": ["notation"]}
    preview = memory.forget(tmp_path, "algebra", selection)
    with pytest.raises(ValueError, match="requires expected revision"):
        memory.forget(tmp_path, "algebra", selection, apply=True)
    with pytest.raises(storage.RevisionConflict, match="selection or snapshot"):
        memory.forget(
            tmp_path,
            "algebra",
            {"tasks": ["exercise"]},
            expected=preview["revision"],
            expected_digest=preview["digest"],
            apply=True,
        )
    path = tmp_path / "state/algebra.json"
    state = storage.load(path)
    state["title"] = "Externally edited at same revision"
    path.write_text(json.dumps(state), encoding="utf-8")
    with pytest.raises(storage.RevisionConflict, match="selection or snapshot"):
        memory.forget(
            tmp_path,
            "algebra",
            selection,
            expected=preview["revision"],
            expected_digest=preview["digest"],
            apply=True,
        )
    assert "notation" in storage.load(path)["knowledge"]


def test_preferences_and_course_are_deliberate_separate_operations(
    tmp_path: Path,
) -> None:
    seed(tmp_path)
    preferences.save(
        tmp_path,
        0,
        {
            "rules": [
                {
                    "when": {},
                    "values": {
                        "language": {"instruction": "Italian", "origin": "explicit"}
                    },
                },
                {
                    "when": {"scope": "algebra", "topic": "matrix"},
                    "values": {
                        "style": {
                            "instruction": "Explain notation",
                            "origin": "explicit",
                        }
                    },
                },
            ]
        },
    )
    inspected = memory.inspect(tmp_path, "algebra")
    assert inspected["records"][0]["record"]["title"] == "Algebra"
    assert inspected["records"][0]["counts"]["observations"] == 3
    scoped = [
        key
        for key, item in inspected["preferences"]["entries"].items()
        if item["when"].get("scope") == "algebra"
    ]
    with pytest.raises(ValueError, match="remove scoped preferences"):
        memory.forget(tmp_path, "algebra", {"course": True})
    apply(tmp_path, None, {"preferences": scoped})
    apply(tmp_path, "algebra", {"course": True})
    state = storage.load(tmp_path / "state/algebra.json")
    assert (
        state["topics"]
        == state["observations"]
        == state["tasks"]
        == state["sources"]
        == {}
    )
    assert "title" not in state
    assert state["observation_sequence"] == 3
    assert (
        preferences.read(tmp_path)["rules"][0]["values"]["language"]["instruction"]
        == "Italian"
    )


def test_task_and_knowledge_erasure_preserves_other_state(tmp_path: Path) -> None:
    seed(tmp_path)
    apply(tmp_path, "algebra", {"tasks": ["exercise"], "knowledge": ["notation"]})
    state = storage.load(tmp_path / "state/algebra.json")
    assert "current_task" not in state
    assert state["tasks"] == state["knowledge"] == {}
    assert len(state["observations"]) == 3
    with pytest.raises(ValueError, match="unknown observations"):
        memory.forget(tmp_path, "algebra", {"observations": ["o99"]})
    with pytest.raises(ValueError, match="cannot mix"):
        memory.forget(
            tmp_path, "algebra", {"tasks": ["exercise"], "preferences": ["p1"]}
        )


def test_owned_artifacts_are_explicit_and_snapshot_guarded(tmp_path: Path) -> None:
    root = tmp_path / "learn"
    session = str(uuid4())
    lesson = lessons.publish(root, session, "A worked example")
    assets = tmp_path / "assets/learn"
    diagram = visuals.publish_svg(
        tmp_path,
        "Basis",
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0L1 1"/></svg>',
        assets=assets,
    )
    svg = next(assets.glob("*.svg"))
    assert diagram
    paths = [f"sessions/{session}.md", f"assets/{svg.name}"]
    inventory = memory.inspect(root, assets=assets)
    assert {item["path"] for item in inventory["artifacts"]} == set(paths)
    preview = memory.forget(root, None, {"artifacts": paths}, assets=assets)
    lesson.write_text(
        lesson.read_text(encoding="utf-8") + "Learner annotation\n", encoding="utf-8"
    )
    with pytest.raises(storage.RevisionConflict):
        memory.forget(
            root,
            None,
            {"artifacts": paths},
            assets=assets,
            expected=0,
            expected_digest=preview["digest"],
            apply=True,
        )
    result = apply(root, None, {"artifacts": paths}, assets=assets)
    assert result["complete"] and not result["atomic"]
    assert not lesson.exists() and not svg.exists()
    assert "native transcripts" in result["retained"]["history"]


def test_unowned_and_linked_files_are_not_removable(tmp_path: Path) -> None:
    directory = tmp_path / "sessions"
    directory.mkdir()
    session = str(uuid4())
    (directory / f"{session}.md").write_text("Personal note", encoding="utf-8")
    with pytest.raises(ValueError, match="unowned"):
        memory.forget(tmp_path, None, {"artifacts": [f"sessions/{session}.md"]})
    (directory / "linked.md").symlink_to(directory / f"{session}.md")
    with pytest.raises(ValueError, match="linked"):
        memory.forget(tmp_path, None, {"artifacts": ["sessions/linked.md"]})
    with pytest.raises(ValueError, match="relative"):
        memory.forget(tmp_path, None, {"artifacts": ["sessions/../preferences.json"]})
    assert len(memory.inspect(tmp_path)["unmanaged"]) == 2


def backup_fixture(root: Path) -> tuple[str, str]:
    prefix = "backups/schema4-to5-20260922T010000Z-12345678"
    target = root / prefix / "state/algebra.json"
    target.parent.mkdir(parents=True)
    raw = b'{"schema_version":4,"revision":1,"private":"Learner report"}'
    target.write_bytes(raw)
    (root / prefix / "manifest.json").write_text(
        json.dumps(
            {
                "migration": "schema4-to5",
                "sha256": {"state/algebra.json": sha256(raw).hexdigest()},
            }
        ),
        encoding="utf-8",
    )
    return f"{prefix}/state/algebra.json", f"{prefix}/manifest.json"


def test_backup_erasure_preserves_manifests_until_all_members_selected(
    tmp_path: Path,
) -> None:
    member, manifest = backup_fixture(tmp_path)
    assert len(memory.inspect(tmp_path)["backups"]) == 2
    with pytest.raises(ValueError, match="select all remaining"):
        memory.forget(tmp_path, None, {"backups": [manifest]})
    result = apply(tmp_path, None, {"backups": [member, manifest]})
    assert result["deleted"] == [member, manifest]
    assert not (tmp_path / member).exists()
    assert not (tmp_path / manifest).exists()


def test_corrupt_backup_is_not_accepted_as_owned(tmp_path: Path) -> None:
    member, _ = backup_fixture(tmp_path)
    (tmp_path / member).write_text("Changed backup", encoding="utf-8")
    with pytest.raises(ValueError, match="checksum differs"):
        memory.forget(tmp_path, None, {"backups": [member]})
    assert memory.inspect(tmp_path)["unmanaged"][0]["path"] == member


def test_file_erasure_reports_partial_failure_and_keeps_manifest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    member, manifest = backup_fixture(tmp_path)
    original = Path.unlink

    def fail_member(path: Path, *args: Any, **kwargs: Any) -> None:
        if path.name == "algebra.json":
            raise OSError("file busy")
        original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", fail_member)
    result = apply(tmp_path, None, {"backups": [member, manifest]})
    assert not result["applied"] and not result["complete"]
    assert len(result["failures"]) == 2
    assert (tmp_path / manifest).exists()


def test_preview_of_missing_root_creates_nothing(tmp_path: Path) -> None:
    root = tmp_path / "absent"
    assert memory.inspect(root)["records"] == []
    assert not root.exists()
