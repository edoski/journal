"""Tests for frontmatter parsing utilities."""

from __future__ import annotations

from collections import OrderedDict

from sync.readers.frontmatter import parse_frontmatter


class TestParseFrontmatter:
    """Tests for parse_frontmatter function."""

    def test_valid_frontmatter(self, sample_frontmatter_lines):
        result = parse_frontmatter(sample_frontmatter_lines)
        assert isinstance(result, OrderedDict)
        assert result["date"] == "2025-12-26"
        assert result["workout"] == "true"
        assert result["stretch"] == "false"
        assert result["sleep"] == "7h30m"

    def test_missing_frontmatter(self):
        lines = ["# No frontmatter", "", "Some content"]
        result = parse_frontmatter(lines)
        assert result == OrderedDict()

    def test_incomplete_frontmatter(self):
        lines = ["---", "key: value", "# No closing delimiter"]
        result = parse_frontmatter(lines)
        assert result == OrderedDict()

    def test_empty_lines(self):
        result = parse_frontmatter([])
        assert result == OrderedDict()

    def test_comments_in_frontmatter(self):
        lines = ["---", "key: value", "# comment line", "other: data", "---"]
        result = parse_frontmatter(lines)
        assert result["key"] == "value"
        assert result["other"] == "data"
        assert "# comment line" not in result

    def test_empty_value(self):
        lines = ["---", "key:", "---"]
        result = parse_frontmatter(lines)
        assert result["key"] == ""

    def test_requires_opening_delimiter_on_first_line(self):
        lines = [" ", "---", "key: value", "---"]
        result = parse_frontmatter(lines)
        assert result == OrderedDict()

    def test_ignores_rows_without_colon(self):
        lines = ["---", "key: value", "invalid-row", "other: yes", "---"]
        result = parse_frontmatter(lines)
        assert result == OrderedDict([("key", "value"), ("other", "yes")])

    def test_trims_key_and_value_whitespace(self):
        lines = ["---", "  key   :   spaced value   ", "---"]
        result = parse_frontmatter(lines)
        assert result == OrderedDict([("key", "spaced value")])

    def test_keeps_last_value_for_duplicate_keys(self):
        lines = ["---", "key: first", "key: second", "---"]
        result = parse_frontmatter(lines)
        assert result == OrderedDict([("key", "second")])

    def test_ignores_colon_comments(self):
        lines = ["---", "# ignored: value", "key: kept", "---"]
        result = parse_frontmatter(lines)
        assert result == OrderedDict([("key", "kept")])

    def test_immediate_closing_delimiter_ends_frontmatter(self):
        lines = ["---", "---", "key: should-not-parse", "---"]
        result = parse_frontmatter(lines)
        assert result == OrderedDict()
