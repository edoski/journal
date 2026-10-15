"""Finance store adapter: the only sync module that imports `finance`.

It reads through `finance.read.read_entries`, which opens the store
read-only and applies the category rules. No store means finance is not set
up and the period notes render nothing new; a store or rules file that cannot
be read raises FinanceUnavailableError, which the period sync shows as one line
in the FINANCES section while every other section renders as usual.
"""

from __future__ import annotations

import datetime
from pathlib import Path

from finance.read import FinanceReadError, read_entries
from sync.constants import FINANCE_DIR
from sync.contracts.finance import FinanceBundle, FinanceEntry
from sync.log import get_logger
from sync.ports.finance import FinanceSource, FinanceUnavailableError

logger = get_logger(__name__)
_warned_currency = False

__all__ = ["FinanceStoreSource", "FinanceUnavailableError"]


class FinanceStoreSource(FinanceSource):
    """Bank entries from the local finance store."""

    def __init__(self, finance_dir: str | None = None) -> None:
        self.finance_dir = finance_dir or FINANCE_DIR

    def load(self, start: datetime.date, end: datetime.date) -> FinanceBundle | None:
        try:
            found = read_entries(start, end, root=Path(self.finance_dir))
        except FinanceReadError as exc:
            raise FinanceUnavailableError(str(exc)) from exc
        if found is None:
            return None
        global _warned_currency
        if found.other_currency and not _warned_currency:
            _warned_currency = True
            logger.warning(
                "%d transactions not in EUR are left out of the notes",
                found.other_currency,
            )
        return FinanceBundle(
            entries=tuple(
                FinanceEntry(
                    day=entry.day,
                    flow=entry.flow,
                    category=entry.category,
                    role=entry.role,
                    description=entry.description,
                    amount_cents=entry.amount_cents,
                )
                for entry in found.entries
            ),
            covered_from=found.covered_from,
            zero_before=found.zero_before,
        )
