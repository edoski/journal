"""Tests for note-header normalization and lookup."""

from __future__ import annotations

from sync.notes.sections import _find_subheader_idx as find_subheader_idx
from sync.readers.common import normalize_header as _normalize_header


class TestNormalizeHeader:
    def test_basic_header(self):
        assert _normalize_header("### STUDY") == "### study"

    def test_emphasis_removal(self):
        assert _normalize_header("### **STUDY**") == "### study"
        assert _normalize_header("### *STUDY*") == "### study"
        assert _normalize_header("### __STUDY__") == "### study"
        assert _normalize_header("### _STUDY_") == "### study"

    def test_mixed_emphasis(self):
        assert _normalize_header("### **_STUDY_**") == "### study"

    def test_case_insensitive(self):
        assert _normalize_header("### Study") == "### study"
        assert _normalize_header("### STUDY") == "### study"

    def test_preserves_spaces(self):
        result = _normalize_header("### My Goal")
        assert "my goal" in result


class TestFindSubheaderIdx:
    def test_finds_subheader(self):
        lines = [
            "## Goals",
            "---",
            "### **STUDY**",
            "- [x] Task",
        ]
        idx = find_subheader_idx(lines, "STUDY")
        assert idx == 2

    def test_emphasis_insensitive(self):
        lines = ["### **STUDY**", "### HEALTH"]
        assert find_subheader_idx(lines, "STUDY") == 0
        assert find_subheader_idx(lines, "HEALTH") == 1

    def test_case_insensitive(self):
        lines = ["### **Study**"]
        assert find_subheader_idx(lines, "STUDY") == 0
        assert find_subheader_idx(lines, "study") == 0

    def test_respects_bounds(self):
        lines = [
            "### BEFORE",
            "### TARGET",
            "### AFTER",
        ]
        assert find_subheader_idx(lines, "TARGET", start=1, end=2) == 1
        assert find_subheader_idx(lines, "BEFORE", start=1, end=3) == -1

    def test_returns_negative_when_not_found(self):
        lines = ["### OTHER"]
        assert find_subheader_idx(lines, "MISSING") == -1
