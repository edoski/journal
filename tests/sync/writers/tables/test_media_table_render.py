"""Tests for media table rendering using table specs."""

from __future__ import annotations

import datetime

from sync.contracts.media import MediaItem
from sync.writers.tables import SimpleGridTableSpec, render_table


def _render_media_table(items: list[MediaItem]) -> list[str]:
    rows = [
        [
            f"**{item.kind}**",
            item.author,
            f"[[{item.title}]]",
            f"`{item.date:%Y-%m-%d}`",
        ]
        for item in items
    ]
    return render_table(
        SimpleGridTableSpec(
            headers=["TYPE", "AUTHOR", "TITLE", "DATE"],
            divider_cells=["----", "------", "-----", "----"],
            rows=rows,
        )
    )


class TestRenderMediaTable:
    def test_renders_books_and_podcasts(self):
        items = [
            MediaItem(
                kind="BOOK",
                author="Cal Newport",
                title="Deep Work",
                date=datetime.date(2025, 1, 22),
            ),
            MediaItem(
                kind="PODCAST",
                author="Great Host",
                title="Great Episode",
                date=datetime.date(2025, 1, 20),
            ),
        ]

        lines = _render_media_table(items)
        assert "| TYPE | AUTHOR | TITLE | DATE |" in lines[0]
        assert lines[2] == "| **BOOK** | Cal Newport | [[Deep Work]] | `2025-01-22` |"
        assert lines[3] == (
            "| **PODCAST** | Great Host | [[Great Episode]] | `2025-01-20` |"
        )

    def test_empty_returns_header_only(self):
        lines = _render_media_table([])
        assert len(lines) == 2
        assert "TYPE" in lines[0]
        assert "AUTHOR" in lines[0]

    def test_books_only(self):
        items = [
            MediaItem(
                kind="BOOK",
                author="Test Author",
                title="Test Book",
                date=datetime.date(2025, 1, 15),
            )
        ]
        lines = _render_media_table(items)
        assert len(lines) == 3
        assert "**BOOK**" in lines[2]
