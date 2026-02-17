"""Tests for shared markdown table core helpers."""

from __future__ import annotations

import pytest

from sync.notes.markdown_tables import (
    TableSchema,
    escape_markdown_cell,
    parse_markdown_table,
    render_divider_row,
    render_markdown_row,
    split_markdown_row,
)


def test_split_markdown_row_handles_escaped_pipes():
    cells = split_markdown_row("| `08:43` | [[x\\|y]] |")
    assert cells == ["`08:43`", "[[x\\|y]]"]


def test_split_markdown_row_invalid_returns_none():
    assert split_markdown_row("not a table row") is None


def test_escape_markdown_cell_escapes_unescaped_pipes_only():
    assert escape_markdown_cell("a|b") == "a\\|b"
    assert escape_markdown_cell("a\\|b") == "a\\|b"


def test_render_markdown_row_and_divider_row():
    assert render_markdown_row(["A", "B"]) == "| A | B |"
    assert render_divider_row(2, divider_cells=["---", "----"]) == "| --- | ---- |"


def test_parse_markdown_table_with_schema():
    lines = [
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
    ]
    table = parse_markdown_table(lines, 0, schema=TableSchema(headers=("A", "B")))
    assert table.headers == ("A", "B")
    assert table.rows == (("1", "2"),)
    assert table.end_idx == 3


def test_parse_markdown_table_schema_mismatch_raises():
    lines = [
        "| X | Y |",
        "| --- | --- |",
    ]
    with pytest.raises(ValueError, match="header does not match schema"):
        parse_markdown_table(lines, 0, schema=TableSchema(headers=("A", "B")))
