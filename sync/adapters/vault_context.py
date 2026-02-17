"""Vault context source adapter."""

from __future__ import annotations

import datetime

from sync.contracts.notes import VaultFileRecord
from sync.daily.context import files_for_session, get_vault_files_modified_on_date
from sync.ports.context import ContextSource


class VaultContextSource(ContextSource):
    """Filesystem-backed context source for vault modification links."""

    def files_modified_on_date(self, day: datetime.date) -> list[VaultFileRecord]:
        """Return vault file metadata for files touched on the supplied day."""
        return get_vault_files_modified_on_date(day)

    def links_for_window(
        self,
        files: list[VaultFileRecord],
        start: datetime.datetime,
        end: datetime.datetime,
    ) -> list[str]:
        """Return wikilinks modified during a study session time window."""
        return files_for_session(files, start, end)
