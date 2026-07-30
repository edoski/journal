"""Obsidian markdown media source adapter."""

from __future__ import annotations

import datetime
import os
from dataclasses import replace

from sync.constants import BOOKS_DIR, PODCASTS_DIR
from sync.contracts.media import Book, MediaBundle, Podcast
from sync.io import atomic_write_note, safe_read_file
from sync.log import get_logger
from sync.notes.locking import locked_note
from sync.ports.cache import MediaDateCacheStore
from sync.ports.media import MediaSource
from sync.readers.media import (
    parse_book_note,
    parse_media_date,
    parse_podcast_note,
)

logger = get_logger(__name__)


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
        with locked_note(filepath):
            atomic_write_note(filepath, new_lines)
        logger.info(
            "Healed %s in %s -> %s", date_key, os.path.basename(filepath), date_str
        )
    except (PermissionError, OSError) as e:
        logger.warning("Failed to heal frontmatter in %s: %s", filepath, e)


def _scan_books(
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

        title = filename[:-3]
        book = parse_book_note(title, lines)
        if book is None:
            continue
        completed_date = book.completed

        # Cache check and healing for completed date
        cached_date_str = cache.get(title)
        if cached_date_str:
            cached_date = parse_media_date(cached_date_str)
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
                book = replace(book, completed=cached_date)
        else:
            # New entry - add to cache
            cache[title] = completed_date.strftime("%Y-%m-%d")
            cache_modified = True

        # Check if completed within date range
        if not (start_date <= completed_date <= end_date):
            continue

        books.append(book)

    # Sort by completed date
    books.sort(key=lambda b: b.completed)

    return books, cache, cache_modified


def _scan_podcasts(
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

        title = filename[:-3]
        podcast = parse_podcast_note(title, lines)
        if podcast is None:
            continue
        podcast_date = podcast.date

        # Cache check and healing
        cached_date_str = cache.get(title)
        if cached_date_str:
            cached_date = parse_media_date(cached_date_str)
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
                podcast = replace(podcast, date=cached_date)
        else:
            # New entry - add to cache
            cache[title] = podcast_date.strftime("%Y-%m-%d")
            cache_modified = True

        # Check if within date range
        if not (start_date <= podcast_date <= end_date):
            continue

        podcasts.append(podcast)

    # Sort by date
    podcasts.sort(key=lambda p: p.date)

    return podcasts, cache, cache_modified


class ObsidianMediaSource(MediaSource):
    """Scan Obsidian media notes, heal cached dates, and publish cache state."""

    def __init__(
        self,
        books_dir: str = BOOKS_DIR,
        podcasts_dir: str = PODCASTS_DIR,
        *,
        media_cache_store: MediaDateCacheStore,
    ) -> None:
        self.books_dir = books_dir
        self.podcasts_dir = podcasts_dir
        self.media_cache_store = media_cache_store

    def scan(self, start: datetime.date, end: datetime.date) -> MediaBundle:
        """Return media completed within the supplied range."""
        cache = self.media_cache_store.load()
        books, book_cache, books_modified = _scan_books(
            start,
            end,
            self.books_dir,
            cached_dates=cache.get("books", {}),
        )
        podcasts, podcast_cache, podcasts_modified = _scan_podcasts(
            start,
            end,
            self.podcasts_dir,
            cached_dates=cache.get("podcasts", {}),
        )

        if books_modified or podcasts_modified:
            self.media_cache_store.save(
                {
                    "books": book_cache,
                    "podcasts": podcast_cache,
                }
            )

        return MediaBundle(books=books, podcasts=podcasts)
