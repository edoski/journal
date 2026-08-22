"""Typed contracts for cache payloads."""

from __future__ import annotations

from typing import TypedDict


class MediaDateCacheState(TypedDict):
    """Date cache for media notes used to heal frontmatter corruption."""

    podcasts: dict[str, str]
    books: dict[str, str]
