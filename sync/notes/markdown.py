"""
Shared markdown header/section helpers.

Centralizes normalization and block extraction so readers and note manipulation
code use identical matching semantics.
"""

from __future__ import annotations

import re


def normalize_header(line: str) -> str:
    """Normalize markdown headers for matching, ignoring emphasis markers."""
    stripped = line.strip()
    cleaned = re.sub(r"\*+", "", stripped)
    cleaned = re.sub(r"_+", "", cleaned)
    return cleaned.lower()


def extract_block(lines: list[str], header: str) -> list[str] | None:
    """Extract lines belonging to a markdown header section."""
    header_norm = normalize_header(header)
    start = -1
    for idx, line in enumerate(lines):
        if normalize_header(line) == header_norm:
            start = idx
            break
    if start == -1:
        return None

    level = len(header.split()[0]) if header.startswith("#") else 3
    end = len(lines)
    for idx in range(start + 1, len(lines)):
        stripped = lines[idx].strip()
        if (
            stripped.startswith("#" * level + " ")
            and normalize_header(stripped) != header_norm
        ):
            end = idx
            break
    return lines[start:end]
