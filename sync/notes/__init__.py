"""
Notes infrastructure package (locking, markdown helpers, section splicing).
"""

from __future__ import annotations

from .locking import locked_note
from .markdown import extract_block, normalize_header
from .sections import (
    ensure_note,
    ensure_section_with_divider,
    extract_subsection_tasks,
    find_header_idx,
    goals_section_bounds,
    join_sections,
    replace_metrics_block,
    section_bounds,
    splice_goals_section,
    trim_blank_lines,
)

__all__ = [
    "locked_note",
    "normalize_header",
    "extract_block",
    "find_header_idx",
    "section_bounds",
    "goals_section_bounds",
    "replace_metrics_block",
    "ensure_note",
    "extract_subsection_tasks",
    "splice_goals_section",
    "ensure_section_with_divider",
    "trim_blank_lines",
    "join_sections",
]
