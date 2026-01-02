"""
Media (books and podcasts) scanning for the journal sync system.
"""

from __future__ import annotations

import datetime
import os
import re
from collections import OrderedDict

from sync.models import Book, Podcast


def _parse_frontmatter(lines: list[str]) -> OrderedDict[str, str]:
    """Parse YAML frontmatter from markdown lines."""
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


def _parse_date_link(value: str) -> datetime.date | None:
    """
    Parse a date from a wikilink like '[[2025-12-30]]' or plain date string.
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


def _parse_rating(value: str) -> float | None:
    """Parse a rating value from frontmatter."""
    if not value:
        return None
    try:
        return float(value.strip())
    except ValueError:
        return None


def scan_books(
    start_date: datetime.date,
    end_date: datetime.date,
    books_dir: str,
) -> list[Book]:
    """
    Scan notes/books/ for books completed within the date range.

    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
        books_dir: Path to books directory

    Returns:
        List of Book dataclasses for books completed in range
    """
    books: list[Book] = []

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

        frontmatter = _parse_frontmatter(lines)

        # Parse completed date
        completed_str = frontmatter.get("completed", "")
        completed_date = _parse_date_link(completed_str)

        if completed_date is None:
            continue

        # Check if completed within date range
        if not (start_date <= completed_date <= end_date):
            continue

        # Parse other fields
        started_str = frontmatter.get("started", "")
        started_date = _parse_date_link(started_str)
        rating = _parse_rating(frontmatter.get("rating", ""))

        # Extract title from filename (without .md)
        title = filename[:-3]

        books.append(
            Book(
                title=title,
                author=frontmatter.get("author", ""),
                started=started_date,
                completed=completed_date,
                rating=rating,
            )
        )

    # Sort by completed date
    books.sort(key=lambda b: b.completed)

    return books


def scan_podcasts(
    start_date: datetime.date,
    end_date: datetime.date,
    podcasts_dir: str,
) -> list[Podcast]:
    """
    Scan notes/podcasts/ for podcasts within the date range.

    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
        podcasts_dir: Path to podcasts directory

    Returns:
        List of Podcast dataclasses for podcasts in range
    """
    podcasts: list[Podcast] = []

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

        frontmatter = _parse_frontmatter(lines)

        # Parse date
        date_str = frontmatter.get("date", "")
        podcast_date = _parse_date_link(date_str)

        if podcast_date is None:
            continue

        # Check if within date range
        if not (start_date <= podcast_date <= end_date):
            continue

        # Parse other fields
        rating = _parse_rating(frontmatter.get("rating", ""))
        link = frontmatter.get("link", "") or None

        # Extract title from filename (without .md)
        title = filename[:-3]

        podcasts.append(
            Podcast(
                title=title,
                host=frontmatter.get("host", ""),
                date=podcast_date,
                rating=rating,
                link=link,
            )
        )

    # Sort by date
    podcasts.sort(key=lambda p: p.date)

    return podcasts
