"""Tests for media table rendering using table specs."""

from __future__ import annotations

import datetime

from sync.contracts.media import Book, Podcast
from sync.writers.tables import SimpleGridTableSpec, render_table


def _render_media_table(books: list[Book], podcasts: list[Podcast]) -> list[str]:
    rows: list[list[str]] = []
    for book in books:
        rows.append(["**BOOK**", f"[[{book.title}]]", f"`{book.completed:%Y-%m-%d}`"])
    for podcast in podcasts:
        rows.append(
            ["**PODCAST**", f"[[{podcast.title}]]", f"`{podcast.date:%Y-%m-%d}`"]
        )
    return render_table(
        SimpleGridTableSpec(
            headers=["TYPE", "TITLE", "DATE"],
            divider_cells=["----", "-----", "----"],
            rows=rows,
        )
    )


class TestRenderMediaTable:
    def test_renders_books_and_podcasts(self):
        books = [
            Book(
                title="Deep Work",
                author="Cal Newport",
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

        lines = _render_media_table(books, podcasts)
        assert "| TYPE | TITLE | DATE |" in lines[0]
        assert "**BOOK**" in lines[2]
        assert "[[Deep Work]]" in lines[2]
        assert "**PODCAST**" in lines[3]
        assert "[[Great Episode]]" in lines[3]

    def test_empty_returns_header_only(self):
        lines = _render_media_table([], [])
        assert len(lines) == 2
        assert "TYPE" in lines[0]

    def test_books_only(self):
        books = [
            Book(
                title="Test Book",
                author="Author",
                completed=datetime.date(2025, 1, 15),
                rating=None,
            )
        ]
        lines = _render_media_table(books, [])
        assert len(lines) == 3
        assert "**BOOK**" in lines[2]
