"""
Media (books and podcasts) scanning for the journal sync system.
"""

from __future__ import annotations

import datetime
import os
import re

from sync.log import get_logger
from sync.contracts.media import Book, Podcast
from sync.readers.frontmatter import parse_frontmatter
from sync.io import safe_read_file

logger = get_logger(__name__)


def _frontmatter_text(frontmatter: dict[str, str], key: str) -> str:
    """Return a frontmatter value as text, normalizing missing/non-string values."""
    value = frontmatter.get(key)
    return value if isinstance(value, str) else ""


def _heal_frontmatter_date(
    filepath: str,
    lines: list[str],
    correct_date: datetime.date,
    date_key: str = "date",
) -> None:
    """
    Restore the date in a file's frontmatter to the correct cached value.

    Args:
        filepath: Path to the markdown file
        lines: Current file lines
        correct_date: The correct date to restore
        date_key: The frontmatter key to heal (default: "date", use "completed" for books)
    """
    date_str = correct_date.strftime("%Y-%m-%d")

    delimiter_indexes = [idx for idx, line in enumerate(lines) if line.strip() == "---"]
    if len(delimiter_indexes) < 2:
        return

    frontmatter_start = delimiter_indexes[0] + 1
    frontmatter_end = delimiter_indexes[1]
    frontmatter_lines = lines[frontmatter_start:frontmatter_end]
    rewritten_frontmatter = [
        (f"{date_key}: {date_str}" if line.startswith(f"{date_key}:") else line)
        for line in frontmatter_lines
    ]

    if rewritten_frontmatter == frontmatter_lines:
        return

    new_lines = (
        lines[:frontmatter_start] + rewritten_frontmatter + lines[frontmatter_end:]
    )

    try:
        with open(filepath, "w") as f:
            f.write("\n".join(new_lines))
        logger.info(
            "Healed %s in %s -> %s", date_key, os.path.basename(filepath), date_str
        )
    except (PermissionError, OSError) as e:
        logger.warning("Failed to heal frontmatter in %s: %s", filepath, e)


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
    *,
    cached_dates: dict[str, str] | None = None,
) -> tuple[list[Book], dict[str, str], bool]:
    """
    Scan notes/books/ for books completed within the date range.

    Also maintains a cache of book dates and heals corrupted frontmatter
    when dates differ from cached values (caused by Obsidian Sync issues).

    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
        books_dir: Path to books directory

    Returns:
        List of Book dataclasses for books completed in range
    """
    books: list[Book] = []
    cache = dict(cached_dates or {})
    cache_modified = False

    if not os.path.isdir(books_dir):
        return books, cache, cache_modified

    for filename in os.listdir(books_dir):
        if not filename.endswith(".md"):
            continue

        filepath = os.path.join(books_dir, filename)
        if not os.path.isfile(filepath):
            continue

        lines = safe_read_file(filepath)
        if lines is None:
            continue

        frontmatter = parse_frontmatter(lines)

        # Parse completed date
        completed_str = _frontmatter_text(frontmatter, "completed")
        completed_date = _parse_date_link(completed_str)

        if completed_date is None:
            continue

        # Extract title from filename (without .md)
        title = filename[:-3]

        # Cache check and healing for completed date
        cached_date_str = cache.get(title)
        if cached_date_str:
            cached_date = _parse_date_link(cached_date_str)
            if cached_date and cached_date != completed_date:
                # Date was corrupted - heal it
                logger.warning(
                    "Book '%s' date mismatch: frontmatter=%s, cached=%s. Healing.",
                    title,
                    completed_date,
                    cached_date,
                )
                _heal_frontmatter_date(filepath, lines, cached_date, "completed")
                completed_date = cached_date
        else:
            # New entry - add to cache
            cache[title] = completed_date.strftime("%Y-%m-%d")
            cache_modified = True

        # Check if completed within date range
        if not (start_date <= completed_date <= end_date):
            continue

        # Parse other fields
        started_str = _frontmatter_text(frontmatter, "started")
        started_date = _parse_date_link(started_str)
        rating = _parse_rating(_frontmatter_text(frontmatter, "rating"))

        books.append(
            Book(
                title=title,
                author=_frontmatter_text(frontmatter, "author"),
                started=started_date,
                completed=completed_date,
                rating=rating,
            )
        )

    # Sort by completed date
    books.sort(key=lambda b: b.completed)

    return books, cache, cache_modified


def scan_podcasts(
    start_date: datetime.date,
    end_date: datetime.date,
    podcasts_dir: str,
    *,
    cached_dates: dict[str, str] | None = None,
) -> tuple[list[Podcast], dict[str, str], bool]:
    """
    Scan notes/podcasts/ for podcasts within the date range.

    Also maintains a cache of podcast dates and heals corrupted frontmatter
    when dates differ from cached values (caused by Obsidian Sync issues).

    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
        podcasts_dir: Path to podcasts directory

    Returns:
        List of Podcast dataclasses for podcasts in range
    """
    podcasts: list[Podcast] = []
    cache = dict(cached_dates or {})
    cache_modified = False

    if not os.path.isdir(podcasts_dir):
        return podcasts, cache, cache_modified

    for filename in os.listdir(podcasts_dir):
        if not filename.endswith(".md"):
            continue

        filepath = os.path.join(podcasts_dir, filename)
        if not os.path.isfile(filepath):
            continue

        lines = safe_read_file(filepath)
        if lines is None:
            continue

        frontmatter = parse_frontmatter(lines)

        # Parse date
        date_str = _frontmatter_text(frontmatter, "date")
        podcast_date = _parse_date_link(date_str)

        if podcast_date is None:
            continue

        # Extract title from filename (without .md)
        title = filename[:-3]

        # Cache check and healing
        cached_date_str = cache.get(title)
        if cached_date_str:
            cached_date = _parse_date_link(cached_date_str)
            if cached_date and cached_date != podcast_date:
                # Date was corrupted - heal it
                logger.warning(
                    "Podcast '%s' date mismatch: frontmatter=%s, cached=%s. Healing.",
                    title,
                    podcast_date,
                    cached_date,
                )
                _heal_frontmatter_date(filepath, lines, cached_date)
                podcast_date = cached_date
        else:
            # New entry - add to cache
            cache[title] = podcast_date.strftime("%Y-%m-%d")
            cache_modified = True

        # Check if within date range
        if not (start_date <= podcast_date <= end_date):
            continue

        # Parse other fields
        rating = _parse_rating(_frontmatter_text(frontmatter, "rating"))
        link_text = _frontmatter_text(frontmatter, "link").strip()
        link = link_text or None

        podcasts.append(
            Podcast(
                title=title,
                host=_frontmatter_text(frontmatter, "host"),
                date=podcast_date,
                rating=rating,
                link=link,
            )
        )

    # Sort by date
    podcasts.sort(key=lambda p: p.date)

    return podcasts, cache, cache_modified
