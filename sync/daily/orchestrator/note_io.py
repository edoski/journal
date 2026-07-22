"""I/O and section-shape helpers for daily note orchestration."""

from __future__ import annotations

from sync.notes.sections import ensure_section_with_divider


def ensure_metrics_section(lines: list[str], yaml_end_idx: int) -> None:
    """Guarantee the daily Metrics section exists with its divider.

    Args:
        lines: Note lines (modified in place)
        yaml_end_idx: Index of the closing YAML delimiter
    """
    ensure_section_with_divider(
        lines,
        "Metrics",
        level=2,
        insert_pos=(yaml_end_idx + 1) if yaml_end_idx != -1 else 0,
    )


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
