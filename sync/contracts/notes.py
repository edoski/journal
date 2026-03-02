"""Typed contracts for note and vault metadata payloads."""

from __future__ import annotations

import datetime
from typing import TypedDict


class VaultFileRecord(TypedDict):
    """Vault file metadata used for context links."""

    path: str
    basename: str
    mtime: datetime.datetime
    created_at: datetime.datetime
