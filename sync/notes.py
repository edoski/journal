"""
Compatibility facade for note utilities.

This module preserves the original `sync.notes` public API while delegating
implementation to focused modules:
- `sync.notes_locking`
- `sync.notes_sections`
- `sync.notes_parsing`
- `sync.readers.daily`
"""

from __future__ import annotations

from sync.io import safe_read_file  # re-export
from sync.notes_locking import locked_note
from sync.notes_parsing import (
    _parse_bool,
    parse_sleep_table,
    parse_study_table,
)
from sync.notes_sections import (
    _find_subheader_idx,
    ensure_note,
    ensure_section_with_divider,
    extract_block,
    extract_subsection_tasks,
    find_header_idx,
    goals_section_bounds,
    join_sections,
    replace_metrics_block,
    section_bounds,
    splice_goals_section,
    subsection_bounds,
    trim_blank_lines,
)
from sync.readers.common import (
    normalize_header as _normalize_header,
    parse_duration_to_minutes as _parse_duration_to_minutes,
)
from sync.readers.daily import parse_daily_note

__all__ = [
    "_find_subheader_idx",
    "_normalize_header",
    "_parse_bool",
    "_parse_duration_to_minutes",
    "ensure_note",
    "ensure_section_with_divider",
    "extract_block",
    "extract_subsection_tasks",
    "find_header_idx",
    "goals_section_bounds",
    "join_sections",
    "locked_note",
    "parse_daily_note",
    "parse_sleep_table",
    "parse_study_table",
    "replace_metrics_block",
    "safe_read_file",
    "section_bounds",
    "splice_goals_section",
    "subsection_bounds",
    "trim_blank_lines",
]
