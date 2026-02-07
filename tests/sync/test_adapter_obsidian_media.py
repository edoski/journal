"""Contract tests for ObsidianMediaSource adapter."""

from __future__ import annotations

import datetime

from sync.adapters.obsidian_media import ObsidianMediaSource


class _StubMediaCacheStore:
    def __init__(self) -> None:
        self.state = {"books": {}, "podcasts": {}}

    def load(self):
        return self.state

    def save(self, state):
        self.state = state


def test_scan_delegates_to_readers(monkeypatch):
    start = datetime.date(2026, 1, 1)
    end = datetime.date(2026, 1, 31)

    monkeypatch.setattr(
        "sync.adapters.obsidian_media.scan_books",
        lambda _start, _end, _books_dir, *, cached_dates: (
            ["book"],
            cached_dates,
            False,
        ),
    )
    monkeypatch.setattr(
        "sync.adapters.obsidian_media.scan_podcasts",
        lambda _start, _end, _podcasts_dir, *, cached_dates: (
            ["podcast"],
            cached_dates,
            False,
        ),
    )

    adapter = ObsidianMediaSource(
        "/tmp/books",
        "/tmp/podcasts",
        media_cache_store=_StubMediaCacheStore(),
    )
    bundle = adapter.scan(start, end)

    assert bundle.books == ["book"]
    assert bundle.podcasts == ["podcast"]
