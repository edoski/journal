"""
Tests for notes module.

Covers note parsing, section manipulation, and metrics extraction.
"""

from __future__ import annotations

from sync.readers.sleep import parse_sleep_table
from sync.readers.study import parse_study_table
from sync.notes.sections import (
    find_header_idx,
    section_bounds,
    subsection_bounds,
    extract_block,
    ensure_section_with_divider,
    trim_blank_lines,
    join_sections,
    replace_metrics_block,
)


class TestFindHeaderIdx:
    """Tests for find_header_idx function."""

    def test_finds_level_2_header(self):
        lines = ["# Title", "## Metrics", "Content"]
        assert find_header_idx(lines, "Metrics") == 1

    def test_finds_level_3_header(self):
        lines = ["## Section", "### Subsection"]
        assert find_header_idx(lines, "Subsection", level=3) == 1

    def test_case_insensitive(self):
        lines = ["## METRICS"]
        assert find_header_idx(lines, "metrics") == 0
        assert find_header_idx(lines, "Metrics") == 0

    def test_ignores_emphasis(self):
        lines = ["## **Metrics**"]
        assert find_header_idx(lines, "Metrics") == 0

    def test_returns_negative_when_not_found(self):
        lines = ["## Other", "## Another"]
        assert find_header_idx(lines, "Missing") == -1

    def test_start_offset(self):
        lines = ["## First", "## Second", "## Third"]
        assert find_header_idx(lines, "Second", start=1) == 1
        assert find_header_idx(lines, "First", start=1) == -1


class TestSectionBounds:
    """Tests for section_bounds function."""

    def test_finds_section_end(self):
        lines = [
            "## Section 1",
            "Content 1",
            "## Section 2",
            "Content 2",
        ]
        start, end = section_bounds(lines, 0)
        assert start == 0
        assert end == 2  # Up to but not including next section

    def test_last_section_extends_to_end(self):
        lines = [
            "## Section 1",
            "Content 1",
            "Content 2",
        ]
        start, end = section_bounds(lines, 0)
        assert start == 0
        assert end == 3

    def test_invalid_header_idx(self):
        lines = ["## Section"]
        start, end = section_bounds(lines, -1)
        assert start == -1
        assert end == -1


class TestSubsectionBounds:
    """Tests for subsection_bounds function."""

    def test_finds_subsection_end(self):
        lines = [
            "## Section",
            "### Sub 1",
            "Content",
            "### Sub 2",
        ]
        start, end = subsection_bounds(lines, 1, 4)
        assert start == 1
        assert end == 3

    def test_respects_parent_end(self):
        lines = [
            "## Section",
            "### Subsection",
            "Content",
        ]
        start, end = subsection_bounds(lines, 1, 3)
        assert start == 1
        assert end == 3

    def test_invalid_subheader_idx(self):
        lines = ["### Sub"]
        start, end = subsection_bounds(lines, -1, 1)
        assert start == -1
        assert end == -1


class TestExtractBlock:
    """Tests for extract_block function."""

    def test_extracts_section(self):
        lines = [
            "## Section 1",
            "Content 1",
            "## Section 2",
            "Content 2",
        ]
        block = extract_block(lines, "## Section 1")
        assert block == ["## Section 1", "Content 1"]

    def test_extracts_subsection(self):
        lines = [
            "### **STUDY**",
            "Task content",
            "### **HEALTH**",
        ]
        block = extract_block(lines, "### **STUDY**")
        assert block == ["### **STUDY**", "Task content"]

    def test_returns_none_when_not_found(self):
        lines = ["## Other"]
        assert extract_block(lines, "## Missing") is None


class TestEnsureSectionWithDivider:
    """Tests for ensure_section_with_divider function."""

    def test_creates_new_section(self):
        lines = ["# Title", "Content"]
        header_idx, divider_idx = ensure_section_with_divider(lines, "Metrics")
        assert lines[header_idx] == "## Metrics"
        assert lines[divider_idx] == "---"
        assert divider_idx == header_idx + 1

    def test_adds_divider_to_existing(self):
        lines = ["## Metrics", "Content"]
        header_idx, divider_idx = ensure_section_with_divider(lines, "Metrics")
        assert header_idx == 0
        assert lines[divider_idx] == "---"

    def test_preserves_existing_divider(self):
        lines = ["## Metrics", "---", "Content"]
        header_idx, divider_idx = ensure_section_with_divider(lines, "Metrics")
        assert header_idx == 0
        assert divider_idx == 1

    def test_returns_negative_when_not_creating(self):
        lines = ["## Other"]
        header_idx, divider_idx = ensure_section_with_divider(
            lines, "Missing", create_if_missing=False
        )
        assert header_idx == -1
        assert divider_idx == -1


class TestTrimBlankLines:
    """Tests for trim_blank_lines function."""

    def test_trims_leading(self):
        lines = ["", "", "Content", "More"]
        result = trim_blank_lines(lines)
        assert result == ["Content", "More"]

    def test_trims_trailing(self):
        lines = ["Content", "More", "", ""]
        result = trim_blank_lines(lines)
        assert result == ["Content", "More"]

    def test_trims_both(self):
        lines = ["", "Content", ""]
        result = trim_blank_lines(lines)
        assert result == ["Content"]

    def test_preserves_internal(self):
        lines = ["Content", "", "More"]
        result = trim_blank_lines(lines)
        assert result == ["Content", "", "More"]

    def test_empty_list(self):
        assert trim_blank_lines([]) == []

    def test_all_blank(self):
        assert trim_blank_lines(["", "", ""]) == []


class TestJoinSections:
    """Tests for join_sections function."""

    def test_joins_with_blank_line(self):
        sections = [
            ["Section 1 content"],
            ["Section 2 content"],
        ]
        result = join_sections(sections)
        assert result == ["Section 1 content", "", "Section 2 content"]

    def test_skips_empty_sections(self):
        sections = [
            ["Content"],
            [],
            ["More content"],
        ]
        result = join_sections(sections)
        assert result == ["Content", "", "More content"]

    def test_empty_input(self):
        assert join_sections([]) == []


class TestParseStudyTable:
    """Tests for parse_study_table function."""

    def test_parses_table(self, sample_study_table_lines):
        sessions = parse_study_table(sample_study_table_lines)
        assert len(sessions) == 2

        # First row: coding, 2h00m, +10m interrupt, 15m (+5m) break
        assert sessions[0].activity == "coding"
        assert sessions[0].duration_minutes == 120.0
        assert sessions[0].interrupt_minutes == 10
        assert sessions[0].overrun_minutes == 5

    def test_parses_reading_row(self, sample_study_table_lines):
        sessions = parse_study_table(sample_study_table_lines)

        # Second row: reading, 1h30m, no interrupt, 10m break
        assert sessions[1].activity == "reading"
        assert sessions[1].duration_minutes == 90.0
        assert sessions[1].interrupt_minutes == 0

    def test_empty_when_no_table(self):
        lines = ["### **STUDY**", "", "No table here"]
        sessions = parse_study_table(lines)
        assert sessions == []

    def test_empty_when_section_missing(self):
        lines = ["### **OTHER**", "Content"]
        sessions = parse_study_table(lines)
        assert sessions == []


class TestParseSleepTable:
    """Tests for parse_sleep_table function."""

    def test_parses_table(self, sample_sleep_table_lines):
        entries = parse_sleep_table(sample_sleep_table_lines)
        assert len(entries) == 1

        assert entries[0].duration_minutes == 480.0  # 8h00m = 480 minutes
        assert entries[0].awake_minutes == 20.0  # 20m

    def test_empty_when_no_table(self):
        lines = ["### **SLEEP**", "", "No table"]
        entries = parse_sleep_table(lines)
        assert entries == []

    def test_empty_when_section_missing(self):
        lines = ["### **OTHER**"]
        entries = parse_sleep_table(lines)
        assert entries == []

    def test_stops_on_first_non_table_line(self):
        lines = [
            "### **SLEEP**",
            "",
            "| TIME | ASLEEP | AWAKE |",
            "| ---- | -------- | ----- |",
            "| 23:00-07:00 | `8h00m` | `20m` |",
            "not a table row",
            "| 07:00-08:00 | `1h00m` | `5m` |",
        ]
        entries = parse_sleep_table(lines)
        assert len(entries) == 1
        assert entries[0].duration_minutes == 480.0
        assert entries[0].awake_minutes == 20.0

    def test_skips_rows_with_missing_columns(self):
        lines = [
            "### **SLEEP**",
            "",
            "| TIME | ASLEEP | AWAKE |",
            "| ---- | -------- | ----- |",
            "| only | two |",
            "| 23:00-07:00 | `8h00m` | `20m` |",
        ]
        entries = parse_sleep_table(lines)
        assert len(entries) == 1
        assert entries[0].duration_minutes == 480.0

    def test_defaults_duration_to_zero_when_missing(self):
        lines = [
            "### **SLEEP**",
            "",
            "| TIME | ASLEEP | AWAKE |",
            "| ---- | -------- | ----- |",
            "| 23:00-07:00 | `` | `20m` |",
        ]
        entries = parse_sleep_table(lines)
        assert len(entries) == 1
        assert entries[0].duration_minutes == 0.0
        assert entries[0].awake_minutes == 20.0

    def test_empty_awake_cell_stays_none(self):
        lines = [
            "### **SLEEP**",
            "",
            "| TIME | ASLEEP | AWAKE |",
            "| ---- | -------- | ----- |",
            "| 09:00-10:00 | `1h00m` | `` |",
        ]
        entries = parse_sleep_table(lines)
        assert len(entries) == 1
        assert entries[0].awake_minutes is None


class TestReplaceMetricsBlock:
    """Tests for replace_metrics_block function."""

    def test_replaces_content(self):
        lines = [
            "# Note",
            "## Metrics",
            "Old content",
            "## Next Section",
        ]
        new_block = ["New content 1", "New content 2"]
        result = replace_metrics_block(lines, new_block)

        assert "## Metrics" in result
        assert "---" in result
        assert "New content 1" in result
        assert "New content 2" in result
        assert "Old content" not in result
        assert "## Next Section" in result

    def test_preserves_following_sections(self):
        lines = [
            "## Metrics",
            "Old",
            "## Reflections",
            "Reflection content",
        ]
        result = replace_metrics_block(lines, ["New"])

        reflections_idx = result.index("## Reflections")
        assert "Reflection content" in result[reflections_idx + 1 :]

    def test_returns_unchanged_if_no_metrics(self):
        lines = ["## Other", "Content"]
        result = replace_metrics_block(lines, ["New"])
        assert result == lines

    def test_handles_trailing_content(self):
        lines = [
            "## Metrics",
            "Old content",
        ]
        result = replace_metrics_block(lines, ["New"])
        assert "New" in result

    def test_replaces_decorated_metrics_header(self):
        lines = [
            "## **Metrics**",
            "Old content",
            "## **Reflections**",
            "Reflection content",
        ]
        result = replace_metrics_block(lines, ["New"])

        assert result == [
            "## **Metrics**",
            "---",
            "New",
            "",
            "## **Reflections**",
            "Reflection content",
        ]
