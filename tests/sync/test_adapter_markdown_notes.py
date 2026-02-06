"""Contract tests for MarkdownNoteStore adapter."""

from __future__ import annotations

from sync.adapters.markdown_notes import MarkdownNoteStore


def test_read_returns_none_for_missing_file(tmp_path):
    store = MarkdownNoteStore()
    missing = tmp_path / "missing.md"
    assert store.read(str(missing)) is None


def test_read_or_create_bootstraps_from_template(tmp_path):
    store = MarkdownNoteStore()
    note_path = tmp_path / "daily.md"
    template_path = tmp_path / "template.md"
    template_path.write_text("---\nmood: 6.0\n---\n", encoding="utf-8")

    lines = store.read_or_create(str(note_path), str(template_path))

    assert note_path.exists()
    assert lines[:3] == ["---", "mood: 6.0", "---"]


def test_write_persists_lines_atomically(tmp_path):
    store = MarkdownNoteStore()
    note_path = tmp_path / "note.md"
    lines = ["## Header", "", "Body"]

    store.write(str(note_path), lines)

    assert note_path.read_text(encoding="utf-8") == "## Header\n\nBody\n"
