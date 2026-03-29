"""
Markdown section extraction and manipulation for note files.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sync.notes.markdown import extract_block as _extract_block
from sync.notes.markdown import normalize_header as _normalize_header

if TYPE_CHECKING:
    from sync.contracts.goals import Goal


def _find_subheader_idx(
    lines: list[str],
    title: str,
    start: int = 0,
    end: int | None = None,
    level: int = 3,
) -> int:
    """Find index of a subheader between start and end."""
    end = end if end is not None else len(lines)
    needle = _normalize_header(f"{'#' * level} {title}")
    for idx in range(start, end):
        if _normalize_header(lines[idx]) == needle:
            return idx
    return -1


def find_header_idx(
    lines: list[str],
    title: str,
    level: int = 2,
    start: int = 0,
) -> int:
    """Find the index of a markdown header like ## Title or ### Title."""
    needle = _normalize_header(f"{'#' * level} {title}")
    for idx in range(start, len(lines)):
        if _normalize_header(lines[idx]) == needle:
            return idx
    return -1


def section_bounds(
    lines: list[str],
    header_idx: int,
    level: int = 2,
) -> tuple[int, int]:
    """Return (start, end) indices for a header block delimited by same-level headers."""
    if header_idx == -1:
        return -1, -1
    end_idx = len(lines)
    header_prefix = "#" * level + " "
    for idx in range(header_idx + 1, len(lines)):
        if lines[idx].strip().startswith(header_prefix) and _normalize_header(
            lines[idx]
        ) != _normalize_header(lines[header_idx]):
            end_idx = idx
            break
    return header_idx, end_idx


def subsection_bounds(
    lines: list[str],
    subheader_idx: int,
    parent_end_idx: int,
) -> tuple[int, int]:
    """Return (start, end) indices for a ### subsection up to next ### or parent end."""
    if subheader_idx == -1:
        return -1, -1
    end_idx = parent_end_idx
    for idx in range(subheader_idx + 1, parent_end_idx):
        if lines[idx].strip().startswith("### ") and _normalize_header(
            lines[idx]
        ) != _normalize_header(lines[subheader_idx]):
            end_idx = idx
            break
    return subheader_idx, end_idx


def extract_block(lines: list[str], header: str) -> list[str] | None:
    """Extract lines belonging to a markdown header section."""
    return _extract_block(lines, header)


def ensure_section_with_divider(
    lines: list[str],
    title: str,
    level: int = 2,
    insert_pos: int | None = None,
    create_if_missing: bool = True,
) -> tuple[int, int]:
    """Ensure a header exists and is immediately followed by a divider line."""
    header_idx = find_header_idx(lines, title, level=level)
    if header_idx == -1:
        if not create_if_missing:
            return -1, -1
        pos = insert_pos if insert_pos is not None else len(lines)
        if pos > 0 and lines[pos - 1].strip() != "":
            lines.insert(pos, "")
            pos += 1
        lines.insert(pos, f"{'#' * level} {title}")
        header_idx = pos
        lines.insert(header_idx + 1, "---")
        return header_idx, header_idx + 1

    divider_idx = header_idx + 1
    if divider_idx >= len(lines) or lines[divider_idx].strip() != "---":
        lines.insert(divider_idx, "---")

    return header_idx, divider_idx


def goals_section_bounds(lines: list[str]) -> tuple[int, int]:
    """Return (start, end) indices for the ## Goals section."""
    goals_idx = find_header_idx(lines, "Goals", level=2)
    if goals_idx == -1:
        return -1, -1
    _, end = section_bounds(lines, goals_idx, level=2)
    return goals_idx, end


def splice_goals_section(
    lines: list[str],
    new_block: list[str],
    insert_if_missing: bool = False,
    *,
    insert_after_idx: int | None = None,
) -> bool:
    """Replace the Goals section in lines with new_block."""
    g_start, g_end = goals_section_bounds(lines)
    if g_start < 0:
        if insert_if_missing:
            if insert_after_idx is not None:
                insert_pos = max(0, min(insert_after_idx + 1, len(lines)))
                lines[insert_pos:insert_pos] = new_block
            else:
                separator = [""] if lines and lines[0].strip() else []
                lines[:] = new_block + separator + lines[:]
            return True
        return False
    lines[g_start:g_end] = new_block
    return True


def extract_subsection_tasks(
    lines: list[str],
    parent_start: int,
    parent_end: int,
    sub_title: str,
) -> list["Goal"]:
    """Extract checkbox tasks from a ### subsection within a parent block."""
    from sync.readers.goals import parse_goal_tasks

    sub_idx = _find_subheader_idx(
        lines,
        sub_title,
        start=parent_start,
        end=parent_end,
        level=3,
    )
    if sub_idx == -1:
        return []
    _, sub_end = subsection_bounds(lines, sub_idx, parent_end)
    body_start = sub_idx + 1
    while body_start < sub_end and lines[body_start].strip() == "":
        body_start += 1
    return parse_goal_tasks(lines[body_start:sub_end])


def trim_blank_lines(lines: list[str]) -> list[str]:
    """Remove leading and trailing blank lines from a list."""
    while lines and lines[0].strip() == "":
        lines = lines[1:]
    while lines and lines[-1].strip() == "":
        lines = lines[:-1]
    return lines


def join_sections(sections: list[list[str]]) -> list[str]:
    """Join multiple line-blocks with a single blank line between non-empty blocks."""
    result: list[str] = []
    for sec in sections:
        if not sec:
            continue
        if result and result[-1].strip() != "":
            result.append("")
        result.extend(sec)
    return result


def ensure_note(path: str, template_path: str) -> None:
    """Ensure a note file exists, creating from template if needed."""
    import os

    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if template_path and os.path.exists(template_path):
        with open(template_path, "r") as tf:
            content = tf.read()
        with open(path, "w") as f:
            f.write(content)


def replace_metrics_block(lines: list[str], new_block_lines: list[str]) -> list[str]:
    """Replace the ## Metrics section content with new lines."""
    metrics_idx = None
    for idx, line in enumerate(lines):
        if line.strip().lower() == "## metrics":
            metrics_idx = idx
            break
    if metrics_idx is None:
        return lines

    end_idx = len(lines)
    for idx in range(metrics_idx + 1, len(lines)):
        if (
            lines[idx].strip().startswith("## ")
            and lines[idx].strip().lower() != "## metrics"
        ):
            end_idx = idx
            break

    new_lines = lines[: metrics_idx + 1]
    new_lines.append("---")
    new_lines.extend(new_block_lines)

    remainder = lines[end_idx:]
    while remainder and remainder[0].strip() == "":
        remainder = remainder[1:]

    if remainder and (not new_lines or new_lines[-1].strip() != ""):
        new_lines.append("")

    new_lines.extend(remainder)
    return new_lines
