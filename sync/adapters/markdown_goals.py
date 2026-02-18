"""Markdown goals store adapter."""

from __future__ import annotations

from sync.contracts.goals import GoalSection
from sync.goals.note_store import (
    apply_goals_sections,
    extract_goals,
    write_goals_sections,
)
from sync.contracts.goals import Goal
from sync.ports.goals import GoalStore


class MarkdownGoalStore(GoalStore):
    """Canonical markdown-backed goal extraction and persistence adapter."""

    def extract(
        self,
        lines: list[str],
        section: str,
        horizon: str | None = None,
        period_key: str | None = None,
    ) -> list[Goal]:
        """Extract goals from a goals subsection."""
        return extract_goals(
            lines,
            section,
            horizon=horizon,
            period_key=period_key,
        )

    def apply(self, lines: list[str], sections: list[GoalSection]) -> list[str]:
        """Return lines with rebuilt goals sections."""
        rendered_sections = [(item.section, item.lines) for item in sections]
        return apply_goals_sections(lines, rendered_sections, insert_if_missing=True)

    def write(
        self,
        path: str,
        lines: list[str],
        sections: list[GoalSection],
    ) -> list[str]:
        """Persist rebuilt goals sections and return written lines."""
        rendered_sections = [(item.section, item.lines) for item in sections]
        return write_goals_sections(
            path,
            lines,
            rendered_sections,
            insert_if_missing=True,
        )
