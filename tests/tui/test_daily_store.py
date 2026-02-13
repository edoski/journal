from __future__ import annotations

import datetime
from pathlib import Path

from sync.adapters.markdown_notes import MarkdownNoteStore
from tui.data.daily_store import DailyStore


def _make_note(store: DailyStore, note_date: datetime.date) -> str:
    path = store.note_path(note_date)
    content = "\n".join(
        [
            "---",
            "mood: 6.0",
            "---",
            "",
            "## Goals",
            "---",
            "### **WEEKLY**",
            "",
            "_No weekly goals have been defined yet._",
            "",
            "### **DAILY**",
            "",
            "_No daily goals have been defined yet._",
            "",
            "## Metrics",
            "---",
            "### **STUDY**",
            "",
            "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |",
            "| ---- | -------- | -------- | --------- | ----- | ------- | ----- |",
            "",
        ]
    )
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)
    return path


def test_daily_store_updates_frontmatter_and_section(tmp_path):
    journal_dir = tmp_path / "journal"
    journal_dir.mkdir()
    template = tmp_path / "daily.md"
    template.write_text("---\nmood: 5.0\n---\n", encoding="utf-8")

    store = DailyStore(
        note_store=MarkdownNoteStore(),
        journal_dir=str(journal_dir),
        template_path=str(template),
    )
    note_date = datetime.date(2026, 2, 6)
    note_path = _make_note(store, note_date)

    store.update_frontmatter(note_date, "mood", "7.5")
    store.replace_section(
        note_date,
        "### **STUDY**",
        ["| TIME | ACTIVITY | DURATION |", "| 09:00 | Study | `1h00m` |"],
    )

    content = open(note_path, "r", encoding="utf-8").read()
    assert "mood: 7.5" in content
    assert "| 09:00 | Study | `1h00m` |" in content


def test_daily_store_replaces_daily_goals_subsection(tmp_path):
    journal_dir = tmp_path / "journal"
    journal_dir.mkdir()
    template = tmp_path / "daily.md"
    template.write_text("---\nmood: 5.0\n---\n", encoding="utf-8")

    store = DailyStore(
        note_store=MarkdownNoteStore(),
        journal_dir=str(journal_dir),
        template_path=str(template),
    )
    note_date = datetime.date(2026, 2, 6)
    note_path = _make_note(store, note_date)

    store.replace_goals_subsection(
        note_date,
        "DAILY",
        ["- [ ] Ship TUI ^gid-abc1234567"],
    )

    content = open(note_path, "r", encoding="utf-8").read()
    assert "- [ ] Ship TUI ^gid-abc1234567" in content


def test_daily_store_preview_methods_return_before_after_without_writing(tmp_path):
    journal_dir = tmp_path / "journal"
    journal_dir.mkdir()
    template = tmp_path / "daily.md"
    template.write_text("---\nmood: 5.0\n---\n", encoding="utf-8")

    store = DailyStore(
        note_store=MarkdownNoteStore(),
        journal_dir=str(journal_dir),
        template_path=str(template),
    )
    note_date = datetime.date(2026, 2, 6)
    note_path = _make_note(store, note_date)
    before_content = Path(note_path).read_text(encoding="utf-8")

    _, before_frontmatter, after_frontmatter = store.preview_frontmatter_update(
        note_date,
        "mood",
        "8.0",
    )
    assert "mood: 6.0" in "\n".join(before_frontmatter)
    assert "mood: 8.0" in "\n".join(after_frontmatter)

    _, before_goals, after_goals = store.preview_goals_subsection_replace(
        note_date,
        "DAILY",
        ["- [ ] Preview only ^gid-preview123"],
    )
    assert "_No daily goals have been defined yet._" in "\n".join(before_goals)
    assert "- [ ] Preview only ^gid-preview123" in "\n".join(after_goals)

    _, before_section, after_section = store.preview_section_replace(
        note_date,
        "### **STUDY**",
        ["| TIME | ACTIVITY | DURATION |", "| 10:00 | Deep Work | `1h00m` |"],
    )
    assert "| 10:00 | Deep Work | `1h00m` |" not in "\n".join(before_section)
    assert "| 10:00 | Deep Work | `1h00m` |" in "\n".join(after_section)

    # Preview APIs do not write to disk.
    assert Path(note_path).read_text(encoding="utf-8") == before_content


def test_daily_store_preview_uses_template_until_confirm_save(tmp_path):
    journal_dir = tmp_path / "journal"
    journal_dir.mkdir()
    template = tmp_path / "daily.md"
    template.write_text("---\nmood: 5.0\n---\n", encoding="utf-8")

    store = DailyStore(
        note_store=MarkdownNoteStore(),
        journal_dir=str(journal_dir),
        template_path=str(template),
    )
    note_date = datetime.date(2026, 2, 7)
    note_path = Path(store.note_path(note_date))
    assert not note_path.exists()

    _, before_lines, after_lines = store.preview_frontmatter_update(
        note_date, "mood", "7.5"
    )
    assert not note_path.exists()
    assert "mood: 5.0" in "\n".join(before_lines)
    assert "mood: 7.5" in "\n".join(after_lines)

    store.save_lines(note_date, after_lines)
    assert note_path.exists()
    assert "mood: 7.5" in note_path.read_text(encoding="utf-8")
