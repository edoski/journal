"""Daily aggregate source port."""

from __future__ import annotations

import datetime
from typing import Protocol

from sync.contracts.metrics import DailyAggregate


class DailyAggregateSource(Protocol):
    """Loads parsed daily aggregates for explicit date windows."""

    def load_for_dates(
        self,
        dates: list[datetime.date],
    ) -> dict[datetime.date, DailyAggregate]:
        """Load aggregates keyed by date."""
        ...
