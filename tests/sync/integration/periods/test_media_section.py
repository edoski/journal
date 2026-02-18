"""Integration tests for period MEDIA section assembly."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaBundle
from sync.contracts.media import Book
from sync.periods.sections import append_media_section


class TestAppendMediaSection:
    def test_no_media_bundle_does_not_append_section(self):
        sections: list[list[str]] = []
        append_media_section(sections, MediaBundle(books=[], podcasts=[]))
        assert sections == []

    def test_media_bundle_appends_media_section(self):
        sections: list[list[str]] = []
        bundle = MediaBundle(
            books=[
                Book(
                    title="Deep Work",
                    author="Cal Newport",
                    started=datetime.date(2025, 1, 5),
                    completed=datetime.date(2025, 1, 22),
                    rating=None,
                )
            ],
            podcasts=[],
        )

        append_media_section(sections, bundle)
        assert len(sections) == 1
        media_lines = sections[0]
        assert media_lines[0] == "### **MEDIA**"
        assert "| **BOOK** | [[Deep Work]] | `2025-01-22` |" in media_lines
