"""Media source port."""

from __future__ import annotations

import datetime
from typing import Protocol

from sync.contracts.media import MediaBundle


class MediaSource(Protocol):
    """Scans media items for a date window."""

    def scan(self, start: datetime.date, end: datetime.date) -> MediaBundle:
        """Return books/podcasts for the supplied range."""
        ...
