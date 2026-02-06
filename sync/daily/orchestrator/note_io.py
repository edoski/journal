"""I/O and section-shape helpers for daily note orchestration."""

from __future__ import annotations

import os

from sync.logging import get_logger
from sync.notes.locking import locked_note
from sync.notes.sections import ensure_section_with_divider, section_bounds

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


def read_daily_note(file_path: str) -> list[str]:
    """
    Read the daily note, creating from template if it doesn't exist.

    Args:
        file_path: Path to the daily note

    Returns:
        Lines of the note, or empty list on error
    """
    with locked_note(file_path):
        if not os.path.exists(file_path):
            if os.path.exists(TEMPLATE_PATH):
                try:
                    with open(TEMPLATE_PATH, "r") as tf:
                        template_content = tf.read()
                    with open(file_path, "w") as f:
                        f.write(template_content)
                except (PermissionError, OSError) as e:
                    logger.error("Error creating file from template: %s", e)
                    return []
            else:
                return []

        with open(file_path, "r") as f:
            return f.read().splitlines()


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
