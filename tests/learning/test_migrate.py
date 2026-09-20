from hashlib import sha256
import json
from pathlib import Path
from typing import Any

import pytest

from learning import records, migrate, storage


def legacy(root: Path, scope: str = "course") -> bytes:
    record = {
        "schema_version": 4,
        "revision": 7,
        "updated_at": "2026-01-01T12:00:00+00:00",
        "sources": {"sheet": {"path": "original.md", "version": "edition-1"}},
        "topics": {
            "t": {
                "assessment": {
                    "summary": "Old interpretation",
                    "gap": "Old gap",
                    "observations": ["o1"],
                    "reviewed_through": 1,
                    "assessed_at": "2026-01-01T12:00:00+00:00",
                },
                "review": {
                    "due": "2026-09-20",
                    "reason": "Revisit",
                    "task": "Try again",
                    "observations": ["o1"],
                    "reviewed_through": 1,
                    "assessed_at": "2026-01-01T12:00:00+00:00",
                },
            }
        },
        "observations": {
            "o1": {
                "topics": ["t"],
                "text": "Actual evidence",
                "origin": "direct_attempt",
                "recorded_at": "2026-01-01T11:00:00+00:00",
                "response": "The equations coincide",
                "assistance": "A hint identified the repeated row",
                "refs": [
                    {
                        "source": "sheet",
                        "locator": "Exercise 2",
                        "source_version": "edition-1",
                    }
                ],
                "details": {"observations": ["$attempt"]},
            }
        },
        "tasks": {"work": {"topics": ["t"], "question": "Continue here"}},
        "current_task": "work",
    }
    path = root / "state" / f"{scope}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(record, indent=2, ensure_ascii=False) + "\n").encode()
    path.write_bytes(raw)
    return raw


def test_preview_is_read_only_and_apply_preserves_original_backup_and_unknowns(
    tmp_path: Path,
) -> None:
    original = legacy(tmp_path)
    policy = b'{"schema_version":1,"revision":1,"rules":[]}\n'
    (tmp_path / "preferences.json").write_bytes(policy)
    preview = migrate.migrate(tmp_path)
    assert preview["errors"] == []
    assert preview["applied"] is False
    assert (tmp_path / "state/course.json").read_bytes() == original
    assert not (tmp_path / "backups").exists()
    result = migrate.migrate(tmp_path, apply=True)
    assert result["applied"] is True
    backup = Path(result["backup"])
    assert (backup / "state/course.json").read_bytes() == original
    assert (backup / "preferences.json").read_bytes() == policy
    manifest = json.loads((backup / "manifest.json").read_text())
    assert manifest["sha256"]["state/course.json"] == sha256(original).hexdigest()
    record = records.read(tmp_path, "course")
    assert isinstance(record, dict)
    assert record["revision"] == 8
    previous = json.loads(original)
    assert record["schema_version"] == 5
    for field in ("observations", "sources", "tasks", "current_task"):
        assert record[field] == previous[field]
    for field in ("assessment", "review"):
        interpretation = record["topics"]["t"][field]
        original_interpretation = previous["topics"]["t"][field]
        assert interpretation == {
            **{
                key: value
                for key, value in original_interpretation.items()
                if key != "reviewed_through"
            },
            "considered_observations": None,
            "pending": True,
        }
    before_repeat = (tmp_path / "state/course.json").read_bytes()
    assert migrate.migrate(tmp_path, apply=True)["scopes"][0]["status"] == "current"
    assert (tmp_path / "state/course.json").read_bytes() == before_repeat
    assert (tmp_path / "preferences.json").read_bytes() == policy


def test_new_alias_never_changes_existing_observation_content(tmp_path: Path) -> None:
    legacy(tmp_path)
    migrate.migrate(tmp_path, apply=True)
    original = records.read(tmp_path, "course")
    assert isinstance(original, dict)
    records.save(
        tmp_path,
        "course",
        8,
        {"observations": [{"as": "attempt", "topics": ["t"], "text": "New attempt"}]},
    )
    after = records.read(tmp_path, "course")
    assert isinstance(after, dict)
    assert after["observations"]["o1"] == original["observations"]["o1"]


def test_invalid_scope_prevents_partial_migration_and_isolated_catalog_still_works(
    tmp_path: Path,
) -> None:
    original = legacy(tmp_path)
    (tmp_path / "state/broken.json").write_text("not json")
    result = migrate.migrate(tmp_path, apply=True)
    assert result["errors"][0]["scope"] == "broken"
    assert result["applied"] is False
    assert (tmp_path / "state/course.json").read_bytes() == original
    records.save(tmp_path, "healthy", 0, {"topics": {"t": {}}})
    catalog = records.read(tmp_path, None)
    assert isinstance(catalog, list)
    assert (
        next(item for item in catalog if item["scope"] == "healthy")["topic_count"] == 1
    )
    assert "error" in next(item for item in catalog if item["scope"] == "broken")


def test_partial_publication_failure_keeps_backups_and_can_resume(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = legacy(tmp_path, "a")
    second = legacy(tmp_path, "b")
    update = storage.update

    def fail_second(path: Path, expected: int, transform: Any) -> dict[str, Any]:
        if path.stem == "b":
            raise OSError("disk unavailable")
        return update(path, expected, transform)

    monkeypatch.setattr(storage, "update", fail_second)
    result = migrate.migrate(tmp_path, apply=True)
    assert result["applied"] is True
    assert result["errors"] == [{"scope": "b", "error": "disk unavailable"}]
    backup = Path(result["backup"])
    assert (backup / "state/a.json").read_bytes() == first
    assert (backup / "state/b.json").read_bytes() == second
    assert (tmp_path / "state/b.json").read_bytes() == second
    monkeypatch.setattr(storage, "update", update)
    resumed = migrate.migrate(tmp_path, apply=True)
    assert resumed["errors"] == []
    assert [item["status"] for item in resumed["scopes"]] == ["current", "migrated"]


@pytest.mark.parametrize(
    "change",
    [{"refs": None}, {"origin": []}, {"source": "sheet", "source_version": "wrong"}],
)
def test_malformed_observations_are_catalog_errors(
    tmp_path: Path, change: dict[str, Any]
) -> None:
    legacy(tmp_path)
    migrate.migrate(tmp_path, apply=True)
    path = tmp_path / "state/course.json"
    record = json.loads(path.read_text())
    record["observations"]["o1"].update(change)
    path.write_text(json.dumps(record))
    with pytest.raises(ValueError):
        records.read(tmp_path, "course")
    assert "error" in records.read(tmp_path, None)[0]  # type: ignore[index]


def test_scope_names_cannot_collide_with_backup_metadata(tmp_path: Path) -> None:
    scope_policy = legacy(tmp_path, "preferences")
    scope_manifest = legacy(tmp_path, "manifest")
    policy = b'{"schema_version":1,"revision":1,"rules":[]}\n'
    (tmp_path / "preferences.json").write_bytes(policy)
    result = migrate.migrate(tmp_path, apply=True)
    backup = Path(result["backup"])
    assert (backup / "state/preferences.json").read_bytes() == scope_policy
    assert (backup / "state/manifest.json").read_bytes() == scope_manifest
    assert (backup / "preferences.json").read_bytes() == policy
    checksums = json.loads((backup / "manifest.json").read_text())["sha256"]
    assert set(checksums) == {
        "state/preferences.json",
        "state/manifest.json",
        "preferences.json",
    }


def test_migrated_unknown_coverage_survives_sparse_save_and_needs_explicit_reassessment(
    tmp_path: Path,
) -> None:
    legacy(tmp_path)
    migrate.migrate(tmp_path, apply=True)
    records.save(tmp_path, "course", 8, {"tasks": {"work": {"question": "Next step"}}})
    state = records.read(tmp_path, "course")
    assert isinstance(state, dict)
    assert state["topics"]["t"]["assessment"]["considered_observations"] is None
    assert state["topics"]["t"]["assessment"]["pending"] is True
    records.save(
        tmp_path,
        "course",
        9,
        {
            "topics": {
                "t": {
                    "assessment": {
                        "summary": "Assisted success remains untested independently",
                        "observations": ["o1"],
                        "considered_observations": ["o1"],
                    }
                }
            }
        },
    )
    updated = records.read(tmp_path, "course")
    assert isinstance(updated, dict)
    assert updated["topics"]["t"]["assessment"]["pending"] is False
    assert updated["topics"]["t"]["review"]["pending"] is True


def test_migration_leaves_lesson_artifacts_unchanged(tmp_path: Path) -> None:
    legacy(tmp_path)
    artifact = tmp_path / "notes" / "lesson.md"
    artifact.parent.mkdir()
    artifact.write_bytes(b"# Saved lesson\n\nExact teaching survives.\n")
    before = artifact.read_bytes()
    migrate.migrate(tmp_path, apply=True)
    assert artifact.read_bytes() == before
