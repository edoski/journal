"""
Period metrics computation for the journal sync system.

Provides functions for aggregating study, sleep, mood, and training
metrics across date ranges, and computing period-over-period deltas.
"""

from __future__ import annotations

from .aggregation import (
    aggregate_activity_totals,
    aggregate_interrupt_overrun,
    aggregate_screen_time,
    aggregate_training_type_session_stats,
    compute_period_metrics,
)
from .comparison import (
    compute_moving_average,
    compute_period_deltas,
    group_screen_time_by_percent,
)
from .loading import (
    load_daily_data,
    load_daily_data_for_dates,
    load_prior_period_metrics,
)

__all__ = [
    "load_daily_data_for_dates",
    "load_daily_data",
    "load_prior_period_metrics",
    "compute_period_metrics",
    "aggregate_activity_totals",
    "aggregate_interrupt_overrun",
    "aggregate_screen_time",
    "aggregate_training_type_session_stats",
    "group_screen_time_by_percent",
    "compute_period_deltas",
    "compute_moving_average",
]
