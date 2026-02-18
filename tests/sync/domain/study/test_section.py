"""Tests for canonical STUDY section extraction."""

from __future__ import annotations

import pytest

from sync.study.section import extract_existing_data


def test_extract_existing_data_uses_canonical_context_and_notes_columns():
    lines = [
        "### **STUDY**",
        "",
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |",
        "| ---- | -------- | -------- | --------- | ----- | ------- | ----- |",
        "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` | [[Foo]] | kept note |",
    ]

    notes, context = extract_existing_data(lines)
    assert notes == {"09:00": "kept note"}
    assert context == {"09:00": "[[Foo]]"}


def test_extract_existing_data_rejects_legacy_header_without_context():
    lines = [
        "### **STUDY**",
        "",
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | NOTES |",
        "| ---- | -------- | -------- | --------- | ----- | ----- |",
        "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` | kept note |",
    ]

    with pytest.raises(
        ValueError,
        match="Non-canonical STUDY table header",
    ):
        extract_existing_data(lines)
