"""Media source port."""

from __future__ import annotations

import datetime
from typing import Protocol

from sync.contracts.media import MediaBundle


class MediaSource(Protocol):
    """Scans media items for a date window."""

    def scan(self, start: datetime.date, end: datetime.date) -> MediaBundle:
        """Return period-ready media items for the supplied range."""
        ...
