"""Observable contract tests for ObsidianMediaSource."""

from __future__ import annotations

import datetime
from pathlib import Path

from sync.adapters.obsidian_media import ObsidianMediaSource


class _StubMediaCacheStore:
    def __init__(self, state: dict | None = None) -> None:
        self.state = state or {"books": {}, "podcasts": {}}
        self.saved: list[dict] = []

    def load(self):
        return self.state

    def save(self, state):
        self.state = state
        self.saved.append(state)


def _write_note(path: Path, frontmatter: list[str]) -> None:
    path.write_text(
        "\n".join(["---", *frontmatter, "---", "Body"]),
        encoding="utf-8",
    )


def test_scan_returns_sorted_in_range_media_and_updates_cache(tmp_path: Path) -> None:
    books_dir = tmp_path / "books"
    podcasts_dir = tmp_path / "podcasts"
    books_dir.mkdir()
    podcasts_dir.mkdir()
    _write_note(
        books_dir / "Later.md",
        ["completed: '[[2026-01-20]]'", "author: B", "rating: 8.5"],
    )
    _write_note(
        books_dir / "Earlier.md",
        ["completed: 2026-01-05", "author: A"],
    )
    _write_note(
        books_dir / "Outside.md",
        ["completed: 2025-12-31", "author: C"],
    )
    _write_note(
        podcasts_dir / "Episode.md",
        [
            "date: 2026-01-10",
            "host: Host",
            "rating: 9",
            "link: https://example.test/episode",
        ],
    )
    cache = _StubMediaCacheStore()

    bundle = ObsidianMediaSource(
        str(books_dir),
        str(podcasts_dir),
        media_cache_store=cache,
    ).scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    assert [book.title for book in bundle.books] == ["Earlier", "Later"]
    assert bundle.books[1].author == "B"
    assert bundle.books[1].rating == 8.5
    assert [podcast.title for podcast in bundle.podcasts] == ["Episode"]
    assert bundle.podcasts[0].link == "https://example.test/episode"
    assert cache.state == {
        "books": {
            "Earlier": "2026-01-05",
            "Later": "2026-01-20",
            "Outside": "2025-12-31",
        },
        "podcasts": {"Episode": "2026-01-10"},
    }
    assert len(cache.saved) == 1


def test_scan_heals_corrupted_date_from_cache(tmp_path: Path) -> None:
    books_dir = tmp_path / "books"
    podcasts_dir = tmp_path / "podcasts"
    books_dir.mkdir()
    podcasts_dir.mkdir()
    book_path = books_dir / "Book.md"
    _write_note(
        book_path,
        ["completed: 2026-02-01", "author: Author"],
    )
    cache = _StubMediaCacheStore(
        {
            "books": {"Book": "2026-01-15"},
            "podcasts": {},
        }
    )

    bundle = ObsidianMediaSource(
        str(books_dir),
        str(podcasts_dir),
        media_cache_store=cache,
    ).scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    assert bundle.books[0].completed == datetime.date(2026, 1, 15)
    assert "completed: 2026-01-15" in book_path.read_text(encoding="utf-8")
    assert not book_path.with_suffix(".md.tmp").exists()
    assert cache.saved == []


def test_scan_ignores_missing_directories_and_malformed_notes(tmp_path: Path) -> None:
    books_dir = tmp_path / "books"
    books_dir.mkdir()
    _write_note(books_dir / "Invalid.md", ["author: Nobody"])
    cache = _StubMediaCacheStore()

    bundle = ObsidianMediaSource(
        str(books_dir),
        str(tmp_path / "missing-podcasts"),
        media_cache_store=cache,
    ).scan(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))

    assert bundle.books == []
    assert bundle.podcasts == []
    assert cache.saved == []
