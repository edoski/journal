import json
from pathlib import Path
import shutil

import pytest

from learning.workspace import (
    Workspace,
    initialize,
    link,
    register,
    registered,
    registry_path,
    resolve,
    support_directory,
    unlink,
)


def manifest(workspace: Workspace) -> object:
    return json.loads((workspace.root / "workspace.json").read_text())


def entries() -> dict[str, dict[str, str]]:
    value = json.loads(registry_path().read_text())
    assert value["schema"] == 2 and set(value) == {"schema", "workspaces"}
    workspaces: dict[str, dict[str, str]] = value["workspaces"]
    return workspaces


@pytest.fixture(autouse=True)
def unbound(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STUDY_WORKSPACE", raising=False)
    monkeypatch.delenv("LEARNING_SOURCE_ROOT", raising=False)


def test_init_registers_is_idempotent_and_nested_workspace_is_independent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    parent = initialize(tmp_path)
    assert registry_path() == support_directory() / "workspaces.json"
    assert entries() == {str(tmp_path): {}}
    parent.record.write_text('{"schema": 6}\n')
    before = {p: p.read_bytes() for p in parent.root.rglob("*") if p.is_file()}
    assert initialize(tmp_path) == parent
    assert before == {p: p.read_bytes() for p in parent.root.rglob("*") if p.is_file()}
    nested = tmp_path / "module/exercises"
    nested.mkdir(parents=True)
    monkeypatch.chdir(nested)
    assert resolve() == parent
    child = initialize(nested)
    assert resolve() == child
    assert not child.record.exists()
    assert resolve(tmp_path) == parent
    assert (child.root / ".gitignore").read_text() == "*\n"
    assert manifest(child) == {"version": 1}
    assert entries() == {str(tmp_path): {}, str(nested): {}}
    assert registered() == [parent, child]


def test_workspace_paths(tmp_path: Path) -> None:
    workspace = Workspace(tmp_path, tmp_path / "material")
    assert workspace.root == tmp_path / ".study"
    assert workspace.record == tmp_path / ".study/course.json"
    assert workspace.notes == tmp_path / "study-notes"
    assert workspace.sources == tmp_path / "material"
    assert Workspace(tmp_path).sources == tmp_path


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
    assert not registry_path().exists()
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    (elsewhere / ".study").symlink_to(root, target_is_directory=True)
    with pytest.raises(ValueError, match="symlink"):
        resolve(elsewhere)


def test_a_linked_course_record_is_refused(tmp_path: Path) -> None:
    workspace = initialize(tmp_path)
    outside = tmp_path / "outside.json"
    outside.write_text("{}")
    workspace.record.symlink_to(outside)
    with pytest.raises(ValueError, match="must stay local"):
        resolve(tmp_path)


def test_missing_workspace_ignores_old_global_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    old = tmp_path / "global"
    old.mkdir()
    (old / "course.json").write_text("private global state")
    target = tmp_path / "new"
    target.mkdir()
    monkeypatch.setenv("LEARNING_ROOT", str(old))
    monkeypatch.setenv("VAULT_DIR", str(old))
    monkeypatch.chdir(target)
    with pytest.raises(ValueError, match="study init"):
        resolve()
    assert list(target.iterdir()) == []


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
    assert entries() == {str(study): {"sources": str(material)}}
    assert sorted(path.name for path in material.iterdir()) == ["notes.md", "src"]
    monkeypatch.chdir(material / "src/deep")
    assert resolve() == workspace
    assert resolve(study).sources == material
    assert initialize(study, sources=material) == workspace
    assert initialize(study) == workspace
    assert entries() == {str(study): {"sources": str(material)}}
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
    assert entries() == {str(first): {"sources": str(material)}, str(module): {}}


def test_relinking_unlinking_and_stale_links_fail_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    for name in ["old", "new", "study", "other"]:
        (tmp_path / name).mkdir()
    old, new, study, other = (
        tmp_path / name for name in ["old", "new", "study", "other"]
    )
    relinked = link(initialize(study, sources=old), new)
    assert entries() == {str(study): {"sources": str(new)}}
    monkeypatch.chdir(old)
    with pytest.raises(ValueError, match="study init"):
        resolve()
    monkeypatch.chdir(new)
    assert resolve() == relinked
    with pytest.raises(ValueError, match="already linked"):
        link(initialize(other), new)
    assert unlink(relinked) == Workspace(study)
    assert manifest(relinked) == {"version": 1}
    assert entries() == {str(study): {}, str(other): {}}
    assert resolve(study).sources == study
    link(resolve(other), new)
    assert resolve() == Workspace(other, new)
    (other / ".study/workspace.json").write_text('{"version": 1}\n')
    with pytest.raises(ValueError, match="Stale"):
        resolve()
    link(resolve(study), new)
    assert resolve() == Workspace(study, new)
    # The stale claim is cleared, not kept as a second link to the material.
    assert entries() == {str(study): {"sources": str(new)}, str(other): {}}


def test_deleted_workspaces_are_ignored_and_pruned_on_the_next_write(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    material, study, kept = (tmp_path / name for name in ("material", "study", "kept"))
    for directory in (material, study, kept):
        directory.mkdir()
    initialize(study, sources=material)
    workspace = initialize(kept)
    shutil.rmtree(study)
    monkeypatch.chdir(material)
    with pytest.raises(ValueError, match="study init"):
        resolve()
    assert registered() == [workspace]
    assert str(study) in entries()
    register(workspace)
    assert entries() == {str(kept): {}}


@pytest.mark.parametrize(
    "contents",
    [
        "[]",
        "{",
        '{"/abs/material": "/abs/workspace"}',
        '{"schema": 1, "workspaces": {}}',
        '{"schema": 2, "workspaces": []}',
        '{"schema": 2, "workspaces": {}, "extra": true}',
        '{"schema": 2, "workspaces": {"relative": {}}}',
        '{"schema": 2, "workspaces": {"/abs": {"sources": "relative"}}}',
        '{"schema": 2, "workspaces": {"/abs": {"mode": "linked"}}}',
    ],
)
def test_only_a_schema_2_registry_is_accepted(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, contents: str
) -> None:
    registry_path().parent.mkdir(parents=True)
    registry_path().write_text(contents)
    monkeypatch.chdir(tmp_path)
    with pytest.raises(ValueError, match="registry"):
        resolve()
    with pytest.raises(ValueError, match="registry"):
        initialize(tmp_path)
    assert registry_path().read_text() == contents
    assert not (tmp_path / ".study").exists()


def test_registered_lists_valid_workspaces_sorted_by_directory(tmp_path: Path) -> None:
    names = ["b", "a", "broken"]
    for name in names:
        (tmp_path / name).mkdir()
    second, first, broken = (initialize(tmp_path / name) for name in names)
    (broken.root / "workspace.json").write_text("{")
    assert registered() == [first, second]
