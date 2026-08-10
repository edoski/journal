"""
Markdown section extraction and manipulation for note files.
"""

from __future__ import annotations

from sync.notes.markdown import extract_block as _extract_block
from sync.notes.markdown import normalize_header as _normalize_header


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


def replace_metrics_block(lines: list[str], new_block_lines: list[str]) -> list[str]:
    """Replace the ## Metrics section content with new lines."""
    metrics_idx = find_header_idx(lines, "Metrics")
    if metrics_idx == -1:
        return lines

    _, end_idx = section_bounds(lines, metrics_idx, level=2)

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
