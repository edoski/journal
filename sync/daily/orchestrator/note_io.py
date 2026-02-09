"""I/O and section-shape helpers for daily note orchestration."""

from __future__ import annotations

from sync.log import get_logger
from sync.notes.locking import locked_note
from sync.notes.sections import ensure_section_with_divider, section_bounds
from sync.ports.notes import NoteStore

from ..constants import TEMPLATE_PATH

logger = get_logger()


def ensure_daily_sections(lines: list[str], yaml_end_idx: int) -> None:
    """
    Guarantee Goals, Metrics, Reflections sections exist with required dividers.

    Args:
        lines: Note lines (modified in place)
        yaml_end_idx: Index of the closing YAML delimiter
    """
    # Goals immediately after YAML (or start of file)
    goals_header_idx, _ = ensure_section_with_divider(
        lines,
        "Goals",
        level=2,
        insert_pos=(yaml_end_idx + 1) if yaml_end_idx != -1 else 0,
    )

    # Metrics after Goals
    _, goals_end = (
        section_bounds(lines, goals_header_idx, level=2)
        if goals_header_idx != -1
        else (-1, -1)
    )
    metrics_header_idx, _ = ensure_section_with_divider(
        lines,
        "Metrics",
        level=2,
        insert_pos=goals_end
        if goals_end != -1
        else (yaml_end_idx + 1 if yaml_end_idx != -1 else 0),
    )

    # Reflections after Metrics
    _, metrics_end = (
        section_bounds(lines, metrics_header_idx, level=2)
        if metrics_header_idx != -1
        else (-1, -1)
    )
    ensure_section_with_divider(
        lines,
        "Reflections",
        level=2,
        insert_pos=metrics_end if metrics_end != -1 else len(lines),
    )


def read_daily_note(
    file_path: str,
    note_store: NoteStore,
    template_path: str | None = None,
) -> list[str]:
    """
    Read the daily note via NoteStore, creating from template when missing.

    Args:
        file_path: Path to the daily note
        note_store: NoteStore implementation
        template_path: Optional template override (defaults to TEMPLATE_PATH)

    Returns:
        Lines of the note, or empty list on error
    """
    selected_template = template_path or TEMPLATE_PATH
    with locked_note(file_path):
        try:
            return note_store.read_or_create(file_path, selected_template)
        except (PermissionError, OSError) as e:
            logger.error("Error reading daily note %s: %s", file_path, e)
            return []


def find_yaml_end(lines: list[str]) -> int:
    """
    Find the index of the closing YAML delimiter.

    Args:
        lines: Note lines

    Returns:
        Index of closing '---', or -1 if not found
    """
    yaml_end_idx = -1
    dashes_count = 0
    for i, line in enumerate(lines):
        if line.strip() == "---":
            dashes_count += 1
            if dashes_count == 2:
                yaml_end_idx = i
                break
    return yaml_end_idx
