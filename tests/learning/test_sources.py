import hashlib
import json
import os
from pathlib import Path

import pytest

from learning import records, sources, storage


def test_source_capture_detects_changed_bytes_without_restamping_old_refs(
    tmp_path: Path,
) -> None:
    vault = tmp_path / "vault"
    vault.mkdir()
    source = vault / "sheet.pdf"
    source.write_bytes(b"first edition")
    root = tmp_path / "learning"
    records.save(
        root,
        "course",
        0,
        {
            "sources": {"sheet": {"path": "sheet.pdf"}},
            "knowledge": {
                "notation": {
                    "text": "Undated convention",
                    "refs": [{"source": "sheet"}],
                }
            },
        },
    )
    path = root / "state/course.json"
    before = path.read_bytes()
    result = sources.inspect_sources(root, vault, "course", ["sheet"])
    assert result["sources"]["sheet"]["status"] == "unverified"
    assert result["sources"]["sheet"]["unverified_references"] == 1
    assert path.read_bytes() == before
    captured = sources.inspect_sources(
        root, vault, "course", ["sheet"], expected=1, expected_digest=result["digest"]
    )
    fingerprint = {"sha256": hashlib.sha256(b"first edition").hexdigest(), "size": 13}
    assert captured["revision"] == 2
    assert captured["captured"] == ["sheet"]
    assert captured["sources"]["sheet"]["stored_fingerprint"] == fingerprint
    assert captured["sources"]["sheet"]["unverified_references"] == 1
    assert (
        sources.inspect_sources(root, vault, "course", ["sheet"], expected=2)[
            "revision"
        ]
        == 2
    )
    state = records.read(root, "course")
    assert isinstance(state, dict)
    old_entry = state["knowledge"]["notation"]
    records.save(root, "course", 2, {"knowledge": {"notation": old_entry}})
    assert (
        sources.inspect_sources(root, vault, "course", ["sheet"])["sources"]["sheet"][
            "unverified_references"
        ]
        == 1
    )
    records.save(
        root,
        "course",
        2,
        {
            "knowledge": {
                "fresh": {"text": "Read this edition", "refs": [{"source": "sheet"}]}
            }
        },
    )
    state = records.read(root, "course")
    assert isinstance(state, dict)
    assert state["knowledge"]["fresh"]["refs"][0]["source_fingerprint"] == fingerprint
    source.write_bytes(b"second edition")
    changed = sources.inspect_sources(root, vault, "course", ["sheet"])
    assert changed["sources"]["sheet"]["status"] == "changed"
    before = path.read_bytes()
    with pytest.raises(ValueError, match="new handle for changed content"):
        sources.inspect_sources(root, vault, "course", ["sheet"], expected=3)
    assert path.read_bytes() == before
    with pytest.raises(ValueError, match="cited fingerprints are immutable"):
        records.save(
            root,
            "course",
            3,
            {
                "sources": {
                    "sheet": {
                        "fingerprint": changed["sources"]["sheet"][
                            "current_fingerprint"
                        ]
                    }
                }
            },
        )


def test_only_selected_local_regular_sources_are_inspected(tmp_path: Path) -> None:
    root = tmp_path / "learning"
    present = tmp_path / "local.md"
    present.write_text("source", encoding="utf-8")
    records.save(
        root,
        "course",
        0,
        {
            "sources": {
                "local": {"path": str(present)},
                "missing": {"path": "missing.md"},
                "remote": {"path": "https://example.invalid/course.pdf"},
                "directory": {"path": str(tmp_path)},
            }
        },
    )
    local = sources.inspect_sources(root, tmp_path, "course", ["local"])
    assert set(local["sources"]) == {"local"}
    unavailable = sources.inspect_sources(
        root, tmp_path, "course", ["missing", "remote", "directory"]
    )
    assert unavailable["sources"]["missing"]["status"] == "missing"
    assert unavailable["sources"]["remote"]["status"] == "unverified"
    assert "current_fingerprint" not in unavailable["sources"]["remote"]
    assert unavailable["sources"]["directory"]["status"] == "unverified"
    with pytest.raises(ValueError, match="unavailable sources"):
        sources.inspect_sources(
            root, tmp_path, "course", ["local", "missing"], expected=1
        )
    with pytest.raises(ValueError, match="select at least one"):
        sources.inspect_sources(root, tmp_path, "course", [])


def test_source_capture_guards_snapshot_and_keeps_original_metadata(
    tmp_path: Path,
) -> None:
    source = tmp_path / "sheet.pdf"
    source.write_bytes(b"source")
    receipt = records.save(
        tmp_path, "course", 0, {"sources": {"sheet": {"path": "sheet.pdf"}}}
    )
    path = tmp_path / "state/course.json"
    modified = json.loads(path.read_text())
    modified["title"] = "Other device"
    path.write_text(json.dumps(modified))
    with pytest.raises(storage.RevisionConflict, match="snapshot conflict"):
        sources.inspect_sources(
            tmp_path,
            tmp_path,
            "course",
            ["sheet"],
            expected=1,
            expected_digest=receipt["digest"],
        )
    assert "fingerprint" not in json.loads(path.read_text())["sources"]["sheet"]
    with pytest.raises(ValueError, match="requires expected revision"):
        sources.inspect_sources(
            tmp_path, tmp_path, "course", ["sheet"], expected_digest=receipt["digest"]
        )


def test_source_changing_during_read_is_unverified(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "sheet.pdf"
    source.write_bytes(b"source")
    records.save(tmp_path, "course", 0, {"sources": {"sheet": {"path": "sheet.pdf"}}})
    original_stat = Path.stat

    def change_before_stat(
        path: Path, *, follow_symlinks: bool = True
    ) -> os.stat_result:
        if path == source:
            path.write_bytes(b"changed")
        return original_stat(path, follow_symlinks=follow_symlinks)

    monkeypatch.setattr(Path, "stat", change_before_stat)
    result = sources.inspect_sources(tmp_path, tmp_path, "course", ["sheet"])
    assert result["sources"]["sheet"]["status"] == "unverified"
    assert "changed while being inspected" in result["sources"]["sheet"]["reason"]
