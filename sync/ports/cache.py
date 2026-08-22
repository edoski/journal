"""Stable cache store ports."""

from __future__ import annotations

from typing import Protocol

from sync.contracts.cache import MediaDateCacheState


class MediaDateCacheStore(Protocol):
    """Read/write API for media date cache."""

    def load(self) -> MediaDateCacheState:
        """Load media date cache."""
        ...

    def save(self, state: MediaDateCacheState) -> None:
        """Persist media date cache."""
        ...
