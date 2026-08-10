"""Contract tests for MarkdownNoteStore adapter."""

from __future__ import annotations

import threading

from sync.adapters.markdown_notes import MarkdownNoteStore


def test_read_or_create_bootstraps_from_template(tmp_path):
    store = MarkdownNoteStore()
    note_path = tmp_path / "daily.md"
    template_path = tmp_path / "template.md"
    template_path.write_text("---\nsleep: 7h30m\n---\n\n", encoding="utf-8")

    lines = store.read_or_create(str(note_path), str(template_path))

    assert note_path.exists()
    assert lines[:3] == ["---", "sleep: 7h30m", "---"]
    assert lines == note_path.read_text(encoding="utf-8").splitlines()


def test_update_persists_lines_atomically(tmp_path):
    store = MarkdownNoteStore()
    note_path = tmp_path / "note.md"
    lines = ["## Header", "", "Body"]

    store.update(str(note_path), lambda _current: lines)

    assert note_path.read_text(encoding="utf-8") == "## Header\n\nBody\n"


def test_publish_rejects_stale_expected_content(tmp_path):
    store = MarkdownNoteStore(lock_root=str(tmp_path / "locks"))
    note_path = tmp_path / "note.md"
    note_path.write_text("original\n", encoding="utf-8")
    expected = ["original"]

    store.update(str(note_path), lambda lines: [*(lines or []), "external"])
    result = store.publish(
        str(note_path),
        ["replacement"],
        expected=expected,
    )

    assert result.status == "conflict"
    assert result.lines == ("original", "external")
    assert note_path.read_text(encoding="utf-8") == "original\nexternal\n"


def test_update_reports_no_change_and_keeps_canonical_trailing_newline(tmp_path):
    store = MarkdownNoteStore(lock_root=str(tmp_path / "locks"))
    note_path = tmp_path / "nested" / "note.md"

    created = store.update(str(note_path), lambda _lines: ["Body", ""])
    unchanged = store.update(str(note_path), lambda lines: list(lines or []))

    assert created.status == "updated"
    assert unchanged.status == "unchanged"
    assert unchanged.lines == ("Body",)
    assert note_path.read_text(encoding="utf-8") == "Body\n"


def test_update_serializes_concurrent_transformations(tmp_path):
    lock_root = str(tmp_path / "locks")
    first_store = MarkdownNoteStore(lock_root=lock_root)
    second_store = MarkdownNoteStore(lock_root=lock_root)
    note_path = tmp_path / "note.md"
    note_path.write_text("base\n", encoding="utf-8")
    first_started = threading.Event()
    second_ready = threading.Event()
    release_first = threading.Event()

    def first_update() -> None:
        def append_first(lines: list[str] | None) -> list[str]:
            first_started.set()
            assert release_first.wait(timeout=2)
            return [*(lines or []), "first"]

        first_store.update(str(note_path), append_first)

    def second_update() -> None:
        second_ready.set()
        second_store.update(
            str(note_path),
            lambda lines: [*(lines or []), "second"],
        )

    first_thread = threading.Thread(target=first_update)
    second_thread = threading.Thread(target=second_update)
    first_thread.start()
    assert first_started.wait(timeout=2)
    second_thread.start()
    assert second_ready.wait(timeout=2)
    release_first.set()
    first_thread.join(timeout=2)
    second_thread.join(timeout=2)

    assert not first_thread.is_alive()
    assert not second_thread.is_alive()
    assert note_path.read_text(encoding="utf-8") == "base\nfirst\nsecond\n"
