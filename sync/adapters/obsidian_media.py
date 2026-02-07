"""Obsidian markdown media source adapter."""

from __future__ import annotations

import datetime

from sync.constants import BOOKS_DIR, PODCASTS_DIR
from sync.contracts.media import MediaBundle
from sync.ports.cache import MediaDateCacheStore
from sync.ports.media import MediaSource
from sync.readers.media import scan_books, scan_podcasts


class ObsidianMediaSource(MediaSource):
    """Filesystem-backed media scanner for books and podcasts."""

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
        """Scan and return media items completed within date range."""
        cache = self.media_cache_store.load()
        books, book_cache, books_modified = scan_books(
            start,
            end,
            self.books_dir,
            cached_dates=cache.get("books", {}),
        )
        podcasts, podcast_cache, podcasts_modified = scan_podcasts(
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
