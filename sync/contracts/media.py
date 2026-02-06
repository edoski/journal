"""Typed contracts for media scanning."""

from __future__ import annotations

from dataclasses import dataclass

from sync.models.media import Book, Podcast


@dataclass(frozen=True)
class MediaBundle:
    """Media items discovered for a date window."""

    books: list[Book]
    podcasts: list[Podcast]
