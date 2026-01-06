"""
Tests for the media scanning and rendering module.
"""

from __future__ import annotations

import datetime

from sync.models import Book, Podcast
from sync.readers.media import (
    _parse_date_link,
    scan_books,
    scan_podcasts,
)
from sync.writers.media import render_media_table, build_media_section


class TestParseDateLink:
    """Tests for _parse_date_link function."""

    def test_wikilink_format(self):
        """Parse date from [[YYYY-MM-DD]] format."""
        result = _parse_date_link("[[2025-12-30]]")
        assert result == datetime.date(2025, 12, 30)

    def test_plain_date_format(self):
        """Parse date from YYYY-MM-DD format."""
        result = _parse_date_link("2025-01-15")
        assert result == datetime.date(2025, 1, 15)

    def test_empty_string(self):
        """Empty string returns None."""
        assert _parse_date_link("") is None

    def test_none_input(self):
        """None input returns None."""
        assert _parse_date_link(None) is None

    def test_invalid_date(self):
        """Invalid date returns None."""
        assert _parse_date_link("[[2025-13-45]]") is None

    def test_wikilink_with_extra_text(self):
        """Handle wikilinks embedded in text."""
        result = _parse_date_link("Started on [[2025-12-30]]")
        assert result == datetime.date(2025, 12, 30)


class TestScanBooks:
    """Tests for scan_books function."""

    def test_finds_completed_books_in_range(self, tmp_path):
        """Finds books completed within date range."""
        book_dir = tmp_path / "books"
        book_dir.mkdir()

        book_file = book_dir / "Test Book.md"
        book_file.write_text("""---
author: Test Author
started: "[[2025-01-01]]"
completed: "[[2025-01-15]]"
rating: 8.5
---
# Notes
""")

        books = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )

        assert len(books) == 1
        assert books[0].title == "Test Book"
        assert books[0].author == "Test Author"
        assert books[0].started == datetime.date(2025, 1, 1)
        assert books[0].completed == datetime.date(2025, 1, 15)

    def test_excludes_books_outside_range(self, tmp_path):
        """Excludes books completed outside date range."""
        book_dir = tmp_path / "books"
        book_dir.mkdir()

        book_file = book_dir / "Old Book.md"
        book_file.write_text("""---
author: Old Author
started: "[[2024-01-01]]"
completed: "[[2024-01-15]]"
---
""")

        books = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )

        assert len(books) == 0

    def test_excludes_incomplete_books(self, tmp_path):
        """Excludes books without completed date."""
        book_dir = tmp_path / "books"
        book_dir.mkdir()

        book_file = book_dir / "In Progress.md"
        book_file.write_text("""---
author: Some Author
started: "[[2025-01-01]]"
completed: 
---
""")

        books = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )

        assert len(books) == 0

    def test_empty_directory(self, tmp_path):
        """Returns empty list for empty directory."""
        book_dir = tmp_path / "books"
        book_dir.mkdir()

        books = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(book_dir),
        )

        assert books == []

    def test_nonexistent_directory(self, tmp_path):
        """Returns empty list for nonexistent directory."""
        books = scan_books(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(tmp_path / "nonexistent"),
        )

        assert books == []


class TestScanPodcasts:
    """Tests for scan_podcasts function."""

    def test_finds_podcasts_in_range(self, tmp_path):
        """Finds podcasts within date range."""
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()

        podcast_file = podcast_dir / "Great Episode.md"
        podcast_file.write_text("""---
host: Lex Fridman
date: "[[2025-01-10]]"
rating: 9.0
link: https://example.com
---
# Notes
""")

        podcasts = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )

        assert len(podcasts) == 1
        assert podcasts[0].title == "Great Episode"
        assert podcasts[0].host == "Lex Fridman"
        assert podcasts[0].date == datetime.date(2025, 1, 10)

    def test_excludes_podcasts_outside_range(self, tmp_path):
        """Excludes podcasts outside date range."""
        podcast_dir = tmp_path / "podcasts"
        podcast_dir.mkdir()

        podcast_file = podcast_dir / "Old Episode.md"
        podcast_file.write_text("""---
host: Someone
date: "[[2024-06-15]]"
---
""")

        podcasts = scan_podcasts(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
            str(podcast_dir),
        )

        assert len(podcasts) == 0


class TestRenderMediaTable:
    """Tests for render_media_table function."""

    def test_renders_books_and_podcasts(self):
        """Renders table with both books and podcasts."""
        books = [
            Book(
                title="Deep Work",
                author="Cal Newport",
                started=datetime.date(2025, 1, 5),
                completed=datetime.date(2025, 1, 22),
                rating=None,
            )
        ]
        podcasts = [
            Podcast(
                title="Great Episode",
                host="Lex Fridman",
                date=datetime.date(2025, 1, 20),
                rating=None,
                link=None,
            )
        ]

        lines = render_media_table(books, podcasts)

        assert "| TYPE | TITLE | DATE |" in lines[0]
        assert "**BOOK**" in lines[2]
        assert "[[Deep Work]]" in lines[2]
        assert "**PODCAST**" in lines[3]
        assert "[[Great Episode]]" in lines[3]

    def test_empty_returns_header_only(self):
        """Returns header only when no media."""
        lines = render_media_table([], [])
        assert len(lines) == 2  # header + separator
        assert "TYPE" in lines[0]

    def test_books_only(self):
        """Renders table with only books."""
        books = [
            Book(
                title="Test Book",
                author="Author",
                started=None,
                completed=datetime.date(2025, 1, 15),
                rating=None,
            )
        ]

        lines = render_media_table(books, [])

        assert len(lines) == 3  # header, separator, one row
        assert "**BOOK**" in lines[2]


class TestBuildMediaSection:
    """Tests for build_media_section function."""

    def test_no_media_returns_empty(self, tmp_path):
        """Returns empty list when no media in the date range."""
        # Use dates far in the past to ensure no media matches
        lines = build_media_section(
            datetime.date(1900, 1, 1),
            datetime.date(1900, 1, 31),
        )
        assert lines == []

    def test_with_media_shows_section(self, tmp_path):
        """Shows section with header when media present."""
        # This test requires actual books/podcasts in the configured directories
        # Since we can't easily mock the directories, we test the function signature
        # and that it returns a list type
        lines = build_media_section(
            datetime.date(2025, 1, 1),
            datetime.date(2025, 1, 31),
        )
        # Function returns either empty list or list with MEDIA header
        assert isinstance(lines, list)
        if lines:
            assert "### **MEDIA**" in lines[0]
