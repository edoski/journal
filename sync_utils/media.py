"""
Media scanning and rendering utilities for the journal sync system.

Provides functions for scanning book and podcast notes, and rendering
media tables for periodic notes.
"""
from __future__ import annotations

import datetime
import os
import re
from typing import Any

from .constants import BOOKS_DIR, PODCASTS_DIR
from .parsing import parse_frontmatter


def _parse_date_link(value: str) -> datetime.date | None:
    """
    Parse a date from a wikilink like '[[2025-12-30]]' or plain date string.
    
    Returns the date if valid, None otherwise.
    """
    if not value:
        return None
    
    # Extract date from wikilink format [[YYYY-MM-DD]]
    match = re.search(r"\[\[(\d{4}-\d{2}-\d{2})\]\]", value)
    if match:
        try:
            return datetime.datetime.strptime(match.group(1), "%Y-%m-%d").date()
        except ValueError:
            return None
    
    # Try plain date format YYYY-MM-DD
    match = re.match(r"(\d{4}-\d{2}-\d{2})", value.strip())
    if match:
        try:
            return datetime.datetime.strptime(match.group(1), "%Y-%m-%d").date()
        except ValueError:
            return None
    
    return None


def scan_books(
    start_date: datetime.date,
    end_date: datetime.date,
    books_dir: str = BOOKS_DIR,
) -> list[dict[str, Any]]:
    """
    Scan notes/books/ for books completed within the date range.
    
    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
        books_dir: Path to books directory
    
    Returns:
        List of book dicts with keys: title, author, started, completed
        Only books with 'completed' date within range are returned.
    """
    books = []
    
    if not os.path.isdir(books_dir):
        return books
    
    for filename in os.listdir(books_dir):
        if not filename.endswith(".md"):
            continue
        
        filepath = os.path.join(books_dir, filename)
        if not os.path.isfile(filepath):
            continue
        
        try:
            with open(filepath, "r") as f:
                lines = f.read().splitlines()
        except Exception:
            continue
        
        frontmatter = parse_frontmatter(lines)
        
        # Parse completed date
        completed_str = frontmatter.get("completed", "")
        completed_date = _parse_date_link(completed_str)
        
        if completed_date is None:
            continue
        
        # Check if completed within date range
        if not (start_date <= completed_date <= end_date):
            continue
        
        # Parse started date
        started_str = frontmatter.get("started", "")
        started_date = _parse_date_link(started_str)
        
        # Extract title from filename (without .md)
        title = filename[:-3]
        
        books.append({
            "title": title,
            "author": frontmatter.get("author", ""),
            "started": started_date,
            "completed": completed_date,
        })
    
    # Sort by completed date
    books.sort(key=lambda b: b["completed"])
    
    return books


def scan_podcasts(
    start_date: datetime.date,
    end_date: datetime.date,
    podcasts_dir: str = PODCASTS_DIR,
) -> list[dict[str, Any]]:
    """
    Scan notes/podcasts/ for podcasts within the date range.
    
    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
        podcasts_dir: Path to podcasts directory
    
    Returns:
        List of podcast dicts with keys: title, host, date
        Only podcasts with 'date' within range are returned.
    """
    podcasts = []
    
    if not os.path.isdir(podcasts_dir):
        return podcasts
    
    for filename in os.listdir(podcasts_dir):
        if not filename.endswith(".md"):
            continue
        
        filepath = os.path.join(podcasts_dir, filename)
        if not os.path.isfile(filepath):
            continue
        
        try:
            with open(filepath, "r") as f:
                lines = f.read().splitlines()
        except Exception:
            continue
        
        frontmatter = parse_frontmatter(lines)
        
        # Parse date
        date_str = frontmatter.get("date", "")
        podcast_date = _parse_date_link(date_str)
        
        if podcast_date is None:
            continue
        
        # Check if within date range
        if not (start_date <= podcast_date <= end_date):
            continue
        
        # Extract title from filename (without .md)
        title = filename[:-3]
        
        podcasts.append({
            "title": title,
            "host": frontmatter.get("host", ""),
            "date": podcast_date,
        })
    
    # Sort by date
    podcasts.sort(key=lambda p: p["date"])
    
    return podcasts


def _format_date_compact(d: datetime.date) -> str:
    """Format date as MM/DD."""
    return f"{d.month:02d}/{d.day:02d}"


def render_media_table(
    books: list[dict[str, Any]],
    podcasts: list[dict[str, Any]],
) -> list[str]:
    """
    Render a media table with TYPE | TITLE | PERIOD columns.
    
    Args:
        books: List of book dicts from scan_books()
        podcasts: List of podcast dicts from scan_podcasts()
    
    Returns:
        List of markdown lines for the table.
        Returns empty list if no media.
    """
    if not books and not podcasts:
        return []
    
    lines = [
        "| TYPE | TITLE | PERIOD |",
        "| ---- | ----- | ------ |",
    ]
    
    # Add books
    for book in books:
        title_link = f"[[books/{book['title']}]]"
        if book["started"] and book["completed"]:
            period = f"`{_format_date_compact(book['started'])} - {_format_date_compact(book['completed'])}`"
        elif book["completed"]:
            period = f"`{_format_date_compact(book['completed'])}`"
        else:
            period = ""
        lines.append(f"| BOOK | {title_link} | {period} |")
    
    # Add podcasts
    for podcast in podcasts:
        title_link = f"[[podcasts/{podcast['title']}]]"
        period = f"`{_format_date_compact(podcast['date'])}`"
        lines.append(f"| PODCAST | {title_link} | {period} |")
    
    return lines


def build_media_section(
    start_date: datetime.date,
    end_date: datetime.date,
    period_name: str = "period",
    books_dir: str = BOOKS_DIR,
    podcasts_dir: str = PODCASTS_DIR,
) -> list[str]:
    """
    Build the complete MEDIA section for a periodic note.
    
    Args:
        start_date: Start of period (inclusive)
        end_date: End of period (inclusive)
        period_name: Name of the period for empty message (e.g., "week", "month", "year")
        books_dir: Path to books directory
        podcasts_dir: Path to podcasts directory
    
    Returns:
        List of markdown lines for the MEDIA section.
    """
    books = scan_books(start_date, end_date, books_dir)
    podcasts = scan_podcasts(start_date, end_date, podcasts_dir)
    
    lines = ["### **MEDIA**", ""]
    
    if not books and not podcasts:
        lines.append(f"_No media completed this {period_name}._")
    else:
        lines.extend(render_media_table(books, podcasts))
    
    return lines
