from pathlib import Path
import subprocess

import pytest

from learning import sources


def files(root: Path, *names: str) -> None:
    for name in names:
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text(name)


def test_scan_lists_only_material_git_does_not_ignore(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    files(
        repo,
        "docs/guide.md",
        "draft.md",
        "build.md",
        "node_modules/pkg/README.md",
        ".github/notes.md",
    )
    (repo / ".gitignore").write_text("node_modules/\nbuild.md\n")
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "add", "docs/guide.md"], check=True)

    def listed(material: Path) -> list[str]:
        return [item["path"] for item in sources.scan(material, {})["files"]]

    assert listed(repo) == ["docs/guide.md", "draft.md"]
    assert listed(repo / "docs") == ["guide.md"]
    # A directory the repository ignores is not git-managed material: walk it.
    assert listed(repo / "node_modules") == ["pkg/README.md"]
    (repo / "docs/guide.md").unlink()
    assert listed(repo) == ["draft.md"]
    with pytest.raises(ValueError, match="does not exist"):
        sources.scan(tmp_path / "missing", {})


def test_scan_names_registered_files_and_suggests_free_course_handles(
    tmp_path: Path,
) -> None:
    files(tmp_path, "slides.pdf", "a/notes.md", "b/notes.md", "o1.md", "code.bin")
    registered = {
        "slides": {"path": "slides.pdf"},
        "remote": {"path": "https://example.invalid/course.pdf"},
        "outside": {"path": str(tmp_path.parent / "elsewhere.pdf")},
    }
    result = sources.scan(tmp_path, registered, taken={"notes"})
    assert result == {
        "directory": str(tmp_path),
        "files": [
            {"path": "a/notes.md", "bytes": 10, "suggested_handle": "notes-2"},
            {"path": "b/notes.md", "bytes": 10, "suggested_handle": "notes-3"},
            {"path": "o1.md", "bytes": 5, "suggested_handle": "s-o1"},
            {"path": "slides.pdf", "bytes": 10, "handle": "slides"},
        ],
        "truncated": False,
    }


def test_scan_stops_at_its_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    files(tmp_path, "a.md", "b.md", "c.md")
    monkeypatch.setattr(sources, "SCAN_LIMIT", 2)
    result = sources.scan(tmp_path, {})
    assert [item["path"] for item in result["files"]] == ["a.md", "b.md"]
    assert result["truncated"] is True


def test_prepare_registers_new_files_under_free_handles(tmp_path: Path) -> None:
    material = tmp_path / "material"
    files(material, "Week 1/Lecture Notes.pdf", "data.csv", "o12.md")
    outside = tmp_path / "Elsewhere.TXT"
    outside.write_text("x")
    new, existing = sources.prepare(
        material,
        ["Week 1/Lecture Notes.pdf", "data.csv", str(outside), "o12.md"],
        {},
        taken={"lecture-notes"},
    )
    assert existing == {}
    assert new == {
        "lecture-notes-2": {
            "path": "Week 1/Lecture Notes.pdf",
            "title": "Lecture Notes",
        },
        "data": {"path": "data.csv"},
        "elsewhere": {"path": str(outside.resolve()), "title": "Elsewhere"},
        "s-o12": {"path": "o12.md", "title": "o12"},
    }


def test_prepare_is_idempotent_and_never_gives_one_file_two_handles(
    tmp_path: Path,
) -> None:
    material = tmp_path / "material"
    files(material, "notes.md", "sub/other.md")
    (material / "alias.md").symlink_to(material / "notes.md")
    registered = {"notes": {"path": "notes.md", "title": "notes"}}
    new, existing = sources.prepare(
        material,
        [
            "notes.md",
            "sub/../notes.md",
            str(material / "notes.md"),
            "alias.md",
            "sub/other.md",
            "./sub/other.md",
        ],
        registered,
    )
    assert existing == {
        "notes.md": "notes",
        "sub/../notes.md": "notes",
        str(material / "notes.md"): "notes",
        "alias.md": "notes",
    }
    assert new == {"other": {"path": "sub/other.md", "title": "other"}}


def test_prepare_rejects_missing_files_with_close_names(tmp_path: Path) -> None:
    files(tmp_path, "lecture-01.pdf")
    with pytest.raises(ValueError, match="did you mean lecture-01.pdf"):
        sources.prepare(tmp_path, ["lecture-1.pdf"], {})
    with pytest.raises(ValueError, match="does not exist: missing/x.md$"):
        sources.prepare(tmp_path, ["missing/x.md"], {})
    with pytest.raises(ValueError, match="at least one"):
        sources.prepare(tmp_path, [], {})
    with pytest.raises(ValueError, match="nonempty strings"):
        sources.prepare(tmp_path, [" "], {})
    (tmp_path / "folder").mkdir()
    with pytest.raises(ValueError, match="does not exist"):
        sources.prepare(tmp_path, ["folder"], {})
