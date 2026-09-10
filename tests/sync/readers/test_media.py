"""Pure media-note parser tests."""

from __future__ import annotations

import datetime

import pytest

from sync.readers.media import (
    parse_book_note,
    parse_media_date,
    parse_podcast_note,
    parse_series_index,
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
            "---",
        ],
    )

    assert book is not None
    assert (book.title, book.author, book.completed) == (
        "Book",
        "Author",
        datetime.date(2026, 1, 2),
    )


def test_parse_podcast_note_normalizes_optional_fields() -> None:
    podcast = parse_podcast_note(
        "Episode",
        [
            "---",
            "date: 2026-01-03",
            "host: Host",
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
    assert podcast.link is None
    assert podcast.visible is False


def test_parse_podcast_note_preserves_colons_in_link() -> None:
    podcast = parse_podcast_note(
        "Episode",
        [
            "---",
            "date: 2026-01-03",
            "link: https://example.test/episode",
            "---",
        ],
    )

    assert podcast is not None
    assert podcast.link == "https://example.test/episode"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("true", True),
        ("True", True),
        ("  true  ", True),
        ("false", False),
        ("yes", False),
        ("", False),
    ],
)
def test_parse_podcast_note_reads_visible_checkbox(value: str, expected: bool) -> None:
    podcast = parse_podcast_note(
        "Episode",
        ["---", "date: 2026-01-03", f"visible: {value}", "---"],
    )

    assert podcast is not None
    assert podcast.visible is expected


@pytest.mark.parametrize(
    ("frontmatter", "expected"),
    [
        (["visible: true"], True),
        (["visible: True"], True),
        (["visible: false"], False),
        (["host: Host"], False),
        ([], False),
    ],
)
def test_parse_series_index_reads_visibility_from_the_index_note(
    frontmatter: list[str], expected: bool
) -> None:
    lines = ["---", *frontmatter, "---", "| EPISODE | DATE |"]

    assert parse_series_index(lines).visible is expected


@pytest.mark.parametrize(
    ("frontmatter", "expected"),
    [
        (["visible: true", "host: Host"], "Host"),
        (["host:"], ""),
        ([], ""),
    ],
)
def test_parse_series_index_reads_the_host_from_the_index_note(
    frontmatter: list[str], expected: str
) -> None:
    lines = ["---", *frontmatter, "---", "| EPISODE | DATE |"]

    assert parse_series_index(lines).host == expected


def test_parse_series_index_hides_an_index_note_without_frontmatter() -> None:
    index = parse_series_index(["| EPISODE | DATE |"])

    assert (index.visible, index.host) == (False, "")


def test_parsers_reject_notes_without_canonical_dates() -> None:
    lines = ["---", "author: Missing Date", "---"]

    assert parse_book_note("Book", lines) is None
    assert parse_podcast_note("Episode", lines) is None
