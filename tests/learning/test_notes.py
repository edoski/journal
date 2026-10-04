from pathlib import Path

import pytest

from learning import notes
from learning.workspace import Workspace, initialize


@pytest.fixture
def workspace(tmp_path: Path) -> Workspace:
    return initialize(tmp_path)


def test_notes_are_titled_markdown_with_obsidian_math(workspace: Workspace) -> None:
    path = notes.write(workspace, " Rank\nand  Nullity ", "\\[A x = b\\]\n\n")
    assert path == workspace.directory / "study-notes/rank-and-nullity.md"
    assert path.read_text() == "# Rank and Nullity\n\n$$\nA x = b\n$$\n"
    assert notes.write(workspace, "Empty", "  ").read_text() == "# Empty\n"
    assert notes.write(workspace, "∑", "x").name == "study-note.md"


def test_identical_notes_are_kept_and_different_ones_refused(
    workspace: Workspace,
) -> None:
    path = notes.write(workspace, "Rank", "Body")
    modified = path.stat().st_mtime_ns
    assert notes.write(workspace, "Rank", "Body\n") == path
    assert path.stat().st_mtime_ns == modified
    path.write_text("# Rank\n\nMy edits\n")
    with pytest.raises(ValueError, match="different content"):
        notes.write(workspace, "Rank", "Body")
    assert path.read_text() == "# Rank\n\nMy edits\n"
    with pytest.raises(ValueError, match="nonempty --title"):
        notes.write(workspace, "  ", "Body")


def test_linked_note_paths_are_refused(workspace: Workspace, tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    workspace.notes.symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match="symlink"):
        notes.write(workspace, "Rank", "Body")
    assert list(outside.iterdir()) == []
