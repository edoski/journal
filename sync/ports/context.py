"""Vault context source port."""

from __future__ import annotations

import datetime
from typing import Protocol

from sync.contracts.notes import VaultFileRecord


class ContextSource(Protocol):
    """Provides vault file context for study sessions."""

    def files_modified_on_date(self, day: datetime.date) -> list[VaultFileRecord]:
        """Return modified files for a date."""
        ...

    def links_for_window(
        self,
        files: list[VaultFileRecord],
        start: datetime.datetime,
        end: datetime.datetime,
    ) -> list[str]:
        """Return wiki links modified during a time window."""
        ...
