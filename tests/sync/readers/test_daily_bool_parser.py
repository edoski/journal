"""Tests for daily-note bool parsing helper."""

from __future__ import annotations

from sync.readers.daily import _parse_bool as parse_bool


class TestParseBool:
    """Tests for parse_bool function."""

    def test_string_true(self):
        assert parse_bool("true") is True
        assert parse_bool("True") is True
        assert parse_bool("TRUE") is True
        assert parse_bool(" true ") is True

    def test_string_false(self):
        assert parse_bool("false") is False
        assert parse_bool("False") is False
        assert parse_bool("anything") is False

    def test_bool_input(self):
        assert parse_bool(True) is True
        assert parse_bool(False) is False

    def test_none_input(self):
        assert parse_bool(None) is False
