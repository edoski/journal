import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from uuid import uuid4

import pytest

from learning import lessons, preferences, records
from learning.sources import inspect_sources
from learning.workspace import (
    Workspace,
    initialize,
    link,
    links_path,
    resolve,
    unlink,
)
from learning.workspace_import import import_scope

LEARN = Path(__file__).resolve().parents[2] / "learning/skills/learn/scripts/learn"


def manifest(workspace: Workspace) -> object:
    return json.loads((workspace.root / "workspace.json").read_text())


def links() -> object:
    return json.loads(links_path().read_text())


@pytest.fixture(autouse=True)
def unbound(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STUDY_WORKSPACE", raising=False)


def test_init_is_idempotent_and_nested_workspace_is_independent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    parent = initialize(tmp_path)
    records.save(parent.root, "course", 0, {"title": "Parent"})
    before = {p: p.read_bytes() for p in parent.root.rglob("*") if p.is_file()}
    assert initialize(tmp_path) == parent
    assert before == {p: p.read_bytes() for p in parent.root.rglob("*") if p.is_file()}
    nested = tmp_path / "module/exercises"
    nested.mkdir(parents=True)
    monkeypatch.chdir(nested)
    assert resolve() == parent
    child = initialize(nested)
    assert resolve() == child
    assert records.read(child.root, None) == []
    assert resolve(tmp_path) == parent
    assert (child.root / ".gitignore").read_text() == "*\n"


@pytest.mark.parametrize(
    "contents",
    [
        "{",
        '{"version":2}',
        '{"version":true}',
        "[]",
        '{"version":1,"sources":"relative/material"}',
        '{"version":1,"sources":7}',
        '{"version":1,"mode":"linked"}',
    ],
)
def test_invalid_nearer_workspace_never_falls_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, contents: str
) -> None:
    initialize(tmp_path)
    child = tmp_path / "child"
    (child / ".study").mkdir(parents=True)
    (child / ".study/workspace.json").write_text(contents)
    monkeypatch.chdir(child)
    with pytest.raises(ValueError, match="workspace"):
        resolve()
    with pytest.raises(ValueError, match="workspace"):
        initialize(child)


def test_unowned_or_linked_study_directory_is_not_adopted(tmp_path: Path) -> None:
    root = tmp_path / ".study"
    root.mkdir()
    sentinel = root / "important.json"
    sentinel.write_text("keep")
    with pytest.raises(ValueError, match="nonempty"):
        initialize(tmp_path)
    assert sentinel.read_text() == "keep"
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    (elsewhere / ".study").symlink_to(root, target_is_directory=True)
    with pytest.raises(ValueError, match="symlink"):
        resolve(elsewhere)


def test_missing_workspace_ignores_old_global_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    old = tmp_path / "global"
    (old / "state").mkdir(parents=True)
    (old / "state/course.json").write_text("private global state")
    target = tmp_path / "new"
    target.mkdir()
    monkeypatch.setenv("LEARNING_ROOT", str(old))
    monkeypatch.setenv("VAULT_DIR", str(old))
    monkeypatch.chdir(target)
    with pytest.raises(ValueError, match="study init"):
        resolve()
    assert list(target.iterdir()) == []


def test_selected_workspace_isolates_catalog_preferences_and_generated_files(
    tmp_path: Path,
) -> None:
    for name in ["a", "b"]:
        (tmp_path / name).mkdir()
    first, second = initialize(tmp_path / "a"), initialize(tmp_path / "b")
    records.save(
        first.root,
        "course",
        0,
        {"title": "First", "knowledge": {"notation": {"text": "g means response"}}},
    )
    records.save(second.root, "course", 0, {"title": "Second"})
    preferences.save(
        first.root,
        0,
        {
            "rules": [
                {
                    "when": {},
                    "values": {
                        "language": {"instruction": "Italian", "origin": "explicit"}
                    },
                }
            ]
        },
    )
    script = Path(__file__).resolve().parents[2] / "learning/skills/learn/scripts/learn"

    def context(directory: Path, *args: str) -> dict:
        return json.loads(
            subprocess.check_output(
                [str(script), "--workspace", str(directory), *(args or ("catalog",))],
                cwd=tmp_path,
                text=True,
            )
        )

    assert context(first.directory)["scopes"][0]["title"] == "First"
    assert context(second.directory)["scopes"][0]["title"] == "Second"
    assert context(first.directory)["preferences"]["rules"]
    assert not context(second.directory)["preferences"]["rules"]
    assert context(second.directory, "resume", "course")["knowledge"] == {}
    lesson = lessons.publish(first.root, str(uuid4()), "A focused explanation.")
    assert lesson.parent == first.root / "lessons"
    assert not (second.root / "lessons").exists()


def test_relative_sources_and_assets_survive_directory_move(tmp_path: Path) -> None:
    from learning.visuals import publish_svg

    directory = tmp_path / "course"
    directory.mkdir()
    workspace = initialize(directory)
    (directory / "material.md").write_text("A source.")
    records.save(
        workspace.root, "course", 0, {"sources": {"notes": {"path": "material.md"}}}
    )
    inspect_sources(workspace.root, directory, "course", ["notes"], expected=1)
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'
    visual = publish_svg(directory, "Diagram", svg, assets=workspace.assets)
    lesson = lessons.publish(workspace.root, str(uuid4()), visual["embed"])
    moved = tmp_path / "renamed"
    shutil.move(directory, moved)
    workspace = resolve(moved)
    assert (
        inspect_sources(workspace.root, moved, "course", ["notes"])["sources"]["notes"][
            "status"
        ]
        == "unchanged"
    )
    link = visual["embed"].partition("](")[2].removesuffix(")")
    moved_lesson = workspace.root / "lessons" / lesson.name
    assert (moved_lesson.parent / link).resolve().is_file()


def test_import_preserves_originals_rebases_sources_and_selects_preferences(
    tmp_path: Path,
) -> None:
    old = tmp_path / "old"
    old.mkdir()
    root = old / "learn"
    (old / "notes.md").write_text("Original source")
    records.save(
        root,
        "course",
        0,
        {
            "sources": {"notes": {"path": "notes.md"}},
            "knowledge": {
                "rule": {
                    "text": "Reported fact",
                    "uncertainty": "Unverified",
                    "refs": [{"source": "notes"}],
                }
            },
        },
    )
    records.save(root, "other", 0, {"title": "Other course"})
    preferences.save(
        root,
        0,
        {
            "rules": [
                {
                    "when": {"scope": "course"},
                    "values": {
                        "language": {"instruction": "Italian", "origin": "explicit"}
                    },
                },
                {
                    "when": {},
                    "values": {"pace": {"instruction": "Slowly", "origin": "explicit"}},
                },
                {
                    "when": {"scope": "other"},
                    "values": {
                        "pace": {"instruction": "Quickly", "origin": "explicit"}
                    },
                },
            ]
        },
    )
    target = tmp_path / "course"
    target.mkdir()
    workspace = initialize(target)
    original = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
    preview = import_scope(workspace, root, old, "course")
    assert preview["status"] == "preview" and preview["preference_rules"] == 1
    assert not (workspace.root / "state").exists()
    receipt = import_scope(workspace, root, old, "course", apply=True)
    assert receipt["status"] == "imported"
    assert original == {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
    imported = records.read(workspace.root, "course")
    assert imported["knowledge"] == records.read(root, "course")["knowledge"]
    assert (target / imported["sources"]["notes"]["path"]).resolve() == old / "notes.md"
    assert len(preferences.read(workspace.root)["rules"]) == 1
    with pytest.raises(ValueError, match="empty workspace"):
        import_scope(workspace, root, old, "course", apply=True)
    assert len(records.read(workspace.root, None)) == 1
    moved = tmp_path / "elsewhere/moved"
    moved.parent.mkdir()
    shutil.move(target, moved)
    assert (
        Path(
            records.read(resolve(moved).root, "course")["sources"]["notes"]["path"]
        ).read_text()
        == "Original source"
    )
    with_defaults = tmp_path / "defaults"
    with_defaults.mkdir()
    local = initialize(with_defaults)
    import_scope(local, root, old, "course", include_defaults=True, apply=True)
    assert len(preferences.read(local.root)["rules"]) == 2


def test_linked_material_selects_its_external_workspace_and_stays_untouched(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    material = tmp_path / "repo"
    (material / "src/deep").mkdir(parents=True)
    (material / "notes.md").write_text("Material")
    study = tmp_path / "study/course"
    study.mkdir(parents=True)
    workspace = initialize(study, sources=material)
    assert workspace == Workspace(study, material)
    assert manifest(workspace) == {"version": 1, "sources": str(material)}
    assert links() == {str(material): str(study)}
    assert sorted(path.name for path in material.iterdir()) == ["notes.md", "src"]
    monkeypatch.chdir(material / "src/deep")
    assert resolve() == workspace
    assert resolve(study).sources == material
    assert initialize(study, sources=material) == workspace
    records.save(
        workspace.root, "course", 0, {"sources": {"notes": {"path": "notes.md"}}}
    )
    status = inspect_sources(workspace.root, workspace.sources, "course", ["notes"])
    assert status["sources"]["notes"]["status"] == "unverified"
    monkeypatch.chdir(tmp_path)
    with pytest.raises(ValueError, match="--sources"):
        resolve()


def test_markers_outrank_links_and_ambiguous_links_are_refused_before_writing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    material = tmp_path / "repo"
    module = material / "module"
    module.mkdir(parents=True)
    first, second = tmp_path / "first", tmp_path / "second"
    first.mkdir()
    second.mkdir()
    linked = initialize(first, sources=material)
    local = initialize(module)
    monkeypatch.chdir(module)
    assert resolve() == local
    monkeypatch.chdir(material)
    assert resolve() == linked
    with pytest.raises(ValueError, match="inside the study workspace"):
        initialize(second, sources=module)
    with pytest.raises(ValueError, match="already linked"):
        initialize(second, sources=material)
    with pytest.raises(ValueError, match="needs no link"):
        initialize(tmp_path, sources=second)
    with pytest.raises(ValueError, match="does not exist"):
        initialize(second, sources=tmp_path / "missing")
    assert list(second.iterdir()) == []
    assert not (tmp_path / ".study").exists()
    assert links() == {str(material): str(first)}


def test_relinking_unlinking_and_stale_links_fail_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    for name in ["old", "new", "study", "other"]:
        (tmp_path / name).mkdir()
    old, new, study, other = (
        tmp_path / name for name in ["old", "new", "study", "other"]
    )
    relinked = link(initialize(study, sources=old), new)
    assert links() == {str(new): str(study)}
    monkeypatch.chdir(old)
    with pytest.raises(ValueError, match="study init"):
        resolve()
    monkeypatch.chdir(new)
    assert resolve() == relinked
    with pytest.raises(ValueError, match="already linked"):
        link(initialize(other), new)
    assert unlink(relinked) == Workspace(study)
    assert manifest(relinked) == {"version": 1}
    assert links() == {}
    assert resolve(study).sources == study
    link(resolve(other), new)
    assert resolve() == Workspace(other, new)
    (other / ".study/workspace.json").write_text('{"version": 1}\n')
    with pytest.raises(ValueError, match="Stale"):
        resolve()
    link(resolve(study), new)
    assert resolve() == Workspace(study, new)
    shutil.rmtree(study)
    with pytest.raises(ValueError, match="missing"):
        resolve()
    links_path().write_text("[]")
    with pytest.raises(ValueError, match="links"):
        resolve()
    monkeypatch.chdir(other)
    assert resolve() == Workspace(other)


def test_import_into_linked_workspace_keeps_material_paths_relative(
    tmp_path: Path,
) -> None:
    material = tmp_path / "material"
    material.mkdir()
    (material / "notes.md").write_text("Original source")
    root = tmp_path / "old-learn"
    records.save(root, "course", 0, {"sources": {"notes": {"path": "notes.md"}}})
    study = tmp_path / "study"
    study.mkdir()
    workspace = initialize(study, sources=material)
    import_scope(workspace, root, material, "course", apply=True)
    imported = records.read(workspace.root, "course")
    assert imported["sources"]["notes"]["path"] == "notes.md"


def test_study_commands_link_material_that_agents_then_find_from_their_cwd(
    tmp_path: Path,
) -> None:
    material = tmp_path / "repo"
    (material / "docs").mkdir(parents=True)
    (material / "docs/lecture.md").write_text("Lecture")
    study = tmp_path / "study"
    study.mkdir()

    def learn(cwd: Path, *args: str, stdin: str = "") -> dict:
        return json.loads(
            subprocess.check_output(
                [str(LEARN), *args], cwd=cwd, input=stdin, text=True
            )
        )

    created = learn(tmp_path, "--workspace", str(study), "init", "--sources", "repo")
    assert created["sources_directory"] == str(material)
    catalog = learn(material / "docs", "catalog")
    assert catalog["workspace"] == str(study)
    assert catalog["sources_directory"] == str(material)
    saved = learn(material, "save", "course", "--expect", "0", stdin='{"title": "C"}')
    scan = learn(material, "sources", "course", "--scan")
    assert [item["path"] for item in scan["files"]] == ["docs/lecture.md"]
    added = learn(
        material,
        "sources",
        "course",
        "--add",
        '["docs/lecture.md"]',
        "--expect",
        str(saved["revision"]),
    )
    assert added["sources"]["lecture"]["path"] == "docs/lecture.md"
    no_save = subprocess.run(
        [str(LEARN), "unlink"],
        cwd=material,
        env={**os.environ, "LEARNING_NO_SAVE": "1"},
        capture_output=True,
        text=True,
    )
    assert no_save.returncode == 1
    assert json.loads(no_save.stderr)["error"]["kind"] == "no_save"
    assert learn(material, "unlink")["sources_directory"] == str(study)
    relinked = subprocess.check_output(
        [sys.executable, "-m", "learning.study", "link", str(material)],
        cwd=study,
        env={**os.environ, "PYTHONPATH": str(LEARN.parents[4])},
        text=True,
    )
    assert json.loads(relinked)["sources_directory"] == str(material)
    assert learn(material, "catalog")["workspace"] == str(study)
