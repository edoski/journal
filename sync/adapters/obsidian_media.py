"""Obsidian markdown media source adapter."""

from __future__ import annotations

import datetime

from sync.constants import BOOKS_DIR, PODCASTS_DIR
from sync.contracts.media import MediaBundle
from sync.ports.media import MediaSource
from sync.readers.media import scan_books, scan_podcasts


class ObsidianMediaSource(MediaSource):
    """Filesystem-backed media scanner for books and podcasts."""

    def __init__(
        self,
        books_dir: str = BOOKS_DIR,
        podcasts_dir: str = PODCASTS_DIR,
    ) -> None:
        self.books_dir = books_dir
        self.podcasts_dir = podcasts_dir

    def scan(self, start: datetime.date, end: datetime.date) -> MediaBundle:
        """Scan and return media items completed within date range."""
        books = scan_books(start, end, self.books_dir)
        podcasts = scan_podcasts(start, end, self.podcasts_dir)
        return MediaBundle(books=books, podcasts=podcasts)
