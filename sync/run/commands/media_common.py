"""Shared dependencies and constants for media note commands."""

from __future__ import annotations

import datetime
from collections.abc import Callable
from dataclasses import dataclass

from sync.config import PATHS, PathConfig
from sync.ports.cache import MediaDateCacheStore

YOUTUBE_OEMBED_ENDPOINT = "https://www.youtube.com/oembed"
BOOK_TEMPLATE_FILENAME = "book.md"
PODCAST_TEMPLATE_FILENAME = "podcast.md"
BOOK_FRONTMATTER_KEYS = ("author", "started", "completed", "rating")
HIGHLIGHTS_SECTION_TITLE = "Highlights"
REFLECTIONS_SECTION_TITLE = "Reflections"
REFLECTIONS_PLACEHOLDER = "_No reflections have been made yet._"


@dataclass(frozen=True)
class MediaCommandDeps:
    """Runtime dependencies for media note commands."""

    paths: PathConfig
    media_cache_store_factory: Callable[[], MediaDateCacheStore]
    today: Callable[[], datetime.date]


def default_media_command_deps() -> MediaCommandDeps:
    """Return the default runtime dependencies for media commands."""
    from sync.adapters.json_media_cache import JsonMediaDateCacheStore

    return MediaCommandDeps(
        paths=PATHS,
        media_cache_store_factory=JsonMediaDateCacheStore,
        today=datetime.date.today,
    )
