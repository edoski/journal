"""Small markdown-cell formatter helpers for table renderers."""

from __future__ import annotations


def code_cell(value: str) -> str:
    """Wrap a value in markdown inline-code delimiters."""
    return f"`{value}`"


def bold_cell(value: str) -> str:
    """Wrap a value in markdown bold delimiters."""
    return f"**{value}**"


def bold_code_cell(value: str) -> str:
    """Wrap a value in bold + inline-code delimiters."""
    return f"**`{value}`**"
