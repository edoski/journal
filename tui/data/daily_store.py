"""Mutable daily-note storage helpers used by TUI editors."""

from __future__ import annotations

import datetime
import os
from typing import Iterable

from sync.constants import JOURNAL_DIR
from sync.daily.constants import TEMPLATE_PATH
from sync.goals.note_store import (
    apply_goals_sections,
    empty_subsection_lines,
    extract_goals,
    render_goals_or_empty,
)
from sync.io import atomic_write_note, safe_read_file
from sync.notes.markdown import normalize_header
from sync.notes.sections import ensure_note

GOAL_SECTION_ORDER = ["YEARLY", "QUARTERLY", "MONTHLY", "WEEKLY", "DAILY"]


class DailyStore:
    """CRUD-style operations for daily note source sections."""

    def __init__(
        self,
        journal_dir: str = JOURNAL_DIR,
        template_path: str = TEMPLATE_PATH,
    ) -> None:
        self.journal_dir = journal_dir
        self.template_path = template_path

    def note_path(self, note_date: datetime.date) -> str:
        return os.path.join(self.journal_dir, f"{note_date.isoformat()}.md")

    def load_lines(self, note_date: datetime.date) -> list[str]:
        """Load note lines, ensuring the note file exists first."""
        path = self.note_path(note_date)
        ensure_note(path, self.template_path)
        return safe_read_file(path) or []

    def save_lines(self, note_date: datetime.date, lines: list[str]) -> None:
        """Persist note lines atomically."""
        atomic_write_note(self.note_path(note_date), lines)

    def update_frontmatter(
        self, note_date: datetime.date, key: str, value: str
    ) -> None:
        """Set or insert a YAML frontmatter key/value pair in the daily note."""
        lines = self.load_lines(note_date)
        if not lines or lines[0].strip() != "---":
            raise ValueError("Daily note must start with YAML frontmatter")

        end_idx = -1
        for idx in range(1, len(lines)):
            if lines[idx].strip() == "---":
                end_idx = idx
                break
        if end_idx == -1:
            raise ValueError("Daily note frontmatter closing delimiter '---' not found")

        key_prefix = f"{key}:"
        for idx in range(1, end_idx):
            if lines[idx].strip().startswith(key_prefix):
                lines[idx] = f"{key}: {value}"
                self.save_lines(note_date, lines)
                return

        lines.insert(end_idx, f"{key}: {value}")
        self.save_lines(note_date, lines)

    def replace_section(
        self,
        note_date: datetime.date,
        header: str,
        body_lines: Iterable[str],
    ) -> None:
        """Replace an arbitrary markdown section body by exact header match."""
        lines = self.load_lines(note_date)
        target = normalize_header(header)
        header_idx = -1

        for idx, line in enumerate(lines):
            if normalize_header(line) == target:
                header_idx = idx
                break

        replacement = [header, "", *list(body_lines), ""]

        if header_idx == -1:
            if lines and lines[-1].strip():
                lines.append("")
            lines.extend(replacement)
            self.save_lines(note_date, lines)
            return

        stripped = lines[header_idx].lstrip()
        level = len(stripped) - len(stripped.lstrip("#"))

        end_idx = len(lines)
        for idx in range(header_idx + 1, len(lines)):
            candidate = lines[idx].lstrip()
            if not candidate.startswith("#"):
                continue
            cand_level = len(candidate) - len(candidate.lstrip("#"))
            if cand_level <= level:
                end_idx = idx
                break

        lines[header_idx:end_idx] = replacement
        self.save_lines(note_date, lines)

    def replace_goals_subsection(
        self,
        note_date: datetime.date,
        subsection: str,
        goal_lines: list[str],
    ) -> None:
        """Replace a Goals subsection while preserving other visible subsections."""
        subsection = subsection.upper()
        lines = self.load_lines(note_date)

        def subsection_present(name: str) -> bool:
            token = normalize_header(f"### **{name}**")
            return any(normalize_header(line) == token for line in lines)

        sections: list[tuple[str, list[str]]] = []
        for name in GOAL_SECTION_ORDER:
            goals = extract_goals(lines, name)
            present = subsection_present(name)

            if name == subsection:
                section_lines = goal_lines or empty_subsection_lines(name)
                sections.append((name, section_lines))
                continue

            if present or goals:
                sections.append((name, render_goals_or_empty(name, goals)))

        if not any(name == subsection for name, _ in sections):
            sections.append(
                (subsection, goal_lines or empty_subsection_lines(subsection))
            )

        updated = apply_goals_sections(lines, sections, insert_if_missing=True)
        self.save_lines(note_date, updated)
