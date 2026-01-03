"""
Media table rendering for the journal sync system.
"""

from __future__ import annotations

import datetime

from sync.constants import BOOKS_DIR, PODCASTS_DIR
from sync.models import Book, Podcast
from sync.readers.media import scan_books, scan_podcasts


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
        lines.append(f"| BOOK | [[{book.title}]] | {date_str} |")

    # Add podcasts
    for podcast in podcasts:
        date_str = _format_date_compact(podcast.date)
        lines.append(f"| PODCAST | [[{podcast.title}]] | {date_str} |")

    return lines


def build_media_section(
    start_date: datetime.date,
    end_date: datetime.date,
    period_type: str = "",
) -> list[str]:
    """
    Build the complete MEDIA section for periodic notes.

    Scans books and podcasts directories for items completed within the date range.

    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
        period_type: Optional period identifier (unused, for future extension)

    Returns:
        List of markdown lines for the MEDIA section, or empty if no media
    """
    books = scan_books(start_date, end_date, BOOKS_DIR)
    podcasts = scan_podcasts(start_date, end_date, PODCASTS_DIR)

    if not books and not podcasts:
        return []

    lines: list[str] = []
    lines.append("### **MEDIA**")
    lines.append("")
    lines.extend(render_media_table(books, podcasts))
    lines.append("")

    return lines

