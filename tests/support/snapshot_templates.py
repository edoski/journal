"""Snapshot normalization helpers for policy-driven dynamic fields."""

from __future__ import annotations

from tests.support.markdown_parse import join_markdown_row, split_markdown_row


def normalize_summary_dynamic_cells(lines: list[str]) -> list[str]:
    """
    Normalize SUMMARY target/progress cells so snapshots ignore policy-only drift.

    The test suite separately asserts these cells against production target policy.
    """
    normalized: list[str] = []
    in_summary_section = False
    in_summary_table = False
    summary_cell_count = 0

    for line in lines:
        if line == "### **SUMMARY**":
            in_summary_section = True
            in_summary_table = False
            summary_cell_count = 0
            normalized.append(line)
            continue

        if (
            in_summary_section
            and line.startswith("### **")
            and line != "### **SUMMARY**"
        ):
            in_summary_section = False
            in_summary_table = False
            summary_cell_count = 0

        if in_summary_section and line.startswith("| METRIC |"):
            in_summary_table = True
            header_cells = split_markdown_row(line)
            summary_cell_count = len(header_cells)
            normalized.append(line)
            continue

        if in_summary_table and line.startswith("| ") and line.endswith("|"):
            cells = split_markdown_row(line)
            if (
                len(cells) == summary_cell_count
                and cells
                and cells[0].replace("*", "").strip().upper()
                in {"STUDY", "SLEEP", "MINDFUL", "WORKOUT", "STRETCH", "MOOD"}
            ):
                cells[-2] = "<TARGET>"
                cells[-1] = "<PROGRESS>"
                normalized.append(join_markdown_row(cells))
                continue

        normalized.append(line)

    return normalized
