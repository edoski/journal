"""
Media table rendering for the journal sync system.
"""

from __future__ import annotations

import datetime

from sync.models import Book, Podcast


def _format_date_compact(d: datetime.date) -> str:
    """Format date as YYYY-MM-DD in backticks."""
    return f"`{d.strftime('%Y-%m-%d')}`"


def render_media_table(
    books: list[Book],
    podcasts: list[Podcast],
) -> list[str]:
    """
    Render a MEDIA table with books and podcasts.

    Args:
        books: List of Book dataclasses
        podcasts: List of Podcast dataclasses

    Returns:
        List of markdown table lines
    """
    lines: list[str] = []
    lines.append("| TYPE | TITLE | DATE |")
    lines.append("| ---- | ----- | ---- |")

    # Add books
    for book in books:
        date_str = _format_date_compact(book.completed)
        lines.append(f"| **BOOK** | [[{book.title}]] | {date_str} |")

    # Add podcasts
    for podcast in podcasts:
        date_str = _format_date_compact(podcast.date)
        lines.append(f"| **PODCAST** | [[{podcast.title}]] | {date_str} |")

    return lines
