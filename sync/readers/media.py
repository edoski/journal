"""Pure Obsidian media-note parsing."""

from __future__ import annotations

import datetime
import re

from sync.contracts.media import Book, Podcast, SeriesIndex
from sync.readers.frontmatter import parse_frontmatter


def _frontmatter_text(frontmatter: dict[str, str], key: str) -> str:
    """Return a frontmatter value as normalized text."""
    value = frontmatter.get(key)
    return value if isinstance(value, str) else ""


def parse_media_date(value: str) -> datetime.date | None:
    """Parse a wikilink or plain ISO date."""
    if not value:
        return None

    match = re.search(r"\[\[(\d{4}-\d{2}-\d{2})\]\]", value)
    if match is None:
        match = re.match(r"(\d{4}-\d{2}-\d{2})", value.strip())
    if match is None:
        return None
    try:
        return datetime.date.fromisoformat(match.group(1))
    except ValueError:
        return None


def _parse_visible(frontmatter: dict[str, str]) -> bool:
    """Read the `visible` checkbox property; anything but `true` stays hidden."""
    return _frontmatter_text(frontmatter, "visible").strip().lower() == "true"


def parse_book_note(title: str, lines: list[str]) -> Book | None:
    """Parse one book note."""
    frontmatter = parse_frontmatter(lines)
    completed = parse_media_date(_frontmatter_text(frontmatter, "completed"))
    if completed is None:
        return None
    return Book(
        title=title,
        author=_frontmatter_text(frontmatter, "author"),
        completed=completed,
    )


def parse_podcast_note(title: str, lines: list[str]) -> Podcast | None:
    """Parse one podcast note."""
    frontmatter = parse_frontmatter(lines)
    podcast_date = parse_media_date(_frontmatter_text(frontmatter, "date"))
    if podcast_date is None:
        return None
    link = _frontmatter_text(frontmatter, "link").strip()
    return Podcast(
        title=title,
        host=_frontmatter_text(frontmatter, "host"),
        date=podcast_date,
        link=link or None,
        visible=_parse_visible(frontmatter),
    )


def parse_series_index(lines: list[str]) -> SeriesIndex:
    """
    Read a podcast series' index-note frontmatter.

    The index note is the series' representative note, so its `visible` and
    `host` properties speak for the whole folder exactly as a podcast note's do
    for itself. A blank `host` leaves the series' author to its episodes.
    """
    frontmatter = parse_frontmatter(lines)
    return SeriesIndex(
        visible=_parse_visible(frontmatter),
        host=_frontmatter_text(frontmatter, "host"),
    )
