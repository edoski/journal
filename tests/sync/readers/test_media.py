"""Pure media-note parser tests."""

from __future__ import annotations

import datetime

import pytest

from sync.readers.media import (
    parse_book_note,
    parse_media_date,
    parse_podcast_note,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("[[2026-01-02]]", datetime.date(2026, 1, 2)),
        ("heard on [[2026-01-03]]", datetime.date(2026, 1, 3)),
        ("2026-01-04", datetime.date(2026, 1, 4)),
        ("2026-99-99", None),
        ("", None),
    ],
)
def test_parse_media_date(value: str, expected: datetime.date | None) -> None:
    assert parse_media_date(value) == expected


def test_parse_book_note_returns_canonical_book() -> None:
    book = parse_book_note(
        "Book",
        [
            "---",
            "completed: '[[2026-01-02]]'",
            "author: Author",
            "rating: 8.5",
            "---",
        ],
    )

    assert book is not None
    assert (book.title, book.author, book.completed, book.rating) == (
        "Book",
        "Author",
        datetime.date(2026, 1, 2),
        8.5,
    )


def test_parse_podcast_note_normalizes_optional_fields() -> None:
    podcast = parse_podcast_note(
        "Episode",
        [
            "---",
            "date: 2026-01-03",
            "host: Host",
            "rating: invalid",
            "link:",
            "---",
        ],
    )

    assert podcast is not None
    assert (podcast.title, podcast.host, podcast.date) == (
        "Episode",
        "Host",
        datetime.date(2026, 1, 3),
    )
    assert podcast.rating is None
    assert podcast.link is None


def test_parsers_reject_notes_without_canonical_dates() -> None:
    lines = ["---", "author: Missing Date", "---"]

    assert parse_book_note("Book", lines) is None
    assert parse_podcast_note("Episode", lines) is None
