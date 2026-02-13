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
from sync.notes.markdown import normalize_header
from sync.ports.notes import NoteStore

GOAL_SECTION_ORDER = ["YEARLY", "QUARTERLY", "MONTHLY", "WEEKLY", "DAILY"]


class DailyStore:
    """CRUD-style operations for daily note source sections."""

    def __init__(
        self,
        note_store: NoteStore,
        journal_dir: str = JOURNAL_DIR,
        template_path: str = TEMPLATE_PATH,
    ) -> None:
        self.note_store = note_store
        self.journal_dir = journal_dir
        self.template_path = template_path

    def note_path(self, note_date: datetime.date) -> str:
        return os.path.join(self.journal_dir, f"{note_date.isoformat()}.md")

    def load_lines(self, note_date: datetime.date) -> list[str]:
        """Load note lines, ensuring the note file exists first."""
        path = self.note_path(note_date)
        return self.note_store.read_or_create(path, self.template_path)

    def _load_lines_for_preview(
        self, note_date: datetime.date
    ) -> tuple[str, list[str]]:
        """Load preview baseline without creating the target note."""
        path = self.note_path(note_date)
        existing = self.note_store.read(path)
        if existing is not None:
            return path, list(existing)

        template_lines = self.note_store.read(self.template_path)
        if template_lines is None:
            raise FileNotFoundError(
                f"Daily template not found or unreadable: {self.template_path}"
            )
        return path, list(template_lines)

    def save_lines(self, note_date: datetime.date, lines: list[str]) -> None:
        """Persist note lines atomically."""
        self.note_store.write(self.note_path(note_date), lines)

    @staticmethod
    def _updated_frontmatter_lines(lines: list[str], key: str, value: str) -> list[str]:
        """Return lines with one frontmatter key updated or inserted."""
        updated = list(lines)
        if not updated or updated[0].strip() != "---":
            raise ValueError("Daily note must start with YAML frontmatter")

        end_idx = -1
        for idx in range(1, len(updated)):
            if updated[idx].strip() == "---":
                end_idx = idx
                break
        if end_idx == -1:
            raise ValueError("Daily note frontmatter closing delimiter '---' not found")

        key_prefix = f"{key}:"
        for idx in range(1, end_idx):
            if updated[idx].strip().startswith(key_prefix):
                updated[idx] = f"{key}: {value}"
                return updated

        updated.insert(end_idx, f"{key}: {value}")
        return updated

    @staticmethod
    def _updated_section_lines(
        lines: list[str],
        header: str,
        body_lines: Iterable[str],
    ) -> list[str]:
        """Return lines with a markdown section body replaced by header match."""
        updated = list(lines)
        target = normalize_header(header)
        header_idx = -1

        for idx, line in enumerate(updated):
            if normalize_header(line) == target:
                header_idx = idx
                break

        replacement = [header, "", *list(body_lines), ""]
        if header_idx == -1:
            if updated and updated[-1].strip():
                updated.append("")
            updated.extend(replacement)
            return updated

        stripped = updated[header_idx].lstrip()
        level = len(stripped) - len(stripped.lstrip("#"))

        end_idx = len(updated)
        for idx in range(header_idx + 1, len(updated)):
            candidate = updated[idx].lstrip()
            if not candidate.startswith("#"):
                continue
            cand_level = len(candidate) - len(candidate.lstrip("#"))
            if cand_level <= level:
                end_idx = idx
                break

        updated[header_idx:end_idx] = replacement
        return updated

    @staticmethod
    def _updated_goals_subsection_lines(
        lines: list[str],
        subsection: str,
        goal_lines: list[str],
    ) -> list[str]:
        """Return lines with one Goals subsection replaced, preserving others."""
        source_lines = list(lines)
        subsection = subsection.upper()

        def subsection_present(name: str) -> bool:
            token = normalize_header(f"### **{name}**")
            return any(normalize_header(line) == token for line in source_lines)

        sections: list[tuple[str, list[str]]] = []
        for name in GOAL_SECTION_ORDER:
            goals = extract_goals(source_lines, name)
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

        return apply_goals_sections(source_lines, sections, insert_if_missing=True)

    def preview_frontmatter_update(
        self,
        note_date: datetime.date,
        key: str,
        value: str,
    ) -> tuple[str, list[str], list[str]]:
        """Compute frontmatter update preview without mutating disk state."""
        path, before = self._load_lines_for_preview(note_date)
        after = self._updated_frontmatter_lines(before, key, value)
        return path, before, after

    def preview_section_replace(
        self,
        note_date: datetime.date,
        header: str,
        body_lines: Iterable[str],
    ) -> tuple[str, list[str], list[str]]:
        """Compute section-replacement preview without mutating disk state."""
        path, before = self._load_lines_for_preview(note_date)
        after = self._updated_section_lines(before, header, body_lines)
        return path, before, after

    def preview_goals_subsection_replace(
        self,
        note_date: datetime.date,
        subsection: str,
        goal_lines: list[str],
    ) -> tuple[str, list[str], list[str]]:
        """Compute goals subsection replacement preview without writes."""
        path, before = self._load_lines_for_preview(note_date)
        after = self._updated_goals_subsection_lines(before, subsection, goal_lines)
        return path, before, after

    def update_frontmatter(
        self, note_date: datetime.date, key: str, value: str
    ) -> None:
        """Set or insert a YAML frontmatter key/value pair in the daily note."""
        lines = self.load_lines(note_date)
        updated = self._updated_frontmatter_lines(lines, key, value)
        self.save_lines(note_date, updated)

    def replace_section(
        self,
        note_date: datetime.date,
        header: str,
        body_lines: Iterable[str],
    ) -> None:
        """Replace an arbitrary markdown section body by exact header match."""
        lines = self.load_lines(note_date)
        updated = self._updated_section_lines(lines, header, body_lines)
        self.save_lines(note_date, updated)

    def replace_goals_subsection(
        self,
        note_date: datetime.date,
        subsection: str,
        goal_lines: list[str],
    ) -> None:
        """Replace a Goals subsection while preserving other visible subsections."""
        lines = self.load_lines(note_date)
        updated = self._updated_goals_subsection_lines(lines, subsection, goal_lines)
        self.save_lines(note_date, updated)
