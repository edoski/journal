from __future__ import annotations

import datetime

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
