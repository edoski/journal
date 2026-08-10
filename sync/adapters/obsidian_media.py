"""Obsidian markdown media source adapter."""

from __future__ import annotations

import datetime
import os
from dataclasses import replace

from sync.constants import BOOKS_DIR, PODCASTS_DIR
from sync.contracts.media import Book, MediaBundle, Podcast, PodcastSeries
from sync.io import atomic_write_note, safe_read_file
from sync.log import get_logger
from sync.notes.locking import locked_note
from sync.notes.markdown_tables import split_markdown_row_lenient
from sync.ports.cache import MediaDateCacheStore
from sync.ports.media import MediaSource
from sync.readers.media import (
    parse_book_note,
    parse_media_date,
    parse_podcast_note,
    parse_series_visibility,
)
from sync.writers.tables import SimpleGridTableSpec, render_table

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


def _scan_podcast_directory(
    directory: str,
    *,
    key_prefix: str,
    cache: dict[str, str],
    skip_filename: str | None = None,
) -> tuple[list[Podcast], bool]:
    """
    Scan one directory of podcast notes, updating `cache` in place.

    Every note is cached and date-healed; date-range and visibility filtering is
    left to callers, which also need the notes a series entry hides.

    Args:
        directory: Directory holding podcast notes
        key_prefix: Prefix making cache keys unique across subdirectories
        cache: Title-to-date cache, mutated as notes are discovered
        skip_filename: Note left out of the scan (a series' own index note)

    Returns:
        Every parsed podcast note, and whether the cache gained new entries
    """
    podcasts: list[Podcast] = []
    cache_modified = False

    for filename in sorted(os.listdir(directory)):
        if not filename.endswith(".md") or filename == skip_filename:
            continue

        filepath = os.path.join(directory, filename)
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
        cache_key = f"{key_prefix}{title}"

        # Cache check and healing
        cached_date_str = cache.get(cache_key)
        if cached_date_str:
            cached_date = parse_media_date(cached_date_str)
            if cached_date and cached_date != podcast_date:
                # Date was corrupted - heal it
                logger.warning(
                    "Podcast '%s' date mismatch: frontmatter=%s, cached=%s. Healing.",
                    cache_key,
                    podcast_date,
                    cached_date,
                )
                _heal_frontmatter_date(filepath, lines, cached_date)
                podcast_date = cached_date
                podcast = replace(podcast, date=cached_date)
        else:
            # New entry - add to cache
            cache[cache_key] = podcast_date.strftime("%Y-%m-%d")
            cache_modified = True

        podcasts.append(podcast)

    podcasts.sort(key=lambda p: (p.date, p.title))

    return podcasts, cache_modified


def _in_range(
    podcasts: list[Podcast],
    start_date: datetime.date,
    end_date: datetime.date,
) -> list[Podcast]:
    """Keep the podcasts watched inside the period window."""
    return [podcast for podcast in podcasts if start_date <= podcast.date <= end_date]


def _series_frontmatter(lines: list[str] | None) -> list[str]:
    """
    Return an index note's frontmatter block, defaulting to a hidden series.

    The block is the hand-edited half of the note: `visible: true` there opts the
    series into media tables, so an existing block is preserved verbatim.
    """
    if lines and lines[0].strip() == "---":
        for index, line in enumerate(lines[1:], start=1):
            if line.strip() == "---":
                return lines[: index + 1]
    return ["---", "visible: false", "---"]


def _series_index_lines(frontmatter: list[str], episodes: list[Podcast]) -> list[str]:
    """Render a series index note: its frontmatter above an episode table."""
    return [
        *frontmatter,
        "",
        *render_table(
            SimpleGridTableSpec(
                headers=["EPISODE", "DATE"],
                divider_cells=["-------", "----"],
                rows=[
                    [f"[[{episode.title}]]", f"`{episode.date:%Y-%m-%d}`"]
                    for episode in episodes
                ],
            )
        ),
    ]


def _normalized_table_cells(lines: list[str]) -> list[tuple[str, ...]]:
    """
    Reduce table lines to their cell values, ignoring column padding.

    Obsidian formatters pad table columns, which must not read as a content
    change and start a rewrite war with the generated index note.
    """
    normalized: list[tuple[str, ...]] = []
    for line in lines:
        if not line.strip():
            continue
        cells = split_markdown_row_lenient(line)
        if cells is None:
            normalized.append((line.strip(),))
            continue
        normalized.append(
            tuple("-" if set(cell) <= {"-", ":"} and cell else cell for cell in cells)
        )
    return normalized


def _sync_series_index(directory: str, title: str, episodes: list[Podcast]) -> bool:
    """
    Regenerate a series' index note and report whether it renders.

    The note represents the series in periodic media tables, so its `visible`
    property decides rendering exactly as a standalone podcast's does for itself.
    Only the episode table below the frontmatter is generated: it is rewritten
    whenever the episode list drifts and left untouched otherwise.

    Args:
        directory: The series folder
        title: Series title, which the index note is named after
        episodes: Every episode note in the folder, in watch order

    Returns:
        Whether the series opts into rendering
    """
    filepath = os.path.join(directory, f"{title}.md")
    existing = safe_read_file(filepath)
    frontmatter = _series_frontmatter(existing)
    lines = _series_index_lines(frontmatter, episodes)

    if existing is None or _normalized_table_cells(existing) != (
        _normalized_table_cells(lines)
    ):
        try:
            with locked_note(filepath):
                atomic_write_note(filepath, lines)
            logger.info("Regenerated series index for %s", title)
        except (TimeoutError, PermissionError, OSError) as e:
            logger.warning("Failed to write series index for %s: %s", title, e)

    return parse_series_visibility(frontmatter)


def _scan_podcasts(
    start_date: datetime.date,
    end_date: datetime.date,
    podcasts_dir: str,
    *,
    cached_dates: dict[str, str] | None = None,
) -> tuple[list[Podcast], list[PodcastSeries], dict[str, str], bool]:
    """
    Scan notes/podcasts/ for visible podcasts within the date range.

    Notes directly in the directory render as one entry each and are visible only
    when they say so themselves. Each subdirectory is a series that renders as a
    single entry, dated by its latest episode in range; the series says whether
    it is visible through its own index note, which is regenerated on every scan.

    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
        podcasts_dir: Path to podcasts directory

    Returns:
        Standalone podcasts, series entries, the updated cache, and whether it changed
    """
    cache = dict(cached_dates or {})

    if not os.path.isdir(podcasts_dir):
        return [], [], cache, False

    root_notes, cache_modified = _scan_podcast_directory(
        podcasts_dir,
        key_prefix="",
        cache=cache,
    )

    series: list[PodcastSeries] = []
    for entry in sorted(os.listdir(podcasts_dir)):
        directory = os.path.join(podcasts_dir, entry)
        if entry.startswith(".") or not os.path.isdir(directory):
            continue

        episodes, series_modified = _scan_podcast_directory(
            directory,
            key_prefix=f"{entry}/",
            cache=cache,
            skip_filename=f"{entry}.md",
        )
        cache_modified = cache_modified or series_modified
        visible = _sync_series_index(directory, entry, episodes)

        rendered = _in_range(episodes, start_date, end_date)
        if not visible or not rendered:
            continue

        series.append(
            PodcastSeries(
                title=entry,
                date=max(episode.date for episode in rendered),
            )
        )

    # Sort by date
    podcasts = [
        podcast
        for podcast in _in_range(root_notes, start_date, end_date)
        if podcast.visible
    ]
    series.sort(key=lambda s: s.date)

    return podcasts, series, cache, cache_modified


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
        podcasts, series, podcast_cache, podcasts_modified = _scan_podcasts(
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

        return MediaBundle(books=books, podcasts=podcasts, series=series)
