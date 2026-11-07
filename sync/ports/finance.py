"""Finance source port."""

from __future__ import annotations

import datetime
from typing import Protocol

from sync.contracts.finance import FinanceBundle


class FinanceUnavailableError(RuntimeError):
    """Finance is set up but its data cannot be read; the message is the reason."""


class FinanceSource(Protocol):
    """Loads categorised bank entries for a date window."""

    def load(self, start: datetime.date, end: datetime.date) -> FinanceBundle | None:
        """Return entries booked from start to end, or None when not set up.

        Raises FinanceUnavailableError when the store or the rules cannot be read.
        """
        ...
