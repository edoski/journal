"""
Frontmatter parsing for the journal sync system.
"""

from __future__ import annotations

from collections import OrderedDict


def parse_frontmatter(lines: list[str]) -> OrderedDict[str, str]:
    """
    Parse YAML frontmatter from markdown lines into an ordered dict.

    Args:
        lines: List of markdown lines

    Returns:
        OrderedDict of frontmatter key-value pairs
    """
    data: OrderedDict[str, str] = OrderedDict()
    if not lines or lines[0].strip() != "---":
        return data

    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break

    if end_idx is None:
        return data

    for line in lines[1:end_idx]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        data[key.strip()] = value.strip()

    return data
