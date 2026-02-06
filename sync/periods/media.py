"""
Media section orchestration helpers.
"""

from __future__ import annotations

import datetime

from sync.constants import BOOKS_DIR, PODCASTS_DIR
from sync.readers.media import scan_books, scan_podcasts
from sync.writers.media import render_media_table


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
    _ = period_type  # Reserved for future extension.

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
