"""Contract tests for ObsidianMediaSource adapter."""

from __future__ import annotations

import datetime

from sync.adapters.obsidian_media import ObsidianMediaSource


def test_scan_delegates_to_readers(monkeypatch):
    start = datetime.date(2026, 1, 1)
    end = datetime.date(2026, 1, 31)

    monkeypatch.setattr(
        "sync.adapters.obsidian_media.scan_books",
        lambda _start, _end, _books_dir: ["book"],
    )
    monkeypatch.setattr(
        "sync.adapters.obsidian_media.scan_podcasts",
        lambda _start, _end, _podcasts_dir: ["podcast"],
    )

    adapter = ObsidianMediaSource("/tmp/books", "/tmp/podcasts")
    bundle = adapter.scan(start, end)

    assert bundle.books == ["book"]
    assert bundle.podcasts == ["podcast"]
