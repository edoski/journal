"""Integration tests for period MEDIA section assembly."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaBundle
from sync.contracts.media import Book, Podcast, PodcastSeries
from sync.periods.sections import append_media_section


class TestAppendMediaSection:
    def test_no_media_bundle_does_not_append_section(self):
        sections: list[list[str]] = []
        append_media_section(sections, MediaBundle(books=[], podcasts=[], series=[]))
        assert sections == []

    def test_media_bundle_appends_media_section(self):
        sections: list[list[str]] = []
        bundle = MediaBundle(
            books=[
                Book(
                    title="Deep Work",
                    author="Cal Newport",
                    completed=datetime.date(2025, 1, 22),
                    rating=None,
                )
            ],
            podcasts=[],
            series=[],
        )

        append_media_section(sections, bundle)
        assert len(sections) == 1
        media_lines = sections[0]
        assert media_lines[0] == "### **MEDIA**"
        assert "| **BOOK** | [[Deep Work]] | `2025-01-22` |" in media_lines

    def test_series_entries_share_one_date_ordered_run_with_podcasts(self):
        sections: list[list[str]] = []
        bundle = MediaBundle(
            books=[],
            podcasts=[
                Podcast(
                    title="Loose Episode",
                    host="Host",
                    date=datetime.date(2025, 1, 20),
                    rating=None,
                    link=None,
                    visible=True,
                )
            ],
            series=[
                PodcastSeries(title="Genesis", date=datetime.date(2025, 1, 8)),
                PodcastSeries(title="Exodus", date=datetime.date(2025, 1, 30)),
            ],
        )

        append_media_section(sections, bundle)
        rows = [line for line in sections[0] if line.startswith("| **PODCAST**")]
        assert rows == [
            "| **PODCAST** | [[Genesis]] | `2025-01-08` |",
            "| **PODCAST** | [[Loose Episode]] | `2025-01-20` |",
            "| **PODCAST** | [[Exodus]] | `2025-01-30` |",
        ]

    def test_series_only_bundle_still_appends_section(self):
        sections: list[list[str]] = []
        bundle = MediaBundle(
            books=[],
            podcasts=[],
            series=[PodcastSeries(title="Genesis", date=datetime.date(2025, 1, 8))],
        )

        append_media_section(sections, bundle)
        assert "| **PODCAST** | [[Genesis]] | `2025-01-08` |" in sections[0]
